"""AnkiSession — deep module owning "is Anki reachable?".

Extracted from BridgeApp (Candidate A). Absorbs the whole Anki desktop
lifecycle plus the AnkiConnect RPC layer behind a narrow interface:

    status()                  -> status payload dict
    ensure_ready()            -> launches/waits until the collection is ready
    repair()                  -> kill + relaunch cycle, returns result dict
    ensure_connect_enabled()  -> heals meta.json version-cap (the recurring
                                 "Anki Bridge Offline" root cause)
    connect_status()          -> (bool, detail)
    collection_ready_status() -> (bool, detail)
    connect_available()       -> bool
    invoke(action, params)    -> AnkiConnect RPC result

Everything else (process inspection, taskkill/Stop-Process cascade,
ShellExecute launch, env scrubbing, prefs21 pickle) is internal.
"""

from __future__ import annotations

import ctypes
import json
import logging
import os
import sqlite3
import subprocess
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Any

import requests


LOGGER = logging.getLogger("anki_bridge")

MAX_SUPPORTED_POINT_VERSION = 2147483647


def _now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


class AnkiRepairBlockedError(RuntimeError):
    def __init__(self, payload: dict[str, Any]) -> None:
        self.payload = payload
        super().__init__(str(payload.get("detail") or "anki_repair_blocked"))


class AnkiSession:
    def __init__(self, config: dict[str, Any]) -> None:
        self.anki_connect_url = config.get("anki_connect_url", "http://127.0.0.1:8765")
        self.anki_executable = config.get("anki_executable", "")
        self.anki_base_path = config.get("anki_base_path", "")
        self.anki_profile = config.get("anki_profile", "")
        self.anki_wait_timeout_sec = int(config.get("anki_wait_timeout_sec", 90))
        self.anki_poll_interval_sec = int(config.get("anki_poll_interval_sec", 2))
        self.anki_launch_attempts = int(config.get("anki_launch_attempts", 2))
        self.anki_launch_grace_sec = int(config.get("anki_launch_grace_sec", 30))
        self.anki_repair_lock = threading.Lock()

    # ------------------------------------------------------------------
    # AnkiConnect RPC layer
    # ------------------------------------------------------------------
    def invoke(self, action: str, params: dict[str, Any] | None = None, timeout: int = 20) -> Any:
        response = requests.post(
            self.anki_connect_url,
            json={"action": action, "version": 6, "params": params or {}},
            timeout=timeout,
        )
        data = response.json()
        if data.get("error"):
            raise RuntimeError(str(data["error"]))
        return data.get("result")

    def connect_available(self) -> bool:
        ready, _ = self.connect_status()
        return ready

    def connect_status(self) -> tuple[bool, str]:
        try:
            r = requests.post(
                self.anki_connect_url,
                json={"action": "version", "version": 6},
                timeout=3,
            )
            data = r.json()
            if data.get("error"):
                return False, f"version error: {data['error']}"
            return True, "version ok"
        except Exception as exc:  # noqa: BLE001
            return False, f"{type(exc).__name__}: {exc}"

    def _anki_collection_ready(self) -> bool:
        ready, _ = self.collection_ready_status()
        return ready

    def collection_ready_status(self) -> tuple[bool, str]:
        available, detail = self.connect_status()
        if not available:
            return False, detail
        try:
            payload = {"action": "deckNames", "version": 6}
            r = requests.post(self.anki_connect_url, json=payload, timeout=5)
            data = r.json()
            if data.get("error"):
                return False, f"deckNames error: {data['error']}"
            return True, "collection ready"
        except Exception as exc:  # noqa: BLE001
            return False, f"{type(exc).__name__}: {exc}"

    # ------------------------------------------------------------------
    # meta.json version-cap healing
    # ------------------------------------------------------------------
    def ensure_connect_enabled(self) -> None:
        """Impede que atualizacoes do Anki desabilitem o AnkiConnect.

        O AnkiConnect se auto-desativa quando a versao do Anki ultrapassa o
        `max_point_version` gravado no meta.json do add-on. Isso derruba a
        porta 8765 em silencio e o painel fica "offline" mesmo com o bridge e
        o Anki no ar. A cada boot do bridge elevamos o teto e reabilitamos o
        add-on (efetivo no proximo start do Anki, que o bridge ja gerencia).
        E uma das duas causas-raiz historicas do "Anki Bridge Offline"; a
        outra (bridge morto sem quem o reinicie) e coberta pelo watchdog."""
        try:
            base = Path(self.anki_base_path) if self.anki_base_path else None
            if not base or not base.exists():
                return
            addons_dir = base / "addons21"
            if not addons_dir.exists():
                return
            for meta_path in addons_dir.glob("*/meta.json"):
                try:
                    meta = json.loads(meta_path.read_text(encoding="utf-8"))
                except (OSError, json.JSONDecodeError):
                    continue
                if not isinstance(meta, dict):
                    continue
                name = str(meta.get("name") or "").casefold()
                folder = meta_path.parent.name
                # AnkiConnect: id oficial 2055492159; fallback pelo nome.
                if folder != "2055492159" and "ankiconnect" not in name:
                    continue
                changed = False
                if meta.get("disabled"):
                    meta["disabled"] = False
                    changed = True
                try:
                    current_max = int(meta.get("max_point_version") or 0)
                except (TypeError, ValueError):
                    current_max = 0
                if 0 <= current_max < MAX_SUPPORTED_POINT_VERSION:
                    meta["max_point_version"] = MAX_SUPPORTED_POINT_VERSION
                    changed = True
                if changed:
                    try:
                        meta_path.write_text(
                            json.dumps(meta, ensure_ascii=False), encoding="utf-8"
                        )
                        LOGGER.info(
                            "AnkiConnect reabilitado/teto de versao elevado em %s", meta_path
                        )
                    except OSError as exc:
                        LOGGER.warning(
                            "Falha ao ajustar AnkiConnect meta.json %s: %s", meta_path, exc
                        )
                return
        except Exception as exc:  # noqa: BLE001
            LOGGER.warning("ensure_connect_enabled falhou: %s", exc)

    # ------------------------------------------------------------------
    # Launch command / profile detection
    # ------------------------------------------------------------------
    def _anki_launch_command(self) -> list[str]:
        if not self.anki_executable:
            return []
        command = [str(Path(self.anki_executable))]
        if self.anki_base_path:
            command.extend(["-b", self.anki_base_path])
        if self.anki_profile and not self._anki_last_loaded_profile_matches_config():
            command.extend(["-p", self.anki_profile])
        return command

    def _anki_prefs_db_path(self) -> Path | None:
        if not self.anki_base_path:
            return None
        return Path(self.anki_base_path) / "prefs21.db"

    def _anki_last_loaded_profile_name(self) -> str | None:
        prefs_path = self._anki_prefs_db_path()
        if not prefs_path or not prefs_path.exists():
            return None
        try:
            import pickle

            with sqlite3.connect(prefs_path) as conn:
                row = conn.execute(
                    "select cast(data as blob) from profiles where name = '_global'"
                ).fetchone()
            if not row or not row[0]:
                return None
            meta = pickle.loads(row[0])
            value = meta.get("last_loaded_profile_name") if isinstance(meta, dict) else None
            return str(value) if value else None
        except Exception as exc:  # noqa: BLE001
            LOGGER.warning("Failed to read Anki last loaded profile from %s: %s", prefs_path, exc)
            return None

    def _anki_last_loaded_profile_matches_config(self) -> bool:
        if not self.anki_profile:
            return False
        last_loaded = self._anki_last_loaded_profile_name()
        if not last_loaded:
            return False
        matches = last_loaded.casefold() == self.anki_profile.casefold()
        if matches:
            LOGGER.info(
                "Anki last loaded profile already matches configured profile; launching without -p. profile=%s",
                self.anki_profile,
            )
        else:
            LOGGER.warning(
                "Anki last loaded profile differs from configured profile. lastLoaded=%s configured=%s",
                last_loaded,
                self.anki_profile,
            )
        return matches

    def _anki_launch_env(self, anki_dir: Path) -> dict[str, str]:
        env: dict[str, str] = {}
        path_value = ""
        blocked_prefixes = ("PYTHON", "UV_", "VIRTUAL_ENV", "CONDA")
        blocked_names = {
            "QT_PLUGIN_PATH",
            "QT_QPA_PLATFORM_PLUGIN_PATH",
            "PYCHARM_HOSTED",
        }
        for key, value in os.environ.items():
            upper = key.upper()
            if upper == "PATH":
                if value and not path_value:
                    path_value = value
                continue
            if upper in blocked_names or any(upper.startswith(prefix) for prefix in blocked_prefixes):
                continue
            env[key] = value

        path_entries = [str(anki_dir), str(anki_dir / "lib")]
        if path_value:
            path_entries.extend(path_value.split(os.pathsep))
        deduped_path: list[str] = []
        seen: set[str] = set()
        for entry in path_entries:
            clean = entry.strip()
            if not clean:
                continue
            key = clean.casefold()
            if key in seen:
                continue
            seen.add(key)
            deduped_path.append(clean)
        env["Path"] = os.pathsep.join(deduped_path)
        return env

    def _anki_process_roots(self) -> list[str]:
        roots: list[Path] = []
        if self.anki_executable:
            exe_path = Path(self.anki_executable)
            roots.append(exe_path.parent)
            for parent in exe_path.parents:
                if parent.name == "AnkiProgramFiles":
                    roots.append(parent)
                    break
        local_app_data = os.environ.get("LOCALAPPDATA")
        if local_app_data:
            roots.append(Path(local_app_data) / "AnkiProgramFiles")

        unique: list[str] = []
        seen: set[str] = set()
        for root in roots:
            root_text = str(root)
            key = root_text.casefold()
            if key not in seen:
                seen.add(key)
                unique.append(root_text)
        return unique

    def _ps_single_quote(self, value: str) -> str:
        return "'" + value.replace("'", "''") + "'"

    # ------------------------------------------------------------------
    # Process inspection / launch / kill
    # ------------------------------------------------------------------
    def _anki_processes(self) -> list[dict[str, Any]]:
        if os.name != "nt":
            return []
        ps_script = (
            "$ankiRoots = @("
            + ", ".join(self._ps_single_quote(root) for root in self._anki_process_roots())
            + "); "
            "$isAnkiPath = { param($path) "
            "foreach ($root in $ankiRoots) { "
            "if ($path -and $root -and $path -like ($root + '*')) { return $true } "
            "} "
            "return $false "
            "}; "
            "Get-Process -Name anki,python,pythonw -ErrorAction SilentlyContinue | "
            "Where-Object { "
            "$_.ProcessName -eq 'anki' "
            "-or $_.MainWindowTitle -like '*Anki*' "
            "-or (& $isAnkiPath $_.Path) "
            "} | "
            "Select-Object Id,ProcessName,Path,SessionId,MainWindowHandle,MainWindowTitle,Responding | "
            "ConvertTo-Json -Depth 4"
        )
        try:
            result = subprocess.run(
                ["powershell", "-NoProfile", "-Command", ps_script],
                check=False,
                text=True,
                capture_output=True,
                timeout=5,
            )
            raw = (result.stdout or "").strip()
            if raw:
                data = json.loads(raw)
                items = data if isinstance(data, list) else [data]
                rows = []
                for item in items:
                    handle = int(item.get("MainWindowHandle") or 0)
                    rows.append({
                        "image": item.get("ProcessName") or "anki",
                        "pid": int(item.get("Id") or 0),
                        "path": item.get("Path") or "",
                        "sessionId": item.get("SessionId"),
                        "mainWindowHandle": handle,
                        "mainWindowTitle": item.get("MainWindowTitle") or "",
                        "responding": bool(item.get("Responding", True)),
                        "visibleWindow": handle != 0,
                    })
                return [row for row in rows if row["pid"]]
        except Exception as exc:  # noqa: BLE001
            LOGGER.warning("PowerShell Anki process inspection failed: %s", exc)

        try:
            result = subprocess.run(
                ["tasklist", "/FI", "IMAGENAME eq anki.exe", "/FO", "CSV", "/NH"],
                check=False,
                text=True,
                capture_output=True,
                timeout=5,
            )
        except Exception as exc:  # noqa: BLE001
            LOGGER.warning("Failed to inspect Anki processes: %s", exc)
            return []
        rows: list[dict[str, Any]] = []
        for line in (result.stdout or "").splitlines():
            line = line.strip()
            if not line or line.upper().startswith("INFO:"):
                continue
            try:
                parts = [part.strip().strip('"') for part in line.split('","')]
                image = parts[0].strip('"')
                pid = int(parts[1])
            except Exception:  # noqa: BLE001
                continue
            rows.append({"image": image, "pid": pid})
        return rows

    def _launch_anki_desktop_with_popen(
        self,
        command: list[str],
        anki_path: Path,
    ) -> subprocess.Popen[Any] | None:
        startupinfo = None
        if os.name == "nt":
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startupinfo.wShowWindow = 1

        LOGGER.info("Launching Anki Desktop: %s", command)
        env = self._anki_launch_env(anki_path.parent)
        try:
            return subprocess.Popen(
                command,
                cwd=str(anki_path.parent),
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                stdin=subprocess.DEVNULL,
                close_fds=True,
                startupinfo=startupinfo,
                env=env,
            )
        except Exception as exc:  # noqa: BLE001
            LOGGER.warning("Failed to launch Anki Desktop with command %s: %s", command, exc)
            return None

    def _shell_execute_anki_desktop(self, anki_path: Path, args: list[str]) -> bool:
        params = subprocess.list2cmdline(args)
        LOGGER.info("Launching Anki Desktop via ShellExecute: %s %s", anki_path, params)
        try:
            result = ctypes.windll.shell32.ShellExecuteW(  # type: ignore[attr-defined]
                None,
                "open",
                str(anki_path),
                params,
                str(anki_path.parent),
                1,
            )
        except Exception as exc:  # noqa: BLE001
            LOGGER.warning("ShellExecute failed to launch Anki Desktop: %s", exc)
            return False
        if int(result) <= 32:
            LOGGER.warning("ShellExecute failed to launch Anki Desktop. result=%s path=%s args=%s", result, anki_path, args)
            return False
        return True

    def _launch_anki_desktop(self) -> subprocess.Popen[Any] | None:
        command = self._anki_launch_command()
        if not command:
            LOGGER.warning("Anki executable not configured")
            return None

        anki_path = Path(command[0])
        if not anki_path.exists():
            LOGGER.warning("Anki executable not found: %s", anki_path)
            return None

        return self._launch_anki_desktop_with_popen(command, anki_path)

    def _anki_launch_still_bootstrapping(
        self,
        proc: subprocess.Popen[Any] | None,
        status: dict[str, Any] | None = None,
    ) -> bool:
        if not proc or proc.poll() is None:
            return True
        if status and (status.get("connectAvailable") or status.get("processes")):
            return True
        return bool(self._anki_processes())

    def _all_anki_processes_invisible(self, processes: list[dict[str, Any]]) -> bool:
        return bool(processes) and not any(process.get("visibleWindow") for process in processes)

    def _clear_invisible_anki_processes(
        self,
        processes: list[dict[str, Any]],
        detail: str,
    ) -> bool:
        if not self._all_anki_processes_invisible(processes):
            return False
        LOGGER.warning(
            "Anki process exists without visible window and AnkiConnect is unavailable. "
            "Clearing stale process before relaunch. processes=%s detail=%s",
            processes,
            detail,
        )
        kill_result = self._kill_anki_processes()
        if kill_result.get("remaining"):
            LOGGER.warning("Failed to clear invisible Anki processes: %s", kill_result)
            self._raise_if_anki_repair_blocked(processes, kill_result, detail)
            return False
        time.sleep(2)
        return True

    def _anki_repair_blocked_payload(
        self,
        processes: list[dict[str, Any]],
        kill_result: dict[str, Any],
        detail: str,
    ) -> dict[str, Any]:
        pids = [int(process.get("pid") or 0) for process in processes if process.get("pid")]
        return {
            "code": "anki_repair_access_denied",
            "accessDenied": True,
            "processes": processes,
            "pids": pids,
            "kill": kill_result,
            "detail": (
                "O Windows recusou fechar o Anki invisivel. "
                "Os arquivos deste job ja foram gerados. Feche o Anki pelo Gerenciador de Tarefas "
                "como administrador ou reinicie o Windows, depois retente o job."
            ),
            "lastDetail": detail,
        }

    def _raise_if_anki_repair_blocked(
        self,
        processes: list[dict[str, Any]],
        kill_result: dict[str, Any],
        detail: str,
    ) -> None:
        if kill_result.get("accessDenied"):
            raise AnkiRepairBlockedError(self._anki_repair_blocked_payload(processes, kill_result, detail))

    def _taskkill_access_denied(self, results: list[dict[str, Any]]) -> bool:
        denied_markers = ("acesso negado", "access is denied", "access denied")
        return any(
            any(marker in f"{item.get('stdout', '')}\n{item.get('stderr', '')}".lower() for marker in denied_markers)
            for item in results
        )

    def _stop_anki_processes_with_powershell(self, pids: list[int]) -> dict[str, Any]:
        if os.name != "nt" or not pids:
            return {"attempted": False, "results": []}
        results: list[dict[str, Any]] = []
        for pid in pids:
            ps_script = (
                f"$ErrorActionPreference = 'Stop'; "
                f"$p = Get-Process -Id {int(pid)} -ErrorAction Stop; "
                "$p | Stop-Process -Force -ErrorAction Stop"
            )
            try:
                result = subprocess.run(
                    ["powershell", "-NoProfile", "-Command", ps_script],
                    check=False,
                    text=True,
                    capture_output=True,
                    timeout=10,
                )
                results.append({
                    "pid": pid,
                    "returnCode": result.returncode,
                    "stdout": (result.stdout or "").strip(),
                    "stderr": (result.stderr or "").strip(),
                })
            except Exception as exc:  # noqa: BLE001
                LOGGER.exception("PowerShell Stop-Process failed for Anki process %s", pid)
                results.append({"pid": pid, "returnCode": -1, "stderr": str(exc), "stdout": ""})
        return {"attempted": True, "results": results}

    def _kill_anki_processes(self) -> dict[str, Any]:
        processes = self._anki_processes()
        if os.name != "nt":
            return {"killed": 0, "processes": processes, "detail": "unsupported_platform"}
        if not processes:
            return {"killed": 0, "processes": [], "detail": "no_anki_processes"}
        results: list[dict[str, Any]] = []
        pids: list[int] = []
        for process in processes:
            pid = int(process.get("pid") or 0)
            if not pid:
                continue
            pids.append(pid)
            try:
                result = subprocess.run(
                    ["taskkill", "/PID", str(pid), "/F", "/T"],
                    check=False,
                    text=True,
                    capture_output=True,
                    timeout=10,
                )
                results.append({
                    "pid": pid,
                    "returnCode": result.returncode,
                    "stdout": (result.stdout or "").strip(),
                    "stderr": (result.stderr or "").strip(),
                })
            except Exception as exc:  # noqa: BLE001
                LOGGER.exception("Failed to kill Anki process %s", pid)
                results.append({"pid": pid, "returnCode": -1, "stderr": str(exc), "stdout": ""})

        deadline = time.time() + 10
        remaining = self._anki_processes()
        while remaining and time.time() < deadline:
            time.sleep(0.5)
            remaining = self._anki_processes()
        stop_process_result = {"attempted": False, "results": []}
        if remaining and self._taskkill_access_denied(results):
            remaining_pids = [int(process.get("pid") or 0) for process in remaining if process.get("pid")]
            stop_process_result = self._stop_anki_processes_with_powershell(remaining_pids)
            deadline = time.time() + 10
            remaining = self._anki_processes()
            while remaining and time.time() < deadline:
                time.sleep(0.5)
                remaining = self._anki_processes()
        denied = self._taskkill_access_denied(results)
        blocked = denied and bool(remaining)
        return {
            "killed": max(0, len(processes) - len(remaining)),
            "processes": processes,
            "remaining": remaining,
            "results": results,
            "stopProcess": stop_process_result,
            "returnCode": 0 if not remaining else 1,
            "accessDenied": blocked,
            "detail": "access_denied" if blocked else ("processes_remaining" if remaining else "ok"),
        }

    # ------------------------------------------------------------------
    # Public verbs: status / repair / ensure_ready
    # ------------------------------------------------------------------
    def status(self) -> dict[str, Any]:
        connect_ready, connect_detail = self.connect_status()
        collection_ready, collection_detail = self.collection_ready_status()
        processes = self._anki_processes()
        visible = any(process.get("visibleWindow") for process in processes)
        return {
            "generatedAt": _now_iso(),
            "connectAvailable": connect_ready,
            "connectDetail": connect_detail,
            "collectionReady": collection_ready,
            "collectionDetail": collection_detail,
            "processes": processes,
            "processCount": len(processes),
            "visibleWindow": visible,
            "healthy": collection_ready,
        }

    def repair(self) -> dict[str, Any]:
        if not self.anki_repair_lock.acquire(blocking=False):
            raise RuntimeError("anki_repair_in_progress")
        try:
            before = self.status()
            kill_result = self._kill_anki_processes()
            time.sleep(2)
            if kill_result.get("remaining"):
                after_kill = self.status()
                if not after_kill["collectionReady"]:
                    blocked_payload = (
                        self._anki_repair_blocked_payload(kill_result.get("remaining") or [], kill_result, after_kill["collectionDetail"])
                        if kill_result.get("accessDenied")
                        else {}
                    )
                    return {
                        "ok": False,
                        "before": before,
                        "kill": kill_result,
                        "after": after_kill,
                        "lastStatus": after_kill,
                        "code": blocked_payload.get("code") or "anki_repair_failed",
                        "accessDenied": bool(kill_result.get("accessDenied")),
                        "pids": blocked_payload.get("pids") or [int(process.get("pid") or 0) for process in kill_result.get("remaining", []) if process.get("pid")],
                        "detail": (
                            "O Windows recusou fechar processos do Anki. "
                            "Feche pelo Gerenciador de Tarefas como administrador ou reinicie o Windows."
                        ) if kill_result.get("accessDenied") else "Ainda existem processos do Anki rodando em segundo plano.",
                    }
            proc = self._launch_anki_desktop()
            deadline = time.time() + self.anki_wait_timeout_sec
            last_status = self.status()
            invisible_ready_since: float | None = None
            while time.time() < deadline:
                last_status = self.status()
                if last_status["collectionReady"] and last_status["visibleWindow"]:
                    break
                if last_status["collectionReady"] and not last_status["visibleWindow"]:
                    if invisible_ready_since is None:
                        invisible_ready_since = time.time()
                    elif time.time() - invisible_ready_since >= 8:
                        break
                else:
                    invisible_ready_since = None
                if proc and proc.poll() is not None:
                    LOGGER.warning("Anki repair launch process exited with code %s", proc.returncode)
                    if not last_status["collectionReady"] and not self._anki_launch_still_bootstrapping(proc, last_status):
                        break
                time.sleep(self.anki_poll_interval_sec)
            after = self.status()
            return {
                "ok": after["collectionReady"],
                "before": before,
                "kill": kill_result,
                "after": after,
                "lastStatus": last_status,
                "detail": None if after["collectionReady"] else after["collectionDetail"],
            }
        finally:
            self.anki_repair_lock.release()

    def ensure_ready(self) -> None:
        ready, detail = self.collection_ready_status()
        if ready:
            return
        existing_processes = self._anki_processes()
        if existing_processes:
            if self._clear_invisible_anki_processes(existing_processes, detail):
                existing_processes = []
            else:
                LOGGER.warning(
                    "Anki process exists but AnkiConnect is unavailable. processes=%s detail=%s",
                    existing_processes,
                    detail,
                )

        deadline = time.time() + self.anki_wait_timeout_sec
        last_detail = detail
        attempts = max(1, self.anki_launch_attempts)
        launched = 0
        repaired_invisible_launch = False

        while launched < attempts and time.time() < deadline:
            available, available_detail = self.connect_status()
            if available:
                LOGGER.info("AnkiConnect web server is available; waiting for collection without launching another Anki")
                break
            last_detail = available_detail
            if existing_processes:
                break
            launched += 1
            proc = self._launch_anki_desktop()
            launch_deadline = min(deadline, time.time() + max(5, self.anki_launch_grace_sec))
            while time.time() < launch_deadline:
                ready, last_detail = self.collection_ready_status()
                if ready:
                    LOGGER.info("AnkiConnect collection is ready")
                    return
                if proc and proc.poll() is not None:
                    LOGGER.warning("Anki launch process exited with code %s before readiness", proc.returncode)
                    if not self._anki_launch_still_bootstrapping(proc):
                        break
                time.sleep(self.anki_poll_interval_sec)

            if not ready and not repaired_invisible_launch:
                launched_processes = self._anki_processes()
                if self._clear_invisible_anki_processes(launched_processes, last_detail):
                    repaired_invisible_launch = True
                    launched = max(0, launched - 1)
                    existing_processes = []
                    continue

            if launched < attempts:
                LOGGER.warning(
                    "AnkiConnect not ready after launch attempt %s/%s. Last state: %s",
                    launched,
                    attempts,
                    last_detail,
                )

        while time.time() < deadline:
            ready, last_detail = self.collection_ready_status()
            if ready:
                LOGGER.info("AnkiConnect collection is ready")
                return
            time.sleep(self.anki_poll_interval_sec)
        raise RuntimeError(
            "AnkiConnect indisponível após tentativa de abrir o Anki Desktop. "
            f"Último estado: {last_detail}"
        )

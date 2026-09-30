from __future__ import annotations

import ast
import json
import pickle
import sqlite3
import sys
import tempfile
import time
import unittest
from pathlib import Path
from typing import Any
from unittest import mock


SERVER_PATH = Path(__file__).with_name("server.py")
ANKI_SESSION_PATH = Path(__file__).with_name("anki_session.py")
if str(SERVER_PATH.parent) not in sys.path:
    sys.path.insert(0, str(SERVER_PATH.parent))

import server  # noqa: E402  (após ajustar sys.path)
from anki_session import AnkiRepairBlockedError, AnkiSession  # noqa: E402

CONFIG_PATH = Path(__file__).with_name("config.json")
INSTALL_AUTOSTART_PATH = Path(__file__).with_name("install_autostart.py")


def _source() -> str:
    return SERVER_PATH.read_text(encoding="utf-8")


def _anki_session_source() -> str:
    return ANKI_SESSION_PATH.read_text(encoding="utf-8")


def _install_autostart_source() -> str:
    return INSTALL_AUTOSTART_PATH.read_text(encoding="utf-8")


def _function_source_of(path: Path, name: str) -> str:
    source = path.read_text(encoding="utf-8")
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == name:
            return ast.get_source_segment(source, node) or ""
    raise AssertionError(f"function not found in {path.name}: {name}")


def _function_source(name: str) -> str:
    return _function_source_of(SERVER_PATH, name)


def _anki_session_function_source(name: str) -> str:
    return _function_source_of(ANKI_SESSION_PATH, name)


def _session(**overrides: Any) -> AnkiSession:
    config: dict[str, Any] = {"anki_connect_url": "http://127.0.0.1:8765"}
    config.update(overrides)
    return AnkiSession(config)


# ---------------------------------------------------------------------------
# AnkiSession — behavior tests (the seam is now a real, callable interface)
# ---------------------------------------------------------------------------
class AnkiSessionBehaviorTests(unittest.TestCase):
    def test_repair_blocked_error_is_reexported_from_server(self) -> None:
        # Routes/worker in server.py catch the exception imported from anki_session.
        self.assertIs(server.AnkiRepairBlockedError, AnkiRepairBlockedError)

    def test_launch_command_structure_uses_base_and_profile(self) -> None:
        class FakeSession(AnkiSession):
            def _anki_last_loaded_profile_matches_config(self) -> bool:
                return False

        session = FakeSession(
            {
                "anki_executable": r"C:\Programs\Anki\anki.exe",
                "anki_base_path": r"C:\Anki2",
                "anki_profile": "Ingles - Vinicius",
            }
        )

        self.assertEqual(
            session._anki_launch_command(),
            [r"C:\Programs\Anki\anki.exe", "-b", r"C:\Anki2", "-p", "Ingles - Vinicius"],
        )

    def test_launch_command_omits_profile_when_last_loaded_matches_config(self) -> None:
        class FakeSession(AnkiSession):
            def _anki_last_loaded_profile_matches_config(self) -> bool:
                return True

        session = FakeSession(
            {
                "anki_executable": r"C:\Users\sadvi\AppData\Local\Programs\Anki\anki.exe",
                "anki_base_path": r"C:\Users\sadvi\AppData\Roaming\Anki2",
                "anki_profile": "Ingles - Vinicius",
            }
        )

        self.assertEqual(
            session._anki_launch_command(),
            [
                r"C:\Users\sadvi\AppData\Local\Programs\Anki\anki.exe",
                "-b",
                r"C:\Users\sadvi\AppData\Roaming\Anki2",
            ],
        )

    def test_launch_command_keeps_profile_when_last_loaded_differs(self) -> None:
        class FakeSession(AnkiSession):
            def _anki_last_loaded_profile_matches_config(self) -> bool:
                return False

        session = FakeSession(
            {
                "anki_executable": r"C:\Users\sadvi\AppData\Local\Programs\Anki\anki.exe",
                "anki_base_path": r"C:\Users\sadvi\AppData\Roaming\Anki2",
                "anki_profile": "Ingles - Vinicius",
            }
        )

        self.assertEqual(
            session._anki_launch_command(),
            [
                r"C:\Users\sadvi\AppData\Local\Programs\Anki\anki.exe",
                "-b",
                r"C:\Users\sadvi\AppData\Roaming\Anki2",
                "-p",
                "Ingles - Vinicius",
            ],
        )

    def test_last_loaded_profile_reads_prefs21_global_pickle(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            prefs = base / "prefs21.db"
            conn = sqlite3.connect(prefs)
            try:
                conn.execute("create table profiles (name text, data blob)")
                blob = pickle.dumps({"last_loaded_profile_name": "Ingles - Vinicius"})
                conn.execute("insert into profiles values ('_global', ?)", (blob,))
                conn.commit()
            finally:
                conn.close()

            matching = _session(anki_base_path=str(base), anki_profile="ingles - vinicius")
            self.assertEqual(matching._anki_last_loaded_profile_name(), "Ingles - Vinicius")
            self.assertTrue(matching._anki_last_loaded_profile_matches_config())

            differing = _session(anki_base_path=str(base), anki_profile="Outro Perfil")
            self.assertFalse(differing._anki_last_loaded_profile_matches_config())

    def test_last_loaded_profile_returns_none_without_prefs_db(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            session = _session(anki_base_path=tmp, anki_profile="X")
            self.assertIsNone(session._anki_last_loaded_profile_name())
            self.assertFalse(session._anki_last_loaded_profile_matches_config())

    def test_launch_env_strips_python_and_qt_pollution(self) -> None:
        fake_env = {
            "PATH": r"C:\System32;C:\Windows",
            "KEEPME": "yes",
            "PYTHONPATH": r"C:\hermes\venv",
            "PYTHONHOME": r"C:\py",
            "UV_CACHE_DIR": r"C:\uv",
            "VIRTUAL_ENV": r"C:\venv",
            "CONDA_PREFIX": r"C:\conda",
            "QT_PLUGIN_PATH": r"C:\qt\plugins",
            "PYCHARM_HOSTED": "1",
        }
        with mock.patch.dict("anki_session.os.environ", fake_env, clear=True):
            env = _session()._anki_launch_env(Path(r"C:\Programs\Anki"))

        self.assertEqual(env.get("KEEPME"), "yes")
        for blocked in ("PYTHONPATH", "PYTHONHOME", "UV_CACHE_DIR", "VIRTUAL_ENV", "CONDA_PREFIX", "QT_PLUGIN_PATH", "PYCHARM_HOSTED"):
            self.assertNotIn(blocked, env)
        # sanitized PATH is rebuilt under "Path" and leads with the Anki dir
        self.assertIn("Path", env)
        self.assertTrue(env["Path"].startswith(r"C:\Programs\Anki"))

    def test_launch_desktop_returns_none_when_executable_unavailable(self) -> None:
        self.assertIsNone(_session()._launch_anki_desktop())  # no executable configured
        missing = _session(anki_executable=r"C:\nope\definitely-not-anki.exe")
        self.assertIsNone(missing._launch_anki_desktop())  # path does not exist

    def test_status_healthy_gate_follows_collection_ready_only(self) -> None:
        class ReadyInvisible(AnkiSession):
            def connect_status(self) -> tuple[bool, str]:
                return True, "version ok"

            def collection_ready_status(self) -> tuple[bool, str]:
                return True, "collection ready"

            def _anki_processes(self) -> list[dict[str, Any]]:
                return []  # ready but no visible window

        payload = ReadyInvisible({}).status()
        self.assertTrue(payload["healthy"])
        self.assertFalse(payload["visibleWindow"])
        self.assertEqual(payload["healthy"], payload["collectionReady"])

        class VisibleNotReady(AnkiSession):
            def connect_status(self) -> tuple[bool, str]:
                return True, "version ok"

            def collection_ready_status(self) -> tuple[bool, str]:
                return False, "deckNames error"

            def _anki_processes(self) -> list[dict[str, Any]]:
                return [{"pid": 1, "visibleWindow": True}]

        payload2 = VisibleNotReady({}).status()
        self.assertFalse(payload2["healthy"])  # visible window does NOT make it healthy
        self.assertTrue(payload2["visibleWindow"])

    def test_repair_ok_is_gated_on_collection_ready(self) -> None:
        class FailSession(AnkiSession):
            def _kill_anki_processes(self) -> dict[str, Any]:
                return {"remaining": []}

            def status(self) -> dict[str, Any]:
                return {"collectionReady": False, "visibleWindow": False, "collectionDetail": "offline"}

            def _launch_anki_desktop(self) -> Any:
                return None

        # wait timeout 0 → repair loop is skipped, resolves immediately
        result = FailSession({"anki_wait_timeout_sec": 0}).repair()
        self.assertFalse(result["ok"])
        self.assertEqual(result["detail"], "offline")

        class OkSession(AnkiSession):
            def _kill_anki_processes(self) -> dict[str, Any]:
                return {"remaining": []}

            def status(self) -> dict[str, Any]:
                return {"collectionReady": True, "visibleWindow": True, "collectionDetail": "ready"}

            def _launch_anki_desktop(self) -> Any:
                return None

        with mock.patch("anki_session.time.sleep"):
            ok_result = OkSession({}).repair()
        self.assertTrue(ok_result["ok"])

    def test_launch_still_bootstrapping_waits_while_children_exist(self) -> None:
        class NoProcs(AnkiSession):
            def _anki_processes(self) -> list[dict[str, Any]]:
                return []

        session = NoProcs({})

        class ExitedProc:
            def poll(self) -> int:
                return 0

        # No proc handle → still bootstrapping (can't conclude it exited)
        self.assertTrue(session._anki_launch_still_bootstrapping(None))
        # Proc exited, no children, no connect → not bootstrapping anymore
        self.assertFalse(session._anki_launch_still_bootstrapping(ExitedProc()))
        # Proc exited but AnkiConnect already answering → keep waiting
        self.assertTrue(session._anki_launch_still_bootstrapping(ExitedProc(), {"connectAvailable": True}))

    def test_taskkill_access_denied_detection_accepts_stdout_and_stderr(self) -> None:
        session = _session()
        self.assertTrue(session._taskkill_access_denied([{"stdout": "ERRO: Acesso negado", "stderr": ""}]))
        self.assertTrue(session._taskkill_access_denied([{"stdout": "", "stderr": "Access is denied."}]))
        self.assertFalse(session._taskkill_access_denied([{"stdout": "SUCCESS", "stderr": ""}]))

    def test_clear_invisible_returns_false_when_a_window_is_visible(self) -> None:
        session = _session()
        self.assertFalse(
            session._clear_invisible_anki_processes(
                [{"pid": 1, "visibleWindow": True}],
                "some detail",
            )
        )

    def test_clear_invisible_kills_and_reports_success(self) -> None:
        class FakeSession(AnkiSession):
            def _kill_anki_processes(self) -> dict[str, Any]:
                return {"remaining": []}

        with mock.patch("anki_session.time.sleep"):
            cleared = FakeSession({})._clear_invisible_anki_processes(
                [{"pid": 1, "visibleWindow": False}],
                "ConnectionError: refused",
            )
        self.assertTrue(cleared)

    def test_invisible_access_denied_raises_structured_exception(self) -> None:
        class FakeSession(AnkiSession):
            def _all_anki_processes_invisible(self, processes: list[dict[str, Any]]) -> bool:
                return True

            def _kill_anki_processes(self) -> dict[str, Any]:
                process = {"pid": 1234, "image": "anki", "visibleWindow": False, "mainWindowTitle": ""}
                return {
                    "accessDenied": True,
                    "remaining": [process],
                    "processes": [process],
                    "results": [{"pid": 1234, "stderr": "ERRO: Acesso negado"}],
                }

        session = FakeSession({})
        with self.assertRaises(AnkiRepairBlockedError) as ctx:
            session._clear_invisible_anki_processes(
                [{"pid": 1234, "image": "anki", "visibleWindow": False}],
                "ConnectionError: refused",
            )

        payload = ctx.exception.payload
        self.assertEqual(payload["code"], "anki_repair_access_denied")
        self.assertEqual(payload["pids"], [1234])
        self.assertIn("Os arquivos deste job ja foram gerados", payload["detail"])

    def test_ensure_ready_raises_structured_exception_without_timeout(self) -> None:
        class FakeSession(AnkiSession):
            def collection_ready_status(self) -> tuple[bool, str]:
                return False, "ConnectionError: refused"

            def _anki_processes(self) -> list[dict[str, Any]]:
                return [{"pid": 1234, "image": "anki", "visibleWindow": False}]

            def _all_anki_processes_invisible(self, processes: list[dict[str, Any]]) -> bool:
                return True

            def _kill_anki_processes(self) -> dict[str, Any]:
                return {
                    "accessDenied": True,
                    "remaining": [{"pid": 1234, "image": "anki", "visibleWindow": False}],
                    "results": [{"pid": 1234, "stdout": "ERRO: Acesso negado", "stderr": ""}],
                }

            def _launch_anki_desktop(self) -> Any:
                raise AssertionError("Anki must not be relaunched after access denied")

        session = FakeSession(
            {
                "anki_wait_timeout_sec": 90,
                "anki_launch_attempts": 1,
                "anki_poll_interval_sec": 2,
                "anki_launch_grace_sec": 90,
            }
        )
        started = time.monotonic()
        with self.assertRaises(AnkiRepairBlockedError) as ctx:
            session.ensure_ready()

        self.assertLess(time.monotonic() - started, 1.0)
        self.assertEqual(ctx.exception.payload["code"], "anki_repair_access_denied")

    def test_ensure_connect_enabled_heals_meta_json_version_cap(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            meta_dir = base / "addons21" / "2055492159"
            meta_dir.mkdir(parents=True)
            meta_path = meta_dir / "meta.json"
            meta_path.write_text(
                json.dumps({"name": "AnkiConnect", "disabled": True, "max_point_version": 45}),
                encoding="utf-8",
            )

            _session(anki_base_path=str(base)).ensure_connect_enabled()

            healed = json.loads(meta_path.read_text(encoding="utf-8"))
            self.assertFalse(healed["disabled"])
            self.assertEqual(healed["max_point_version"], 2147483647)


# ---------------------------------------------------------------------------
# AnkiSession — Windows-only internals with no behavioral surface here.
# These still assert the invocation shape, now against anki_session.py.
# ---------------------------------------------------------------------------
class AnkiSessionInternalsSourceTests(unittest.TestCase):
    def test_shell_execute_uses_shellexecutew_open_verb(self) -> None:
        shell_fn = _anki_session_function_source("_shell_execute_anki_desktop")

        self.assertIn("ShellExecuteW", shell_fn)
        self.assertIn("subprocess.list2cmdline(args)", shell_fn)
        self.assertIn('"open"', shell_fn)

    def test_popen_fallback_hides_window_with_startupinfo(self) -> None:
        fn = _anki_session_function_source("_launch_anki_desktop_with_popen")

        self.assertIn("subprocess.Popen", fn)
        self.assertIn("STARTF_USESHOWWINDOW", fn)
        self.assertIn("wShowWindow = 1", fn)
        self.assertIn("env = self._anki_launch_env(anki_path.parent)", fn)
        self.assertIn("env=env", fn)

    def test_process_detection_includes_pythonw_launcher(self) -> None:
        fn = _anki_session_function_source("_anki_processes")

        self.assertIn("python,", fn)
        self.assertIn("pythonw", fn)
        self.assertIn("MainWindowTitle", fn)
        self.assertIn("$ankiRoots", fn)
        self.assertIn("isAnkiPath", fn)

    def test_taskkill_cascade_falls_back_to_stop_process(self) -> None:
        helper_fn = _anki_session_function_source("_taskkill_access_denied")
        kill_fn = _anki_session_function_source("_kill_anki_processes")
        stop_fn = _anki_session_function_source("_stop_anki_processes_with_powershell")

        self.assertIn("denied_markers", helper_fn)
        self.assertIn("item.get('stdout'", helper_fn)
        self.assertIn("item.get('stderr'", helper_fn)
        self.assertIn("denied = self._taskkill_access_denied(results)", kill_fn)
        self.assertIn("self._stop_anki_processes_with_powershell(remaining_pids)", kill_fn)
        self.assertIn("Stop-Process -Force", stop_fn)
        self.assertIn('"stopProcess": stop_process_result', kill_fn)
        self.assertIn("blocked = denied and bool(remaining)", kill_fn)
        self.assertIn('"accessDenied": blocked', kill_fn)
        self.assertIn('"detail": "access_denied" if blocked else', kill_fn)

    def test_access_denied_repair_message_mentions_existing_artifacts(self) -> None:
        source = _anki_session_source()

        self.assertIn("Os arquivos deste job ja foram gerados", source)
        self.assertIn("Feche o Anki pelo Gerenciador de Tarefas", source)
        self.assertIn("retente o job", source)

    def test_ankiconnect_healer_targets_official_addon_and_max_version(self) -> None:
        fn = _anki_session_function_source("ensure_connect_enabled")

        self.assertIn('folder != "2055492159"', fn)
        self.assertIn('"ankiconnect" not in name', fn)
        self.assertIn('meta["max_point_version"] = MAX_SUPPORTED_POINT_VERSION', fn)
        self.assertIn('meta["disabled"] = False', fn)


# ---------------------------------------------------------------------------
# Structural wiring that stays in server.py (routes / worker / config / panel)
# ---------------------------------------------------------------------------
class BridgeServerTests(unittest.TestCase):
    def test_config_uses_windows_shortcut_anki_launcher(self) -> None:
        config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        executable = config["anki_executable"]

        self.assertTrue(executable.endswith(r"Local\Programs\Anki\anki.exe"))
        self.assertNotIn(r"AnkiProgramFiles\.venv\Scripts\anki.exe", executable)

    def test_autostart_uses_console_python_hidden_by_vbs(self) -> None:
        source = _install_autostart_source()

        self.assertIn("def _bridge_python_executable", source)
        self.assertIn('python.name.lower() == "pythonw.exe"', source)
        self.assertIn('python.with_name("python.exe")', source)
        self.assertNotIn("def _hidden_python_executable", source)

    def test_retry_preserves_completed_stages_for_same_job_resume(self) -> None:
        retry_fn = _function_source("retry_job")

        self.assertIn('def retry_job(job_id: str):', retry_fn)
        self.assertIn('self._job_file(job_id).exists()', retry_fn)
        self.assertIn('"status": "queued"', retry_fn)
        self.assertIn('"stage": "queued"', retry_fn)
        self.assertIn('"lastError": None', retry_fn)
        self.assertIn('"ankiError": None', retry_fn)
        self.assertIn('"repairPayload": None', retry_fn)
        self.assertIn('queue["jobs"].append', retry_fn)
        self.assertNotIn("completedStages", retry_fn)
        self.assertNotIn("successfulPhraseIds", retry_fn)
        self.assertNotIn("uuid", retry_fn)

    def test_process_job_reuses_completed_card_prompt_audio_stages(self) -> None:
        process_fn = _function_source("_process_job")

        self.assertIn('completed = set(state.get("completedStages", []))', process_fn)
        self.assertIn('if "generate_cards" not in completed or not self._card_texts_ready(config, entries):', process_fn)
        self.assertIn('if cards_ran or "extract_prompts" not in completed or not self._prompts_ready(config):', process_fn)
        self.assertIn('if cards_ran or "generate_audio" not in completed or not self._audio_ready(config, entries):', process_fn)
        self.assertIn('if prompts_ran or "generate_images" not in completed:', process_fn)

    def test_process_job_filters_successful_phrase_ids_on_partial_retry(self) -> None:
        process_fn = _function_source("_process_job")

        self.assertIn('previously_successful = self._unique_phrase_ids(state.get("successfulPhraseIds") or [])', process_fn)
        self.assertIn('pending_pairs = self._pending_send_pairs(job["entries"], entries, previously_successful)', process_fn)
        self.assertIn('send_entries = [parsed_entry for _, parsed_entry in pending_pairs]', process_fn)
        self.assertIn('self._send_to_anki_with_ready_retry(job_id, send_entries, config)', process_fn)
        self.assertIn('successful = self._unique_phrase_ids([*previously_successful, *new_successful])', process_fn)
        self.assertIn('failedPhraseIds=failed', process_fn)

    def test_process_job_reports_duplicates_apart_from_added(self) -> None:
        process_fn = _function_source("_process_job")

        # Duplicates must be tracked as their own outcome, never conflated with
        # freshly added cards, and cleanup must key off "present in Anki".
        self.assertIn("send_mod.is_present(results.get(stem))", process_fn)
        self.assertIn("results.get(stem) == send_mod.DUPLICATE", process_fn)
        self.assertIn("duplicatePhraseIds=duplicate", process_fn)
        self.assertIn(
            "all(send_mod.is_present(status) for status in results.values())", process_fn
        )

    def test_anki_decks_route_lists_live_deck_names_or_reads_the_local_collection(self) -> None:
        route_fn = _function_source("anki_decks")
        names_fn = _function_source("_anki_deck_names")

        self.assertIn('@self.app.get("/anki/decks")', _source())
        self.assertIn('jsonify({"decks": self._anki_deck_names()})', route_fn)
        self.assertIn('"anki_decks_unavailable"', route_fn)
        self.assertIn('self.anki.invoke("deckNames")', names_fn)
        self.assertIn("self._open_local_anki_collection()", names_fn)
        # Os níveis do arquivo local voltam a ser `::`, e o "Default" do Anki não é oferecido.
        self.assertIn('.replace("\\x1f", "::")', names_fn)
        self.assertIn('name != "Default"', names_fn)

    def test_health_exposes_loaded_module_fingerprint(self) -> None:
        health_fn = _function_source("health")

        self.assertIn('"automaticAnkiPath": str(self.automatic_anki_path)', health_fn)
        self.assertIn('"runtime": self._runtime_payload()', health_fn)
        self.assertIn('"moduleFingerprint": self.module_fingerprint', health_fn)

    def test_health_exposes_runtime_identity_for_loaded_bridge_code(self) -> None:
        runtime_fn = _function_source("_runtime_payload")

        self.assertIn('"pid": os.getpid()', runtime_fn)
        self.assertIn('"startedAt": self.started_at', runtime_fn)
        self.assertIn('"serverFile": self.server_fingerprint', runtime_fn)
        self.assertIn('"ankiRepairBlockedHandlerLoaded": self._anki_repair_blocked_handler_loaded()', runtime_fn)

    def test_server_fingerprint_tracks_current_server_file(self) -> None:
        source = _source()

        self.assertIn("SERVER_PATH = Path(__file__).resolve()", source)
        self.assertIn("self.server_fingerprint = _file_fingerprint(SERVER_PATH)", source)
        self.assertIn('"sha256_12"', source)

    def test_module_fingerprint_checks_image_normalization_guard(self) -> None:
        fingerprint_fn = _function_source("_build_module_fingerprint")

        self.assertIn('"image_judge.py"', fingerprint_fn)
        self.assertIn('"google_images.py"', fingerprint_fn)
        self.assertIn('"image_utils.py"', fingerprint_fn)
        self.assertIn('"normalize_image_bytes"', fingerprint_fn)
        self.assertIn('"download_candidate"', fingerprint_fn)
        self.assertIn('"_is_invalid_image_format_error"', fingerprint_fn)

    def test_access_denied_repair_is_wired_through_worker_and_route(self) -> None:
        worker_fn = _function_source("_worker_loop")
        route_fn = _function_source("anki_repair")

        self.assertIn("except AnkiRepairBlockedError as exc", worker_fn)
        self.assertIn("except AnkiRepairBlockedError as exc", route_fn)
        self.assertIn("return jsonify(exc.payload), 503", route_fn)
        self.assertIn("ankiError", worker_fn)
        self.assertIn("repairPayload", worker_fn)

    def test_anki_routes_delegate_to_the_session_seam(self) -> None:
        source = _source()

        self.assertIn("self.anki = AnkiSession(self.config)", source)
        self.assertIn("jsonify(self.anki.status())", source)
        self.assertIn("self.anki.repair()", source)
        self.assertIn("self.anki.ensure_ready()", source)
        self.assertIn("self.anki.ensure_connect_enabled()", source)

    def test_panel_uses_structured_anki_repair_messages(self) -> None:
        panel_source = Path(__file__).with_name("..").resolve().joinpath("painel.js").read_text(encoding="utf-8")

        self.assertIn("formatarBridgeAnkiRepairMessage", panel_source)
        self.assertIn("data.kill?.accessDenied", panel_source)
        self.assertIn("processos: ${pids}", panel_source)
        self.assertIn("state.ankiError", panel_source)

    def test_construction_has_no_side_effects(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            meta_dir = base / "addons21" / "2055492159"
            meta_dir.mkdir(parents=True)
            meta_path = meta_dir / "meta.json"
            original_meta = {"name": "AnkiConnect", "disabled": True, "max_point_version": 45}
            meta_path.write_text(json.dumps(original_meta), encoding="utf-8")

            bridge = server.BridgeApp(
                config={
                    "automatic_anki_path": ".",
                    "anki_base_path": str(base),
                }
            )

            self.assertFalse(bridge.worker.is_alive())
            self.assertEqual(bridge.modules, {})
            # ensure_connect_enabled (que reescreve meta.json) só roda em start(),
            # nunca na construção.
            self.assertEqual(
                json.loads(meta_path.read_text(encoding="utf-8")),
                original_meta,
            )


if __name__ == "__main__":
    unittest.main()

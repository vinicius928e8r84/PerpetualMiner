from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


TASK_NAME = "PerpetualMinerAnkiBridge"
WATCHDOG_TASK_NAME = "PerpetualMinerAnkiBridgeWatchdog"
WATCHDOG_INTERVAL_MIN = 3
RUN_REG_KEY = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run"
RUN_VALUE_NAME = "PerpetualMinerAnkiBridge"


def _bridge_python_executable() -> Path:
    python = Path(sys.executable)
    if python.name.lower() == "pythonw.exe":
        console_python = python.with_name("python.exe")
        if console_python.exists():
            return console_python
    return python


def _run_schtasks(args: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["schtasks", *args],
        check=check,
        text=True,
        capture_output=True,
    )


def _run_reg(args: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["reg", *args],
        check=check,
        text=True,
        capture_output=True,
    )


def _command_output(result: subprocess.CompletedProcess[str]) -> str:
    return f"{result.stdout or ''}\n{result.stderr or ''}".strip()


def _remove_startup_launchers(*, include_vbs: bool) -> None:
    appdata = os.environ.get("APPDATA")
    if not appdata:
        return

    startup = (
        Path(appdata)
        / "Microsoft"
        / "Windows"
        / "Start Menu"
        / "Programs"
        / "Startup"
    )
    names = ["perpetualminer-anki-bridge.cmd"]
    if include_vbs:
        names.append("perpetualminer-anki-bridge.vbs")

    for name in names:
        launcher = startup / name
        try:
            launcher.unlink(missing_ok=True)
        except OSError as exc:
            print(f"Aviso: nao foi possivel remover autostart antigo em {launcher}: {exc}")


def _startup_folder() -> Path | None:
    appdata = os.environ.get("APPDATA")
    if not appdata:
        return None
    return Path(appdata) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup"


def _write_launcher(root: Path, python: Path) -> Path:
    runtime_dir = root / "bridge" / "runtime"
    runtime_dir.mkdir(parents=True, exist_ok=True)
    launcher = runtime_dir / "start_bridge_hidden.vbs"
    launcher.write_text(
        'Set shell = CreateObject("WScript.Shell")\n'
        f'shell.CurrentDirectory = "{root}"\n'
        f'shell.Run """{python}"" ""{root / "bridge" / "run_bridge.py"}""", 0, False\n',
        encoding="utf-8",
    )
    return launcher


def _install_scheduled_task(command: str) -> bool:
    _run_schtasks(["/Delete", "/TN", TASK_NAME, "/F"], check=False)
    result = _run_schtasks(
        [
            "/Create",
            "/TN",
            TASK_NAME,
            "/SC",
            "ONLOGON",
            "/TR",
            command,
            "/RL",
            "LIMITED",
            "/F",
        ],
        check=False,
    )

    if result.returncode == 0:
        return True

    details = _command_output(result)
    print(f"Aviso: Agendador de Tarefas indisponivel ({details}); usando inicializacao por HKCU Run.")
    return False


def _install_watchdog_task(command: str) -> bool:
    """Watchdog: reexecuta o launcher a cada poucos minutos.

    O launcher (run_bridge.py) e idempotente: checa http://127.0.0.1:8766/health
    e nao faz nada se o bridge ja estiver no ar; se estiver caido, sobe de novo.
    Rodar isso em intervalo fixo transforma o autostart-so-no-login numa
    garantia continua: se o bridge morrer (reboot, crash, kill, fast-startup),
    ele volta sozinho dentro do intervalo. Esta e a causa-raiz #1 do
    "Anki Bridge Offline" recorrente."""
    _run_schtasks(["/Delete", "/TN", WATCHDOG_TASK_NAME, "/F"], check=False)
    result = _run_schtasks(
        [
            "/Create",
            "/TN",
            WATCHDOG_TASK_NAME,
            "/SC",
            "MINUTE",
            "/MO",
            str(WATCHDOG_INTERVAL_MIN),
            "/TR",
            command,
            "/RL",
            "LIMITED",
            "/F",
        ],
        check=False,
    )
    if result.returncode == 0:
        return True
    print(f"Aviso: nao foi possivel instalar o watchdog ({_command_output(result)}).")
    return False


def _install_hkcu_run(command: str) -> None:
    result = _run_reg(
        [
            "add",
            RUN_REG_KEY,
            "/v",
            RUN_VALUE_NAME,
            "/t",
            "REG_SZ",
            "/d",
            command,
            "/f",
        ],
        check=False,
    )
    if result.returncode != 0:
        details = _command_output(result)
        raise RuntimeError(f"Registro HKCU Run indisponivel: {details}")


def _install_startup_folder(command: str) -> Path:
    startup = _startup_folder()
    if not startup:
        raise RuntimeError("APPDATA indisponivel; nao foi possivel localizar a pasta Startup.")

    startup.mkdir(parents=True, exist_ok=True)
    launcher = startup / "perpetualminer-anki-bridge.vbs"
    launcher.write_text(
        'Set shell = CreateObject("WScript.Shell")\n'
        f'shell.Run "{command.replace(chr(34), chr(34) + chr(34))}", 0, False\n',
        encoding="utf-8",
    )
    return launcher


def _start_bridge_now(launcher: Path) -> None:
    subprocess.Popen(
        ["wscript.exe", str(launcher)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        stdin=subprocess.DEVNULL,
        close_fds=True,
    )


def install_autostart() -> None:
    root = Path(__file__).resolve().parent.parent
    python = _bridge_python_executable()
    launcher = _write_launcher(root, python)
    command = f'wscript.exe "{launcher}"'

    installed_as_task = _install_scheduled_task(command)
    startup_launcher: Path | None = None
    if installed_as_task:
        mode = "Tarefa Agendada"
        _remove_startup_launchers(include_vbs=True)
    else:
        try:
            _install_hkcu_run(command)
            mode = "Registro HKCU Run"
            _remove_startup_launchers(include_vbs=True)
        except RuntimeError as exc:
            print(f"Aviso: {exc}; usando pasta Startup do usuario.")
            startup_launcher = _install_startup_folder(command)
            mode = "pasta Startup"
            _remove_startup_launchers(include_vbs=False)
    watchdog_installed = _install_watchdog_task(command)
    _start_bridge_now(launcher)

    print(f"Autostart instalado via {mode}: {TASK_NAME}")
    print(f"Launcher: {launcher}")
    if startup_launcher:
        print(f"Startup: {startup_launcher}")
    if watchdog_installed:
        print(
            f"Watchdog instalado: {WATCHDOG_TASK_NAME} (verifica a cada "
            f"{WATCHDOG_INTERVAL_MIN} min e reinicia o bridge se cair)."
        )
    print("O bridge foi iniciado agora e iniciara automaticamente quando este usuario entrar no Windows.")


def main() -> None:
    if os.name != "nt":
        raise SystemExit("Autostart esta disponivel apenas no Windows.")

    try:
        install_autostart()
    except FileNotFoundError as exc:
        raise SystemExit("Nao foi possivel encontrar schtasks.exe ou reg.exe do Windows.") from exc
    except subprocess.CalledProcessError as exc:
        details = (exc.stderr or exc.stdout or "").strip()
        raise SystemExit(f"Falha ao instalar autostart: {details}") from exc


if __name__ == "__main__":
    main()

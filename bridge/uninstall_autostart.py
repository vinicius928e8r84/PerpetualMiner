from __future__ import annotations

import os
import subprocess
from pathlib import Path


TASK_NAME = "PerpetualMinerAnkiBridge"
RUN_REG_KEY = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run"
RUN_VALUE_NAME = "PerpetualMinerAnkiBridge"


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


def _remove_startup_launchers() -> bool:
    appdata = os.environ.get("APPDATA")
    if not appdata:
        return False

    startup = (
        Path(appdata)
        / "Microsoft"
        / "Windows"
        / "Start Menu"
        / "Programs"
        / "Startup"
    )
    removed = False
    for name in ["perpetualminer-anki-bridge.cmd", "perpetualminer-anki-bridge.vbs"]:
        launcher = startup / name
        if launcher.exists():
            launcher.unlink()
            removed = True
    return removed


def main() -> None:
    if os.name != "nt":
        raise SystemExit("Autostart por Tarefa Agendada esta disponivel apenas no Windows.")

    task_result = _run_schtasks(["/Delete", "/TN", TASK_NAME, "/F"], check=False)
    reg_result = _run_reg(["delete", RUN_REG_KEY, "/v", RUN_VALUE_NAME, "/f"], check=False)
    startup_removed = _remove_startup_launchers()

    removed = False
    if task_result.returncode == 0:
        print(f"Tarefa Agendada removida: {TASK_NAME}")
        removed = True
    if reg_result.returncode == 0:
        print(f"Registro HKCU Run removido: {RUN_VALUE_NAME}")
        removed = True
    if startup_removed:
        print("Launcher da pasta Startup removido.")
        removed = True
    if not removed:
        print(f"Nenhuma Tarefa Agendada ativa encontrada para: {TASK_NAME}")


if __name__ == "__main__":
    main()

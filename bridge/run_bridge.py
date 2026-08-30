from __future__ import annotations

import runpy
import sys
import time
import traceback
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

# Remove paths from other Python environments (e.g. Hermes venv) that may
# have been injected via the PYTHONPATH environment variable.  If left in
# place they cause import errors because compiled extensions (.pyd) built for
# a different Python version are not compatible with this interpreter.
_this_prefix = sys.prefix.lower()
sys.path = [
    p for p in sys.path
    if not any(
        marker in p.lower()
        for marker in ("hermes", "hermes-agent")
    )
]


ROOT = Path(__file__).resolve().parent.parent
SERVER_PATH = ROOT / "bridge" / "server.py"
BOOT_LOG = ROOT / "bridge" / "runtime" / "bridge-autostart.log"
HEALTH_URL = "http://127.0.0.1:8766/health"


def _append_boot_log(message: str) -> None:
    BOOT_LOG.parent.mkdir(parents=True, exist_ok=True)
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    with BOOT_LOG.open("a", encoding="utf-8") as file:
        file.write(f"{timestamp} {message}\n")


def _bridge_is_running() -> bool:
    try:
        with urlopen(HEALTH_URL, timeout=1) as response:
            return 200 <= response.status < 500
    except (OSError, URLError):
        return False


def main() -> None:
    if _bridge_is_running():
        _append_boot_log("Bridge ja esta online; inicializacao ignorada.")
        return

    _append_boot_log(f"Iniciando bridge: {SERVER_PATH}")
    sys.path.insert(0, str(SERVER_PATH.parent))
    try:
        runpy.run_path(str(SERVER_PATH), run_name="__main__")
    except Exception:
        _append_boot_log("Falha ao iniciar bridge:")
        _append_boot_log(traceback.format_exc())
        raise


if __name__ == "__main__":
    main()

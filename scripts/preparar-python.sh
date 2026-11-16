#!/usr/bin/env bash

set -eu

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$RAIZ/.venv"

if [ ! -x "$VENV/bin/python" ]; then
  if ! python3 -m venv "$VENV" 2>/dev/null; then
    rm -rf "$VENV"
    python3 -m venv --without-pip "$VENV"
  fi
fi

if ! "$VENV/bin/python" -m pip --version >/dev/null 2>&1; then
  curl -fsS -o "$VENV/get-pip.py" https://bootstrap.pypa.io/get-pip.py
  "$VENV/bin/python" "$VENV/get-pip.py"
  rm -f "$VENV/get-pip.py"
fi

"$VENV/bin/python" -m pip install -r "$RAIZ/engine/requirements.txt"

#!/usr/bin/env bash
# Cria o venv `.venv` na raiz do repositório e instala nele as dependências do
# bridge e do engine, para rodar os testes Python no Linux e no macOS.
#
# Idempotente: rodar de novo só confere o venv e reinstala o que faltar.
# Não usa sudo e não altera o Python do sistema: as dependências ficam só no venv
# (o pip mantém o cache dele fora do repositório, em ~/.cache/pip). Em hosts Debian/Ubuntu
# sem o pacote python3-venv, `python3 -m venv` cria o venv sem pip; nesse caso o
# pip entra pelo get-pip.py oficial, dentro do próprio venv.
#
# Uso: scripts/preparar-python.sh
# Depois: .venv/bin/python -m unittest discover -s bridge -p "test_*.py"

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

"$VENV/bin/python" -m pip install -r "$RAIZ/bridge/requirements.txt" -r "$RAIZ/engine/requirements.txt"

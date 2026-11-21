"""
config_loader.py - Load config.json and the OpenAI key (standard library only).

The key comes from whoever runs the engine: the Conexão com o Anki passes the one it keeps
(`load_config(openai_api_key=...)`); the command line reads OPENAI_API_KEY from the
environment or, failing that, from the `.env` next to the engine. The environment is never changed.
Where the requests go (`openai_base`, `openverse_base`) is code's to say, never the file's: the file's keys are dropped.
"""

import json
import os
from pathlib import Path

PASTA = Path(__file__).parent
CONFIG_PATH = PASTA / "config.json"
ENV_PATH = PASTA / ".env"
NOME_DA_CHAVE = "OPENAI_API_KEY"
ENDERECOS_SO_DO_CODIGO = ("openai_base", "openverse_base")


def base_config() -> dict:
    """config.json as a fresh dict, without the key and without any address for the requests."""
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        config = json.load(f)
    for chave in ENDERECOS_SO_DO_CODIGO:
        config.pop(chave, None)
    return config


def _ler_env(caminho: Path) -> dict:
    """KEY=VALUE lines of a .env file (comments, blank lines, `export ` and surrounding quotes allowed)."""
    try:
        linhas = caminho.read_text(encoding="utf-8").splitlines()
    except OSError:
        return {}
    return dict(atribuicao for atribuicao in map(_atribuicao, linhas) if atribuicao)


def _atribuicao(linha: str):
    """`(nome, valor)` of one `.env` line, or None for a blank line, a comment or a line without `=`."""
    linha = linha.strip()
    if linha.startswith("#") or "=" not in linha:
        return None
    nome, valor = linha.split("=", 1)
    return nome.strip().removeprefix("export ").strip(), _sem_o_par_de_aspas(valor.strip())


def _sem_o_par_de_aspas(valor: str) -> str:
    """`valor` without the quotes around it, when it starts and ends with the same one (`'` or `"`)."""
    return valor[1:-1] if len(valor) >= 2 and valor[0] + valor[-1] in ("''", '""') else valor


def load_config(openai_api_key=None, env_file=None) -> dict:
    """Return the config dict with `openai_api_key` set."""
    config = base_config()
    api_key = openai_api_key
    if api_key is None:
        api_key = os.environ.get(NOME_DA_CHAVE) or _ler_env(env_file or ENV_PATH).get(NOME_DA_CHAVE, "")
    if not api_key or api_key == "your-openai-api-key-here":
        raise EnvironmentError("OPENAI_API_KEY is not set. Add it to your .env file.")
    config["openai_api_key"] = api_key
    return config

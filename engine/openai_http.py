"""
openai_http.py - Chat completions over plain HTTP (standard library only, Python 3.9+).

The engine's text stage talks to OpenAI through this module instead of the SDK, so it also runs inside
the Anki add-on (the Conexão com o Anki), where there is no `openai`, `httpx` or `requests`. The base URL
is passed by code (the bridge uses OPENAI_BASE; the add-on passes its own constant): nothing in the
environment or the config can redirect the key.

A refusal becomes `ErroDaOpenAI(codigo)`; what OpenAI wrote in the refusal is never kept, because the
message of a rejected key repeats parts of it.
"""

import json
import ssl
import urllib.error
import urllib.request

OPENAI_BASE = "https://api.openai.com"
TEMPO_PADRAO = 120

# The same codes the add-on uses when it checks a key (complemento/openai_api.py).
RECUSADA = "openai_key_rejected"
SEM_CREDITO = "openai_no_credit"
LIMITE_DE_USO = "openai_rate_limited"
FORA_DO_AR = "openai_unreachable"
PEDIDO_RECUSADO = "openai_request_rejected"


class ErroDaOpenAI(Exception):
    """OpenAI did not answer the request: `codigo` is one of the codes above."""

    def __init__(self, codigo, status=None):
        super().__init__(codigo if status is None else "%s (HTTP %s)" % (codigo, status))
        self.codigo = codigo
        self.status = status


def _contexto_tls():
    # Anki's Python on the Mac does not always find the system authorities; Anki ships `certifi`.
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


def _classificar(status, detalhe):
    if status == 401 or status == 403:
        return RECUSADA
    if status in (402, 429):
        codigo = str(detalhe.get("code") or detalhe.get("type") or "")
        return SEM_CREDITO if status == 402 or "quota" in codigo or "billing" in codigo else LIMITE_DE_USO
    if status >= 500:
        return FORA_DO_AR
    return PEDIDO_RECUSADO


def completar(base, chave, modelo, mensagens, temperatura=None, tempo=TEMPO_PADRAO):
    """POST /v1/chat/completions. Returns (text, usage): the first choice's text ('' if none) and the `usage` dict."""
    corpo = {"model": modelo, "messages": mensagens}
    if temperatura is not None:
        corpo["temperature"] = temperatura
    pedido = urllib.request.Request(base + "/v1/chat/completions", data=json.dumps(corpo).encode("utf-8"), method="POST")
    pedido.add_header("Authorization", "Bearer " + chave)
    pedido.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(pedido, timeout=tempo, context=_contexto_tls()) as resposta:
            dados = json.loads(resposta.read().decode("utf-8"))
    except urllib.error.HTTPError as erro:
        try:
            detalhe = json.loads(erro.read(65536).decode("utf-8")).get("error") or {}
        except (ValueError, AttributeError, OSError):
            detalhe = {}
        raise ErroDaOpenAI(_classificar(erro.code, detalhe if isinstance(detalhe, dict) else {}), erro.code) from None
    except (urllib.error.URLError, OSError, ValueError):
        raise ErroDaOpenAI(FORA_DO_AR) from None
    escolha = (dados.get("choices") or [{}])[0] or {}
    texto = ((escolha.get("message") or {}).get("content") or "").strip()
    return texto, dados.get("usage") or {}

"""
openai_http.py - Chat completions and image generation over plain HTTP (standard library only, Python 3.9+).

The engine's text and image stages talk to OpenAI through this module instead of the SDK, so they also run inside
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
TEMPO_DA_IMAGEM = 240  # an image takes longer than a text

# The same codes the add-on uses when it checks a key (complemento/openai_api.py).
RECUSADA = "openai_key_rejected"
SEM_CREDITO = "openai_no_credit"
LIMITE_DE_USO = "openai_rate_limited"
FORA_DO_AR = "openai_unreachable"
PEDIDO_RECUSADO = "openai_request_rejected"
# OpenAI's own machine code for an image it cannot read (the image judge discards the candidates); no text of its answer is kept.
IMAGEM_INVALIDA = "openai_invalid_image"


class ErroDaOpenAI(Exception):
    """OpenAI did not answer the request: `codigo` is one of the codes above."""

    def __init__(self, codigo, status=None):
        super().__init__(codigo if status is None else "%s (HTTP %s)" % (codigo, status))
        self.codigo = codigo
        self.status = status


def contexto_tls():
    # Anki's Python on the Mac does not always find the system authorities; Anki ships `certifi`.
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


def _classificar(status, detalhe):
    if status == 400 and detalhe.get("code") == "invalid_image_format":
        return IMAGEM_INVALIDA
    if status == 401 or status == 403:
        return RECUSADA
    if status in (402, 429):
        codigo = str(detalhe.get("code") or detalhe.get("type") or "")
        return SEM_CREDITO if status == 402 or "quota" in codigo or "billing" in codigo else LIMITE_DE_USO
    if status >= 500:
        return FORA_DO_AR
    return PEDIDO_RECUSADO


def _pedir(base, caminho, chave, corpo, tempo):
    """POST `corpo` (JSON) to `base + caminho`; returns the answer as a dict. A refusal is an `ErroDaOpenAI`."""
    pedido = urllib.request.Request(base + caminho, data=json.dumps(corpo).encode("utf-8"), method="POST")
    pedido.add_header("Authorization", "Bearer " + chave)
    pedido.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(pedido, timeout=tempo, context=contexto_tls()) as resposta:
            return json.loads(resposta.read().decode("utf-8"))
    except urllib.error.HTTPError as erro:
        try:
            detalhe = json.loads(erro.read(65536).decode("utf-8")).get("error") or {}
        except (ValueError, AttributeError, OSError):
            detalhe = {}
        erro.close()
        raise ErroDaOpenAI(_classificar(erro.code, detalhe if isinstance(detalhe, dict) else {}), erro.code) from None
    except (urllib.error.URLError, OSError, ValueError):
        raise ErroDaOpenAI(FORA_DO_AR) from None


def completar(base, chave, modelo, mensagens, temperatura=None, tempo=TEMPO_PADRAO, formato_json=False, max_tokens=None):
    """POST /v1/chat/completions. Returns (text, usage): the first choice's text ('' if none) and the `usage` dict."""
    corpo = {"model": modelo, "messages": mensagens}
    if temperatura is not None:
        corpo["temperature"] = temperatura
    if formato_json:
        corpo["response_format"] = {"type": "json_object"}
    if max_tokens is not None:
        corpo["max_tokens"] = max_tokens
    dados = _pedir(base, "/v1/chat/completions", chave, corpo, tempo)
    escolha = (dados.get("choices") or [{}])[0] or {}
    texto = ((escolha.get("message") or {}).get("content") or "").strip()
    return texto, dados.get("usage") or {}


def gerar_imagem(base, chave, modelo, prompt, tamanho, tempo=TEMPO_DA_IMAGEM):
    """POST /v1/images/generations. Returns the first image of the answer: `{"b64_json": ...}` or `{"url": ...}` (`{}` if none)."""
    dados = _pedir(base, "/v1/images/generations", chave, {"model": modelo, "prompt": prompt, "n": 1, "size": tamanho}, tempo)
    primeira = (dados.get("data") or [{}])[0]
    return primeira if isinstance(primeira, dict) else {}

"""
openai_http.py - Chat completions, and the Responses API of the ChatGPT plan, over plain HTTP (standard library only, Python 3.9+).

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
# The ChatGPT plan (Sign in with ChatGPT, #155): the codes its Responses API errors become. Source: the SIWC docs,
# "Errors and recovery" (https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery).
LIMITE_DO_PLANO = "chatgpt_usage_limit"
PLANO_NAO_SERVE = "chatgpt_not_eligible"
PLANO_RECUSOU = "chatgpt_rejected"
RESPOSTA_INCOMPLETA = "empty_response"
_DO_PLANO = {
    "subscription_sharing_usage_limit_exceeded": LIMITE_DO_PLANO,
    "subscription_sharing_user_not_eligible": PLANO_NAO_SERVE,
    "subscription_sharing_usage_unavailable": FORA_DO_AR,
    "subscription_sharing_user_unavailable": FORA_DO_AR,
    "subscription_sharing_invalid_user": PLANO_RECUSOU,
    "chatpass_v2_scope_not_authorized": PLANO_RECUSOU,
    "chatpass_v2_invalid_authorization_context": PLANO_RECUSOU,
}


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


def _detalhe_do_erro(erro):
    try:
        detalhe = json.loads(erro.read(65536).decode("utf-8")).get("error") or {}
    except (ValueError, AttributeError, OSError):
        detalhe = {}
    return detalhe if isinstance(detalhe, dict) else {}


def _classificar_do_plano(status, detalhe):
    codigo = _DO_PLANO.get(str(detalhe.get("code") or ""))
    if codigo:
        return codigo
    if status in (401, 403):
        return PLANO_RECUSOU
    return FORA_DO_AR if status >= 500 else (LIMITE_DE_USO if status == 429 else PEDIDO_RECUSADO)


def responder(base, token, modelo, instrucoes, mensagem, tempo=TEMPO_PADRAO):
    """POST /v1/responses with the ChatGPT plan's access token: no `temperature`, the system prompt as `instructions`,
    `store: false` and `stream: true` (the SIWC "Preview limitations"). Returns (text, usage) only after
    `response.completed`; anything else is `ErroDaOpenAI` with a code, never what the plan wrote."""
    corpo = {"model": modelo, "instructions": instrucoes, "input": [{"role": "user", "content": mensagem}], "store": False, "stream": True}
    pedido = urllib.request.Request(base + "/v1/responses", data=json.dumps(corpo).encode("utf-8"), method="POST")
    pedido.add_header("Authorization", "Bearer " + token)
    pedido.add_header("Content-Type", "application/json")
    pedido.add_header("Accept", "text/event-stream")
    pedacos = []
    try:
        with urllib.request.urlopen(pedido, timeout=tempo, context=_contexto_tls()) as resposta:
            for linha in resposta:
                if not linha.startswith(b"data:"):
                    continue
                evento = json.loads(linha[5:].decode("utf-8"))
                tipo = evento.get("type") if isinstance(evento, dict) else None
                if tipo == "response.output_text.delta":
                    pedacos.append(str(evento.get("delta") or ""))
                elif tipo == "response.completed":
                    return "".join(pedacos).strip(), (evento.get("response") or {}).get("usage") or {}
                elif tipo in ("response.failed", "error"):
                    erro = (evento.get("response") or {}).get("error") or evento.get("error") or evento
                    raise ErroDaOpenAI(_classificar_do_plano(500, erro if isinstance(erro, dict) else {}))
                elif tipo == "response.incomplete":
                    raise ErroDaOpenAI(RESPOSTA_INCOMPLETA)
    except urllib.error.HTTPError as erro:
        raise ErroDaOpenAI(_classificar_do_plano(erro.code, _detalhe_do_erro(erro)), erro.code) from None
    except (urllib.error.URLError, OSError, ValueError):
        raise ErroDaOpenAI(FORA_DO_AR) from None
    raise ErroDaOpenAI(FORA_DO_AR)  # the stream ended without `response.completed`


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

"""
openai_http.py - Chat completions, the Responses API of the ChatGPT plan and image generation over plain HTTP (standard library only, Python 3.9+).

The engine's text and image stages talk to OpenAI through this module instead of the SDK, so they also run inside
the Anki add-on (the Conexão com o Anki), where there is no `openai`, `httpx` or `requests`. The base URL
is passed by code (each caller passes its own constant, or OPENAI_BASE): nothing in the environment or in
`engine/config.json` can redirect the key.

The image calls (the judge, the screening, the generation) ask again, twice, after a passing refusal (408/409/429/5xx,
a timeout or no answer), as the SDK did; the text call does not (the add-on waits and repeats it by itself).

A refusal becomes `ErroDaOpenAI(codigo)`; what OpenAI wrote in the refusal is never kept, because the
message of a rejected key repeats parts of it.
"""

import json
import ssl
import time
import urllib.error
import urllib.request

OPENAI_BASE = "https://api.openai.com"
TEMPO_PADRAO = 120
TEMPO_DA_IMAGEM = 240  # an image takes longer than a text
REPETICOES_DA_IMAGEM = 2
ESPERA_ENTRE_TENTATIVAS = 0.5  # seconds before the first repetition; doubles for the next

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
    if status == 400 and detalhe.get("code") == "invalid_image_format":
        return IMAGEM_INVALIDA  # the image judge discards the candidates, as on the key's path
    if status in (401, 403):
        return PLANO_RECUSOU
    return FORA_DO_AR if status >= 500 else (LIMITE_DE_USO if status == 429 else PEDIDO_RECUSADO)


def _responder_uma_vez(base, token, modelo, instrucoes, mensagem, tempo, formato_json):
    corpo = {"model": modelo, "instructions": instrucoes, "input": [{"role": "user", "content": mensagem}], "store": False, "stream": True}
    if formato_json:
        corpo["text"] = {"format": {"type": "json_object"}}
    pedido = urllib.request.Request(base + "/v1/responses", data=json.dumps(corpo).encode("utf-8"), method="POST")
    pedido.add_header("Authorization", "Bearer " + token)
    pedido.add_header("Content-Type", "application/json")
    pedido.add_header("Accept", "text/event-stream")
    pedacos = []
    try:
        with urllib.request.urlopen(pedido, timeout=tempo, context=contexto_tls()) as resposta:
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


def responder(base, token, modelo, instrucoes, mensagem, tempo=TEMPO_PADRAO, formato_json=False, repeticoes=0):
    """POST /v1/responses with the ChatGPT plan's access token: no `temperature`, the system prompt as `instructions`,
    `store: false` and `stream: true` (the SIWC "Preview limitations"). `mensagem` is a text, or the parts of the user's message
    (`input_text` and `input_image`, the image judge); `formato_json` asks for a JSON object by `text.format`. Returns (text, usage)
    only after `response.completed`; anything else is `ErroDaOpenAI` with a code, never what the plan wrote. A passing refusal
    (`passageira`) is asked again `repeticoes` times."""
    espera = ESPERA_ENTRE_TENTATIVAS
    for tentativa in range(repeticoes + 1):
        try:
            return _responder_uma_vez(base, token, modelo, instrucoes, mensagem, tempo, formato_json)
        except ErroDaOpenAI as recusa:
            if tentativa == repeticoes or not passageira(recusa.codigo, recusa.status):
                raise
        time.sleep(espera)
        espera *= 2


def passageira(codigo, status):
    """A refusal worth asking again: the server or the network failed, or OpenAI asked to slow down (never the key or the billing)."""
    return codigo == FORA_DO_AR or codigo == LIMITE_DE_USO or status in (408, 409)


def _pedir_uma_vez(base, caminho, chave, corpo, tempo):
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


def _pedir(base, caminho, chave, corpo, tempo, repeticoes=0):
    """POST `corpo` (JSON) to `base + caminho`; returns the answer as a dict. A refusal is an `ErroDaOpenAI`; a passing one is asked again `repeticoes` times."""
    espera = ESPERA_ENTRE_TENTATIVAS
    for tentativa in range(repeticoes + 1):
        try:
            return _pedir_uma_vez(base, caminho, chave, corpo, tempo)
        except ErroDaOpenAI as recusa:
            if tentativa == repeticoes or not passageira(recusa.codigo, recusa.status):
                raise
        time.sleep(espera)
        espera *= 2


def completar(base, chave, modelo, mensagens, temperatura=None, tempo=TEMPO_PADRAO, formato_json=False, max_tokens=None, repeticoes=0):
    """POST /v1/chat/completions. Returns (text, usage): the first choice's text ('' if none) and the `usage` dict."""
    corpo = {"model": modelo, "messages": mensagens}
    if temperatura is not None:
        corpo["temperature"] = temperatura
    if formato_json:
        corpo["response_format"] = {"type": "json_object"}
    if max_tokens is not None:
        corpo["max_tokens"] = max_tokens
    dados = _pedir(base, "/v1/chat/completions", chave, corpo, tempo, repeticoes)
    escolha = (dados.get("choices") or [{}])[0] or {}
    texto = ((escolha.get("message") or {}).get("content") or "").strip()
    return texto, dados.get("usage") or {}


def gerar_imagem(base, chave, modelo, prompt, tamanho, tempo=TEMPO_DA_IMAGEM):
    """POST /v1/images/generations. Returns the first image of the answer: `{"b64_json": ...}` or `{"url": ...}` (`{}` if none)."""
    dados = _pedir(base, "/v1/images/generations", chave, {"model": modelo, "prompt": prompt, "n": 1, "size": tamanho}, tempo, REPETICOES_DA_IMAGEM)
    primeira = (dados.get("data") or [{}])[0]
    return primeira if isinstance(primeira, dict) else {}

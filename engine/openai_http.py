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

This module is the `openai` adapter of the provider layer (`provedores.py`): `texto()` and `imagem()` are the interface it
fulfils, the rest is OpenAI's own protocol.
"""

import json
import ssl
import time
import urllib.error
import urllib.request
from collections import namedtuple

OPENAI_BASE = "https://api.openai.com"
TEMPO_PADRAO = 120
TEMPO_DA_IMAGEM = 240
REPETICOES_DA_IMAGEM = 2
ESPERA_ENTRE_TENTATIVAS = 0.5

Paciencia = namedtuple("Paciencia", "tempo repeticoes")
PACIENCIA_DO_TEXTO = Paciencia(TEMPO_PADRAO, 0)

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
    if _imagem_invalida(status, detalhe):
        return IMAGEM_INVALIDA
    if status in (401, 403):
        return RECUSADA
    if status in (402, 429):
        return SEM_CREDITO if status == 402 or _fala_da_cobranca(detalhe) else LIMITE_DE_USO
    if status >= 500:
        return FORA_DO_AR
    return PEDIDO_RECUSADO


def _imagem_invalida(status, detalhe):
    return status == 400 and detalhe.get("code") == "invalid_image_format"


def _fala_da_cobranca(detalhe):
    codigo = str(detalhe.get("code") or detalhe.get("type") or "")
    return "quota" in codigo or "billing" in codigo


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
    if _imagem_invalida(status, detalhe):
        return IMAGEM_INVALIDA
    if status in (401, 403):
        return PLANO_RECUSOU
    return FORA_DO_AR if status >= 500 else (LIMITE_DE_USO if status == 429 else PEDIDO_RECUSADO)


class _Pedido:
    """A POST of a JSON body to OpenAI, with the key or the plan's token as the bearer."""

    def __init__(self, url, segredo, corpo, tempo):
        self.url, self.segredo, self.corpo, self.tempo = url, segredo, corpo, tempo

    def _http(self, aceita=None):
        pedido = urllib.request.Request(self.url, data=json.dumps(self.corpo).encode("utf-8"), method="POST")
        pedido.add_header("Authorization", "Bearer " + self.segredo)
        pedido.add_header("Content-Type", "application/json")
        if aceita:
            pedido.add_header("Accept", aceita)
        return pedido

    def _abrir(self, pedido):
        return urllib.request.urlopen(pedido, timeout=self.tempo, context=contexto_tls())

    def resposta(self):
        pedido = self._http()
        try:
            with self._abrir(pedido) as resposta:
                return json.loads(resposta.read().decode("utf-8"))
        except urllib.error.HTTPError as erro:
            detalhe = _detalhe_do_erro(erro)
            erro.close()
            raise ErroDaOpenAI(_classificar(erro.code, detalhe), erro.code) from None
        except (urllib.error.URLError, OSError, ValueError):
            raise ErroDaOpenAI(FORA_DO_AR) from None

    def stream(self):
        pedido = self._http(aceita="text/event-stream")
        try:
            with self._abrir(pedido) as resposta:
                return _LeituraDoStream().ate_o_fim(resposta)
        except urllib.error.HTTPError as erro:
            raise ErroDaOpenAI(_classificar_do_plano(erro.code, _detalhe_do_erro(erro)), erro.code) from None
        except (urllib.error.URLError, OSError, ValueError):
            raise ErroDaOpenAI(FORA_DO_AR) from None


class _LeituraDoStream:
    def __init__(self):
        self.pedacos = []

    def ate_o_fim(self, linhas):
        for linha in linhas:
            if not linha.startswith(b"data:"):
                continue
            evento = json.loads(linha[5:].decode("utf-8"))
            ler = _LEITORES_DO_EVENTO.get(_tipo_do_evento(evento))
            fim = ler(self, evento) if ler else None
            if fim is not None:
                return fim
        raise ErroDaOpenAI(FORA_DO_AR)

    def pedaco(self, evento):
        self.pedacos.append(str(evento.get("delta") or ""))

    def concluida(self, evento):
        return "".join(self.pedacos).strip(), (evento.get("response") or {}).get("usage") or {}

    def falhou(self, evento):
        erro = (evento.get("response") or {}).get("error") or evento.get("error") or evento
        raise ErroDaOpenAI(_classificar_do_plano(500, erro if isinstance(erro, dict) else {}))

    def incompleta(self, evento):
        raise ErroDaOpenAI(RESPOSTA_INCOMPLETA)


_LEITORES_DO_EVENTO = {
    "response.output_text.delta": _LeituraDoStream.pedaco,
    "response.completed": _LeituraDoStream.concluida,
    "response.failed": _LeituraDoStream.falhou,
    "error": _LeituraDoStream.falhou,
    "response.incomplete": _LeituraDoStream.incompleta,
}


def _tipo_do_evento(evento):
    tipo = evento.get("type") if isinstance(evento, dict) else None
    return tipo if isinstance(tipo, str) else None


def _com_repeticoes(enviar, repeticoes):
    """`enviar()` once, and again `repeticoes` times after a passing refusal, waiting twice as long each time."""
    espera = ESPERA_ENTRE_TENTATIVAS
    for tentativa in range(repeticoes + 1):
        try:
            return enviar()
        except ErroDaOpenAI as recusa:
            if tentativa == repeticoes or not passageira(recusa.codigo, recusa.status):
                raise
        time.sleep(espera)
        espera *= 2


class PerguntaDaResponses(namedtuple("PerguntaDaResponses", "instrucoes mensagem formato_json", defaults=(False,))):
    """What the ChatGPT plan is asked: the system prompt as `instructions`, the user's message and whether the answer is a JSON object."""

    def corpo(self, modelo):
        corpo = {"model": modelo, "instructions": self.instrucoes, "input": [{"role": "user", "content": self.mensagem}], "store": False, "stream": True}
        if self.formato_json:
            corpo["text"] = {"format": {"type": "json_object"}}
        return corpo


def _base_de(cred):
    return cred.get("base") or OPENAI_BASE


def responder(cred, pergunta, paciencia=PACIENCIA_DO_TEXTO):
    """POST /v1/responses with the ChatGPT plan's access token (`cred["segredo"]`): no `temperature`, the system prompt as `instructions`,
    `store: false` and `stream: true` (the SIWC "Preview limitations"). The `pergunta`'s message is a text, or the parts of the user's
    message (`input_text` and `input_image`, the image judge); its `formato_json` asks for a JSON object by `text.format`. Returns
    (text, usage) only after `response.completed`; anything else is `ErroDaOpenAI` with a code, never what the plan wrote. A passing
    refusal (`passageira`) is asked again `paciencia.repeticoes` times."""
    pedido = _Pedido(_base_de(cred) + "/v1/responses", cred["segredo"], pergunta.corpo(cred["modelo"]), paciencia.tempo)
    return _com_repeticoes(pedido.stream, paciencia.repeticoes)


def passageira(codigo, status):
    """A refusal worth asking again: the server or the network failed, or OpenAI asked to slow down (never the key or the billing)."""
    return codigo == FORA_DO_AR or codigo == LIMITE_DE_USO or status in (408, 409)


class PerguntaDoChat(namedtuple("PerguntaDoChat", "mensagens temperatura formato_json max_tokens", defaults=(None, False, None))):
    """What the key is asked: the chat's messages, and how the text must come (a `temperatura`, a JSON object, a `max_tokens`)."""

    def corpo(self, modelo):
        corpo = {"model": modelo, "messages": self.mensagens}
        if self.temperatura is not None:
            corpo["temperature"] = self.temperatura
        if self.formato_json:
            corpo["response_format"] = {"type": "json_object"}
        if self.max_tokens is not None:
            corpo["max_tokens"] = self.max_tokens
        return corpo


def _texto_da_primeira_escolha(dados):
    escolha = (dados.get("choices") or [{}])[0] or {}
    return ((escolha.get("message") or {}).get("content") or "").strip()


def completar(cred, pergunta, paciencia=PACIENCIA_DO_TEXTO):
    """POST /v1/chat/completions. Returns (text, usage): the first choice's text ('' if none) and the `usage` dict."""
    pedido = _Pedido(_base_de(cred) + "/v1/chat/completions", cred["segredo"], pergunta.corpo(cred["modelo"]), paciencia.tempo)
    dados = _com_repeticoes(pedido.resposta, paciencia.repeticoes)
    return _texto_da_primeira_escolha(dados), dados.get("usage") or {}


def _partes_da_responses(partes):
    """The chat's parts as the Responses API's: `input_text` and `input_image`. `json_object` needs the word JSON in the input."""
    convertidas = [
        {"type": "input_image", "image_url": parte["image_url"]["url"]} if parte["type"] == "image_url" else {"type": "input_text", "text": parte["text"]}
        for parte in partes
    ]
    convertidas[0]["text"] += "\nReply with the JSON verdict."
    return convertidas


def _uso(bruto, entrada, saida):
    return {"entrada": bruto.get(entrada) or 0, "saida": bruto.get(saida) or 0} if bruto else {}


def _texto_do_plano(cred, pergunta, paciencia):
    resposta, bruto = responder(cred, pergunta, paciencia)
    return resposta, {"entrada": bruto.get("input_tokens") or 0, "saida": bruto.get("output_tokens") or 0}


def _texto_da_chave(cred, pergunta, paciencia):
    resposta, bruto = completar(cred, pergunta, paciencia)
    return resposta, _uso(bruto, "prompt_tokens", "completion_tokens")


def texto(cred, sistema, mensagem, json=False, temperatura=None, max_tokens=None, tempo=None, repeticoes=0):
    """The provider layer's `texto` for OpenAI: the key's chat completions, or the ChatGPT plan's Responses API when `cred["via"]` is `plano`
    (no `temperature` or `max_tokens` there; a list `mensagem` is converted to the Responses API's parts). Returns (text, {entrada, saida}):
    `{}` when the answer had no usage and the key is the one paying."""
    paciencia = Paciencia(tempo or TEMPO_PADRAO, repeticoes)
    if cred.get("via") == "plano":
        partes = _partes_da_responses(mensagem) if isinstance(mensagem, list) else mensagem
        return _texto_do_plano(cred, PerguntaDaResponses(sistema, partes, json), paciencia)
    mensagens = [{"role": "system", "content": sistema}, {"role": "user", "content": mensagem}]
    return _texto_da_chave(cred, PerguntaDoChat(mensagens, temperatura, json, max_tokens), paciencia)


def imagem(cred, prompt, tamanho):
    """The provider layer's `imagem` for OpenAI, POST /v1/images/generations: the first image of the answer, `{"b64_json": ...}` or
    `{"url": ...}` (`{}` if none)."""
    url, segredo = (cred.get("base") or OPENAI_BASE) + "/v1/images/generations", cred["segredo"]
    pedido = _Pedido(url, segredo, {"model": cred["modelo"], "prompt": prompt, "n": 1, "size": tamanho}, TEMPO_DA_IMAGEM)
    primeira = (_com_repeticoes(pedido.resposta, REPETICOES_DA_IMAGEM).get("data") or [{}])[0]
    return primeira if isinstance(primeira, dict) else {}

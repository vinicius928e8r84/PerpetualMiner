"""Conferir uma chave da OpenAI: dois pedidos baratos, só com a biblioteca padrão.

A extensão não fala com a OpenAI (não tem a permissão de host, e é a Conexão quem gasta a chave): quem
confere é a Conexão, e responde só um código. O que a OpenAI diz ao recusar nunca é copiado para o log nem para
a resposta, porque a mensagem de uma chave recusada repete pedaços dela.

1. `GET /v1/models`: a chave vale? Só um 200 é a OpenAI dizendo que sim (401 → recusada; qualquer outra
   resposta, como um limite de uso, é “não deu para conferir” e nada é guardado)
2. `POST /v1/embeddings` com uma palavra: a conta tem crédito? É o pedido pago mais barato que existe, e só
   ele diz “sem crédito” (429 `insufficient_quota`) antes do primeiro Cartão. Um modelo que a OpenAI tire
   do ar (404) ou uma chave restrita sem esta permissão não reprova a chave.
"""

import json
import ssl
import urllib.error
import urllib.request

TEMPO_DE_CADA_PEDIDO = 15

RECUSADA = "openai_key_rejected"
SEM_CREDITO = "openai_no_credit"
ORGANIZACAO_NAO_VERIFICADA = "openai_org_not_verified"
FORA_DO_AR = "openai_unreachable"


class ErroDaChave(Exception):
    """A OpenAI não aceitou a chave: `codigo` é um dos de cima, o que o contrato devolve à extensão."""

    def __init__(self, codigo):
        super().__init__(codigo)
        self.codigo = codigo


def _contexto_tls():
    # O Python do Anki do Mac nem sempre acha as autoridades do sistema; o Anki leva o `certifi`.
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


def _pedir(base, metodo, caminho, chave, corpo=None):
    """(status, erro) da OpenAI; levanta `ErroDaChave(FORA_DO_AR)` se nem a resposta chegou."""
    dados = None if corpo is None else json.dumps(corpo).encode("utf-8")
    pedido = urllib.request.Request(base + caminho, data=dados, method=metodo)
    pedido.add_header("Authorization", "Bearer " + chave)
    if dados is not None:
        pedido.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(pedido, timeout=TEMPO_DE_CADA_PEDIDO, context=_contexto_tls()) as resposta:
            return resposta.status, {}
    except urllib.error.HTTPError as erro:
        try:
            detalhe = json.loads(erro.read(65536).decode("utf-8")).get("error") or {}
        except (ValueError, AttributeError, OSError):
            detalhe = {}
        return erro.code, detalhe if isinstance(detalhe, dict) else {}
    except (urllib.error.URLError, OSError, ValueError):
        raise ErroDaChave(FORA_DO_AR)


def _classificar(status, erro):
    """O código do erro da chave que esta resposta mostra, ou None se ela não diz nada contra a chave."""
    if status >= 500:
        return FORA_DO_AR
    if status == 401:
        return RECUSADA
    mensagem = str(erro.get("message") or "").lower()
    if status == 403 and "organization" in mensagem and "verif" in mensagem:
        return ORGANIZACAO_NAO_VERIFICADA
    if status == 429 and "insufficient_quota" in (str(erro.get("code")), str(erro.get("type"))):
        return SEM_CREDITO
    return None


def conferir(base, chave, logger):
    """Levanta `ErroDaChave` se a OpenAI não aceita a chave; volta sem nada se aceita."""
    try:
        status, erro = _pedir(base, "GET", "/v1/models", chave)
        codigo = _classificar(status, erro)
        if codigo is None and status == 403:
            codigo = RECUSADA  # uma chave que nem lista os modelos não serve
        if codigo is None and status != 200:
            # Um limite de uso (429), um 404 ou qualquer outra coisa: a OpenAI não disse que a chave vale.
            codigo = FORA_DO_AR
        if codigo is None:
            status, erro = _pedir(base, "POST", "/v1/embeddings", chave, {"model": "text-embedding-3-small", "input": "ok"})
            codigo = _classificar(status, erro)
    except ErroDaChave as falha:
        logger.warning("Não deu para falar com a OpenAI ao conferir a chave")
        raise falha
    if codigo is not None:
        logger.info("A OpenAI não aceitou a chave: %s (HTTP %s)", codigo, status)
        raise ErroDaChave(codigo)

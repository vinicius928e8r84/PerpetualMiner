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
    def __init__(self, codigo):
        super().__init__(codigo)
        self.codigo = codigo


def contexto_tls():
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


def _pedido(base, chave, caminho, corpo=None):
    dados = None if corpo is None else json.dumps(corpo).encode("utf-8")
    pedido = urllib.request.Request(base + caminho, data=dados, method="GET" if dados is None else "POST")
    pedido.add_header("Authorization", "Bearer " + chave)
    if dados is not None:
        pedido.add_header("Content-Type", "application/json")
    return pedido


def _pedir(pedido, ler=False):
    try:
        with urllib.request.urlopen(pedido, timeout=TEMPO_DE_CADA_PEDIDO, context=contexto_tls()) as resposta:
            lido = json.loads(resposta.read(1024 * 1024).decode("utf-8")) if ler and resposta.status == 200 else {}
            return resposta.status, lido if isinstance(lido, dict) else {}
    except urllib.error.HTTPError as erro:
        try:
            detalhe = json.loads(erro.read(65536).decode("utf-8")).get("error") or {}
        except (ValueError, AttributeError, OSError):
            detalhe = {}
        return erro.code, detalhe if isinstance(detalhe, dict) else {}
    except (urllib.error.URLError, OSError, ValueError):
        raise ErroDaChave(FORA_DO_AR)


def _classificar(status, erro):
    if status >= 500:
        return FORA_DO_AR
    if status == 401:
        return RECUSADA
    if status == 403 and _fala_da_organizacao_nao_verificada(erro):
        return ORGANIZACAO_NAO_VERIFICADA
    if status in (402, 429):
        return SEM_CREDITO
    return None


def _fala_da_organizacao_nao_verificada(erro):
    mensagem = str(erro.get("message") or "").lower()
    return "organization" in mensagem and "verif" in mensagem


def _codigo_da_lista_de_modelos(status, erro):
    codigo = _classificar(status, erro)
    if codigo is not None or status == 200:
        return codigo
    return RECUSADA if status == 403 else FORA_DO_AR


def conferir(base, chave, logger):
    try:
        status, erro = _pedir(_pedido(base, chave, "/v1/models"))
        codigo = _codigo_da_lista_de_modelos(status, erro)
        if codigo is None:
            status, erro = _pedir(_pedido(base, chave, "/v1/embeddings", {"model": "text-embedding-3-small", "input": "ok"}))
            codigo = _classificar(status, erro)
    except ErroDaChave as falha:
        logger.warning("Não deu para falar com a OpenAI ao conferir a chave")
        raise falha
    if codigo is not None:
        logger.info("A OpenAI não aceitou a chave: %s (HTTP %s)", codigo, status)
        raise ErroDaChave(codigo)


def modelos_da_conta(base, chave):
    status, corpo = _pedir(_pedido(base, chave, "/v1/models"), ler=True)
    if status != 200:
        raise ErroDaChave(_classificar(status, corpo) or FORA_DO_AR)
    return [modelo["id"] for modelo in corpo.get("data", []) if isinstance(modelo, dict) and isinstance(modelo.get("id"), str)]

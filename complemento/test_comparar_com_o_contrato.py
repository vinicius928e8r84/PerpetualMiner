"""A conferência de uma resposta contra a do exemplo do contrato (a do fake do e2e é `e2e/fakes/diferenca-do-contrato.js`)."""

import re

INICIO_DA_URL_DE_AUTORIZACAO = "https://auth.openai.com/api/accounts/authorize?client_id=dynamic_agent_client&"


def _casa(formato):
    return lambda obtido: isinstance(obtido, str) and bool(re.fullmatch(formato, obtido))


def _e_a_url_de_autorizacao(obtido):
    return isinstance(obtido, str) and obtido.startswith(INICIO_DA_URL_DE_AUTORIZACAO)


_BASE64_DE_32_BYTES = _casa(r"[A-Za-z0-9+/]{43}=")

MARCAS_DO_CONTRATO = {
    "<segredo>": _BASE64_DE_32_BYTES,
    "<prova>": _BASE64_DE_32_BYTES,
    "<sessão>": _casa(r"[0-9a-f]{32}"),
    "<agora>": _casa(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z"),
    "<áudio>": _casa(r"[A-Za-z0-9+/]+={0,2}"),
    "<url de autorização>": _e_a_url_de_autorizacao,
}


def _dicionario_igual(obtido, esperado):
    return isinstance(obtido, dict) and obtido.keys() == esperado.keys() and all(igual_ao_do_contrato(obtido[k], v) for k, v in esperado.items())


def _lista_igual(obtido, esperado):
    return isinstance(obtido, list) and len(obtido) == len(esperado) and all(igual_ao_do_contrato(o, e) for o, e in zip(obtido, esperado))


def igual_ao_do_contrato(obtido, esperado):
    """O JSON obtido é o do contrato; `"<agora>"` é qualquer instante ISO 8601 (Z), `"<url de autorização>"`, a do login do ChatGPT e
    `"<áudio>"`, um áudio em base64 que não é vazio (o do Ouvir, #174). Do pareamento (#192): `"<segredo>"` e `"<prova>"` são 32 bytes em
    base64 e `"<sessão>"`, 32 caracteres hexadecimais; o valor muda a cada pareamento e a cada subida da Conexão."""
    if isinstance(esperado, str) and esperado in MARCAS_DO_CONTRATO:
        return MARCAS_DO_CONTRATO[esperado](obtido)
    if isinstance(esperado, dict):
        return _dicionario_igual(obtido, esperado)
    if isinstance(esperado, list):
        return _lista_igual(obtido, esperado)
    return obtido == esperado

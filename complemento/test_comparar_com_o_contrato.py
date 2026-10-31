"""A conferência de uma resposta contra a do exemplo do contrato (a do fake do e2e é `e2e/fakes/diferenca-do-contrato.js`)."""

import re


def igual_ao_do_contrato(obtido, esperado):
    """O JSON obtido é o do contrato; `"<agora>"` é qualquer instante ISO 8601 (Z), `"<url de autorização>"`, a do login do ChatGPT e
    `"<áudio>"`, um áudio em base64 que não é vazio (o do Ouvir, #174)."""
    if esperado == "<agora>":
        return isinstance(obtido, str) and bool(re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z", obtido))
    if esperado == "<áudio>":
        return isinstance(obtido, str) and bool(re.fullmatch(r"[A-Za-z0-9+/]+={0,2}", obtido))
    if esperado == "<url de autorização>":
        return isinstance(obtido, str) and obtido.startswith("https://auth.openai.com/api/accounts/authorize?client_id=dynamic_agent_client&")
    if isinstance(esperado, dict):
        return isinstance(obtido, dict) and obtido.keys() == esperado.keys() and all(igual_ao_do_contrato(obtido[k], v) for k, v in esperado.items())
    if isinstance(esperado, list):
        return isinstance(obtido, list) and len(obtido) == len(esperado) and all(igual_ao_do_contrato(o, e) for o, e in zip(obtido, esperado))
    return obtido == esperado

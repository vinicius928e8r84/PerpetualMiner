"""O que o navegador pede à Conexão, fora do contrato com a extensão (#155): o retorno do login do ChatGPT (navegação, sem `Origin`;
decisão da spec #138), e as três rotas do login que a extensão pede. `servidor.py` as lista em `ROTAS`, `PAGINAS` e `ROTAS_ABERTAS`."""

from urllib.parse import parse_qs

from . import chatgpt_oficial
from .rotas_do_chatgpt import entrar_com_o_chatgpt, estado_do_chatgpt, retorno_do_login, sair_do_chatgpt

# Entrar com o ChatGPT: nenhuma resposta devolve um token.
ROTAS_DO_CHATGPT = {
    ("POST", "/ia/chatgpt/estado"): estado_do_chatgpt,
    ("POST", "/ia/chatgpt/entrar"): entrar_com_o_chatgpt,
    ("POST", "/ia/chatgpt/sair"): sair_do_chatgpt,
}

# Cada página é `(conexao, consulta, host) -> bytes` de um HTML, e nunca levanta erro.
PAGINAS = {("GET", chatgpt_oficial.CAMINHO_DO_RETORNO): retorno_do_login}


def responder_a_pagina(atendente, pagina):
    """Uma página para o navegador: sem cache, sem referenciador e sem nada a carregar ou executar."""
    busca = parse_qs(atendente.path.split("?", 1)[1] if "?" in atendente.path else "")
    consulta = {nome: valores[0] for nome, valores in busca.items() if len(valores) == 1}
    corpo = pagina(atendente.conexao, consulta, atendente.headers.get("Host"))
    atendente.send_response(200)
    for nome, valor in (("Content-Type", "text/html; charset=utf-8"), ("Content-Length", str(len(corpo))), ("Cache-Control", "no-store"),
                        ("Referrer-Policy", "no-referrer"), ("Content-Security-Policy", "default-src 'none'"),
                        ("X-Content-Type-Options", "nosniff")):
        atendente.send_header(nome, valor)
    atendente.end_headers()
    atendente.wfile.write(corpo)

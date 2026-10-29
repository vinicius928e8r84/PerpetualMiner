"""As rotas de Entrar com o ChatGPT (#155): o estado, entrar e sair, que a extensão pede (POST com a origem dela, listadas em
`servidor.ROTAS`), e o retorno do login, que o navegador pede (`GET /auth/callback`, em `servidor.PAGINAS`). Nenhuma devolve
um token; o retorno responde sempre a mesma página. O desenho: `docs/design/login-do-chatgpt.md`."""

# A página do retorno: a mesma para todo pedido (deu certo, outro `state`, recusa, nada), para não dizer nada do que chegou.
# Quem diz se o login deu certo é a coluna da Conta do ChatGPT no painel.
PAGINA_DO_RETORNO = (
    "<!doctype html><html lang=\"pt-BR\"><meta charset=\"utf-8\"><title>PerpetualMiner</title>"
    "<p>Pode fechar esta aba e voltar ao PerpetualMiner.</p></html>"
).encode("utf-8")


def estado_do_chatgpt(conexao, corpo):
    return 200, conexao.chatgpt.estado()


def entrar_com_o_chatgpt(conexao, corpo):
    """O botão Continuar com o ChatGPT: uma tentativa nova e a URL que a extensão abre numa aba."""
    return 200, {"url": conexao.chatgpt.iniciar(conexao.porta)}


def sair_do_chatgpt(conexao, corpo):
    return 200, {"ok": True, "revogada": conexao.chatgpt.sair()}


def retorno_do_login(conexao, consulta, host):
    """`GET /auth/callback`: entrega o retorno ao login (que só aceita a tentativa certa) e devolve a página fixa, aconteça o que acontecer."""
    try:
        conexao.chatgpt.receber(consulta, host, conexao.porta)
    except Exception as erro:  # só o tipo vai ao log: a mensagem poderia citar o que veio no pedido
        conexao.logger.error("Entrar com o ChatGPT: erro no retorno (%s)", type(erro).__name__)
    return PAGINA_DO_RETORNO

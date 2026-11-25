PAGINA_DO_RETORNO = (
    "<!doctype html><html lang=\"pt-BR\"><meta charset=\"utf-8\"><title>PerpetualMiner</title>"
    "<p>Pode fechar esta aba e voltar ao PerpetualMiner.</p></html>"
).encode("utf-8")


def estado_do_chatgpt(conexao, corpo):
    return 200, conexao.chatgpt.estado()


def entrar_com_o_chatgpt(conexao, corpo):
    return 200, {"url": conexao.chatgpt.iniciar(conexao.porta)}


def sair_do_chatgpt(conexao, corpo):
    return 200, {"ok": True, "revogada": conexao.chatgpt.sair()}


def retorno_do_login(conexao, consulta, host):
    try:
        conexao.chatgpt.receber(consulta, host, conexao.porta)
    except Exception as erro:
        conexao.logger.error("Entrar com o ChatGPT: erro no retorno (%s)", type(erro).__name__)
    return PAGINA_DO_RETORNO

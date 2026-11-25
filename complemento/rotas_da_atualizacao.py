
def atualizar_agora(conexao, corpo):
    return 200, conexao.atualizacao.verificar(a_pedido=True)


def reiniciar_o_anki(conexao, corpo):
    if not conexao.atualizacao.fechar_o_anki():
        return 503, {"error": "restart_unavailable"}
    conexao.logger.info("O Anki foi fechado a pedido da extensão, para a Conexão nova valer")
    return 200, {"ok": True}


ROTAS_DA_ATUALIZACAO = {
    ("POST", "/atualizacao/agora"): atualizar_agora,
    ("POST", "/atualizacao/reiniciar"): reiniciar_o_anki,
}

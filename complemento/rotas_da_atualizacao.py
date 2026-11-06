"""As rotas da atualização da Conexão (#177, `atualizacao.py`): "Atualizar agora" e "Reiniciar o Anki". POST com a origem da extensão,
listadas em `servidor.ROTAS`. A saúde (`GET /health`) leva o mesmo `estado()` em `atualizacao`, quando há o que dizer.

- `POST /atualizacao/agora`: consulta o AnkiWeb e instala o que houver, e responde o `estado()`. Quem demora é o AnkiWeb: a extensão espera.
- `POST /atualizacao/reiniciar`: fecha o Anki pelo caminho normal dele (salva a coleção); quem o abre de novo é o abridor, a pedido da extensão.
  `503 restart_unavailable` quando o Anki não entregou o pedido.
"""


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

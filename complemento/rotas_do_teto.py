
def estado_do_teto(conexao, corpo):
    return 200, conexao.teto.estado()


def definir_o_teto(conexao, corpo):
    if conexao.teto.definir(corpo.get("limitUsd")) is None:
        return 400, {"error": "invalid_request"}
    return 200, conexao.teto.estado()


ROTAS_DO_TETO = {
    ("POST", "/custos/teto"): estado_do_teto,
    ("POST", "/custos/teto/definir"): definir_o_teto,
}

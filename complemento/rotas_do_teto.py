"""As rotas do teto do mês (#160): ler (o teto, o gasto do mês e o mês) e subir ou baixar o teto. POST com a origem da extensão, listadas em
`servidor.ROTAS`. O valor é dólares positivos; qualquer outra coisa é `invalid_request` e o teto guardado não muda."""


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

from .pareamento import CLIENTE, DESAFIO


def _texto(corpo, campo, maximo):
    valor = corpo.get(campo)
    return valor if isinstance(valor, str) and 0 < len(valor) <= maximo else None


def _cliente_valido(cliente):
    return cliente is not None and bool(CLIENTE.match(cliente))


def _desafio_valido(desafio):
    return desafio is not None and bool(DESAFIO.match(desafio))


def _nome_valido(nome):
    return isinstance(nome, str) and len(nome) <= 60


def comecar(conexao, corpo):
    return conexao.pareamento.comecar()


def concluir(conexao, corpo):
    codigo, cliente = _texto(corpo, "codigo", 32), _texto(corpo, "cliente", 36)
    nome = corpo.get("nome", "")
    if not all((codigo is not None, _cliente_valido(cliente), _nome_valido(nome))):
        return 400, {"error": "invalid_request"}
    return conexao.pareamento.concluir(codigo, cliente, nome)


def conferir(conexao, corpo):
    cliente, desafio = _texto(corpo, "cliente", 36), _texto(corpo, "desafio", 128)
    if not (_cliente_valido(cliente) and _desafio_valido(desafio)):
        return 400, {"error": "invalid_request"}
    return conexao.pareamento.conferir(cliente, desafio)


ROTAS_DO_PAREAMENTO = {
    ("POST", "/pareamento/comecar"): comecar,
    ("POST", "/pareamento/concluir"): concluir,
    ("POST", "/pareamento/conferir"): conferir,
}

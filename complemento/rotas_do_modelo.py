"""As rotas do modelo dos cartões (#157): o estado (a escolha, a lista da conta, o aviso e o que foi trocado) e a escolha. POST com a
origem da extensão, listadas em `servidor.ROTAS`; nenhuma resposta leva a chave nem um token. O desenho: `docs/design/modelo-dos-cartoes.md`."""

from .modelo_dos_cartoes import ModelosIndisponiveis


def _sem_a_lista():
    return 503, {"error": "models_unavailable"}


def estado_do_modelo(conexao, corpo):
    try:
        return 200, conexao.modelos.estado()
    except ModelosIndisponiveis:
        return _sem_a_lista()


def escolher_o_modelo(conexao, corpo):
    try:
        return conexao.modelos.escolher(corpo.get("modelo"))
    except ModelosIndisponiveis:
        return _sem_a_lista()


ROTAS_DO_MODELO = {
    ("POST", "/ia/modelo/estado"): estado_do_modelo,
    ("POST", "/ia/modelo/escolher"): escolher_o_modelo,
}

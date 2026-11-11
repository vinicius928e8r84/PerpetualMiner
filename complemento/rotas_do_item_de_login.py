"""As rotas de “Abrir o Anki com o computador”: o estado do item de login e ligá-lo ou desligá-lo (`item_de_login.py`)."""

from .item_de_login import AnkiNaoEncontrado


def _estado_do_item_de_login(conexao, corpo):
    item = conexao.item_de_login
    return 200, {"ok": True, "ligado": item is not None and item.ligado()}


def _abrir_com_o_computador(conexao, corpo):
    """Escreve (`ligado: true`) ou apaga (`ligado: false`) o item de login que abre o Anki com o computador."""
    ligado = corpo.get("ligado")
    if not isinstance(ligado, bool):
        return 400, {"error": "invalid_request"}
    item = conexao.item_de_login
    if item is None:
        return 501, {"error": "login_item_unsupported"}
    try:
        if ligado:
            item.ligar()
        else:
            item.desligar()
    except AnkiNaoEncontrado:
        conexao.logger.warning("Abrir o Anki com o computador: não se sabe onde o Anki está")
        return 500, {"error": "anki_not_found"}
    except OSError:
        conexao.logger.exception("Abrir o Anki com o computador: não deu para %s o item de login", "escrever" if ligado else "apagar")
        return 500, {"error": "login_item_failed"}
    conexao.logger.info("Abrir o Anki com o computador: %s", "ligado" if item.ligado() else "desligado")
    return 200, {"ok": True, "ligado": item.ligado()}


ROTAS_DO_ITEM_DE_LOGIN = {
    ("POST", "/abrir-com-o-computador/estado"): _estado_do_item_de_login,
    ("POST", "/abrir-com-o-computador"): _abrir_com_o_computador,
}

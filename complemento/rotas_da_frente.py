from . import baralhos, tipo_de_nota
from .motor import estilos


def _recusa_do_pedido(lang, frente):
    if lang not in estilos.idiomas():
        return 400, {"error": "invalid_lang"}
    if frente not in tipo_de_nota.FRENTES:
        return 400, {"error": "invalid_front"}
    return None


def trocar_a_frente(conexao, corpo):
    lang, frente = corpo.get("lang"), corpo.get("frente")
    recusa = _recusa_do_pedido(lang, frente)
    if recusa:
        return recusa
    try:
        mudou = tipo_de_nota.trocar_a_frente(conexao.colecao, lang, frente)
    except baralhos.ColecaoIndisponivel as motivo:
        return 503, {"error": "anki_card_front_unavailable", "detail": str(motivo)}
    except baralhos.TipoDeNotaAlterado:
        return 409, {"error": "note_type_changed"}
    conexao.logger.info("Frente do Cartão (%s): %s%s", lang, frente, "" if mudou else " (já estava)")
    return 200, {"ok": True}


ROTAS_DA_FRENTE = {("POST", "/anki/card-front"): trocar_a_frente}

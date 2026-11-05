"""A rota da frente do Cartão (`/anki/card-front`, #166): a troca da frente de um idioma. É uma função `(conexao, corpo) -> (status, json)`, listada em
`servidor.ROTAS`. Só reescreve o modelo de Cartão do tipo de nota do idioma (`tipo_de_nota.trocar_a_frente`): nenhuma nota, nenhuma chamada à IA."""

from . import baralhos, tipo_de_nota
from .motor import estilos


def trocar_a_frente(conexao, corpo):
    """“Frente” dos Ajustes de envio › Estilo do cartão: os Cartões do idioma passam a ter a frente na hora. Repetir responde igual e não muda nada."""
    lang, frente = corpo.get("lang"), corpo.get("frente")
    if lang not in estilos.idiomas():
        return 400, {"error": "invalid_lang"}
    if frente not in tipo_de_nota.FRENTES:
        return 400, {"error": "invalid_front"}
    try:
        mudou = tipo_de_nota.trocar_a_frente(conexao.colecao, lang, frente)
    except baralhos.ColecaoIndisponivel as motivo:
        return 503, {"error": "anki_card_front_unavailable", "detail": str(motivo)}
    except baralhos.TipoDeNotaAlterado:
        return 409, {"error": "note_type_changed"}
    conexao.logger.info("Frente do Cartão (%s): %s%s", lang, frente, "" if mudou else " (já estava)")
    return 200, {"ok": True}


ROTAS_DA_FRENTE = {("POST", "/anki/card-front"): trocar_a_frente}

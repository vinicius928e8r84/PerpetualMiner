"""As rotas de leitura da coleção do Anki (`/anki/decks`, `/anki/stats/decks`, `/anki/vocabulary`): cada uma é uma função `(conexao, corpo) -> (status, json)`,
listada em `servidor.ROTAS`. Sem coleção aberta (ou com o Anki sem responder) é 503 com o `error` da rota."""

from . import baralhos
from .motor import estilos


def _lendo_a_colecao(erro_do_contrato, leitura):
    """Roda a leitura da coleção; sem coleção aberta (ou com o Anki sem responder) é 503 com o `erro_do_contrato`."""
    try:
        return 200, leitura()
    except baralhos.ColecaoIndisponivel as motivo:
        return 503, {"error": erro_do_contrato, "detail": str(motivo)}


def _baralhos_do_anki(conexao, corpo):
    return _lendo_a_colecao("anki_decks_unavailable", lambda: {"decks": baralhos.nomes_dos_baralhos(conexao.colecao)})


def _numeros_dos_baralhos(conexao, corpo):
    pedidos = corpo.get("decks")
    if not isinstance(pedidos, list) or not pedidos or not all(isinstance(pedido, dict) for pedido in pedidos):
        return 400, {"error": "decks_required"}
    return _lendo_a_colecao("anki_stats_unavailable", lambda: baralhos.numeros_dos_baralhos(conexao.colecao, pedidos))


def _vocabulario(conexao, corpo):
    nome = str(corpo.get("deck") or "").strip()
    idioma = str(corpo.get("lang") or "en").strip().lower()
    if not nome:
        return 400, {"error": "deck_required"}
    if idioma not in estilos.idiomas():
        return 400, {"error": "invalid_lang"}
    return _lendo_a_colecao(
        "anki_vocabulary_unavailable", lambda: baralhos.vocabulario(conexao.colecao, nome, idioma, corpo)
    )


ROTAS_DOS_BARALHOS = {
    ("POST", "/anki/decks"): _baralhos_do_anki,
    ("POST", "/anki/stats/decks"): _numeros_dos_baralhos,
    ("POST", "/anki/vocabulary"): _vocabulario,
}

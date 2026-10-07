"""As duas cópias da normalização do cartão respondem igual aos mesmos casos.

`complemento/normalizacao.py` (a Conexão como complemento do Anki) repete 19 funções de
`bridge/card_normalization.py` (a Conexão de hoje). A fonte de verdade é `card_normalization.py`,
enquanto o bridge existir; o complemento segue dele. Este teste chama as duas cópias com os mesmos
casos (EN e RU, com o normalizador russo ausente, injetado e quebrado) e compara as respostas.
Quando o bridge for aposentado (#179), este arquivo sai junto, e `normalizacao.py` fica sozinho.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
for pasta in (RAIZ, RAIZ / "bridge"):
    if str(pasta) not in sys.path:
        sys.path.insert(0, str(pasta))

import card_normalization as bridge  # noqa: E402  (apos ajustar sys.path)
from complemento import normalizacao as complemento  # noqa: E402

FRENTES_EN = [
    "",
    "I never take it for <b>granted</b>.",
    "She <b>ran</b> and <b>jumped</b> over the <b>fences</b> [sound:x.mp3]",
    "<b>Kick</b> the <b>bucket</b><br>It's John's",
    "Plain text without bold, women and children's toys",
    "x2 snake_case 3rd don't well-known",
]
VERSOS_EN = [
    "",
    "to <b>take</b> it for granted /teɪk/ – Definition: not value",
    "bucket /ˈbʌkɪt/ → balde<br>Trigger: x",
    "no slashes here",
]
FRENTES_RU = [
    "",
    "Я улыбаюсь каждое утро без причины. [Context: Ep. 3]",
    "Ёлка стоит в углу [комната]",
    "Он  <b>сказал</b>  нет-нет",
]
PALAVRAS = ["", "cats", "running", "played", "cities", "wolves", "children", "boss", "is", "John's", "123", "Ёлка",
           "ties", "cries", "wives", "knives", "sing", "singing", "stopping", "bed", "fed", "tied", "loved", "shipped",
           "seed", "going", "bus", "this", "gas", "glass", "goods", "feet", "teeth", "people", "women", "-dash-", "o'clock", "Dogs"]
CARTOES_EN = [
    {"front": "I never take it for <b>granted</b>.", "back": "granted /x/", "bucket": "new", "created": 3, "noteId": 1},
    {"front": "She <b>ran</b> over the <b>fences</b>", "back": "", "bucket": "young", "created": 1, "noteId": 2},
    {"front": "<b>kick the bucket</b> now", "back": "", "bucket": "mature", "created": 2, "noteId": 3},
    {"front": "plain words only", "back": "plain /x/", "bucket": "learning", "created": 2, "noteId": 4},
    {"front": "", "back": "", "bucket": "", "created": 0, "noteId": 5},
    {"front": "bad bucket", "back": "", "bucket": "suspended"},
    {"front": "the quiet harbor woke before the gulls did", "back": "", "bucket": "new", "created": 4, "noteId": 7},
    {"front": "the gulls woke the harbor", "back": "", "bucket": "new", "created": 5, "noteId": 8},
]
CARTOES_RU = [
    {"front": "Я улыбаюсь каждое утро [Context: x]", "back": "", "bucket": "mature", "created": 2, "noteId": 1},
    {"front": "Ёлка стоит в углу", "back": "", "bucket": "new", "created": 1, "noteId": 2},
    {"front": "Нет-нет, я улыбаюсь", "back": "", "bucket": "learning", "created": 1, "noteId": 3},
]
CONTAGENS = [{}, {"new": 1}, {"recent": 2}, {"mature": 3}, {"new": 1, "mature": 1}, {"new": 0, "recent": 0}]
LINHAS_DE_BARALHO = [
    [],
    [{"notes": 2, "cards": 3, "uniqueFronts": 2, "new": 1, "learning": 1, "young": 0, "mature": 1,
      "vocabulary": {"targetTerms": 2, "phraseVocabulary": 5, "newPhraseVocabulary": 4, "catalogedCards": 3,
                     "singleNewVocabularyCards": 1, "zeroNewVocabularyCards": 1, "usesAiCatalog": True}}],
    [{"notes": 1, "cards": 1, "mature": 1}, {"notes": 4, "cards": 6, "new": 2, "young": 2}],
]


def _ru_injetado(texto: str) -> str:
    return " ".join(texto.replace("ё", "е").split()).upper()


def _ru_quebrado(texto: str) -> str:
    raise ValueError("normalizador indisponivel")


NORMALIZADORES_RU = {"ausente": None, "injetado": _ru_injetado, "quebrado": _ru_quebrado}

# Cada função repetida, com os argumentos de cada chamada. As duas cópias recebem os mesmos.
def _casos() -> dict[str, list[tuple]]:
    frentes_versos = [(f, v) for f in FRENTES_EN for v in VERSOS_EN] + [(f, "") for f in FRENTES_RU]
    por_idioma = [(f, "en") for f in FRENTES_EN] + [(f, "ru") for f in FRENTES_RU]
    com_ru = [(*args, nome) for args in por_idioma for nome in NORMALIZADORES_RU]
    return {
        "strip_anki_field": [(v,) for v in FRENTES_EN + VERSOS_EN + FRENTES_RU],
        "extract_bold_texts": [(v,) for v in FRENTES_EN + FRENTES_RU],
        "normalize_en_word": [(p,) for p in PALAVRAS],
        "literal_front_words": [(f, i) for f, i in por_idioma],
        "literal_term_from_text": [(f, i) for f, i in por_idioma],
        "is_expression_term": [("",), (" ",), ("one",), ("two words",), ("  padded   words  ",)],
        "vocabulary_word_status": [(c,) for c in CONTAGENS],
        "card_bucket_from_values": [(t, i) for t in range(5) for i in (0, 20, 21, 400)],
        "empty_vocab_stats": [()],
        "empty_deck_stats": [("Deck", "en"), ("Колода", "ru", "Verso")],
        "deck_stats_totals": [(linhas,) for linhas in LINHAS_DE_BARALHO],
        # As que recebem o normalizador russo: o último argumento aqui é o nome dele.
        "normalize_target_item": [(f, i, n) for f, i, n in com_ru],
        "extract_target_term": [(f, v, i, n) for f, v in frentes_versos for i in ("en", "ru") for n in NORMALIZADORES_RU],
        "literal_target_terms": [(f, v, i, n) for f, v in frentes_versos for i in ("en", "ru") for n in NORMALIZADORES_RU],
        "normalize_term_identity": [(f, i, n) for f, i, n in com_ru],
        "front_vocabulary_rows_from_cards": [(c, i, n) for c, i in ((CARTOES_EN, "en"), (CARTOES_RU, "ru")) for n in NORMALIZADORES_RU],
        "catalog_stats_from_cards": [(c, i, n) for c, i in ((CARTOES_EN, "en"), (CARTOES_RU, "ru"), ([], "en")) for n in NORMALIZADORES_RU],
    }


# `add_vocabulary_row` muda o dicionário que recebe; ele tem o teste próprio abaixo.
FUNCOES_REPETIDAS = sorted([*_casos(), "add_vocabulary_row", "_apply_normalize_ru"])


def _com_normalizador(args: tuple, nome_posicao_ru: bool) -> tuple:
    """Troca o nome do normalizador russo, último argumento, pela função (ou None)."""
    if not nome_posicao_ru:
        return args
    return (*args[:-1], NORMALIZADORES_RU[args[-1]])


FUNCOES_COM_NORMALIZADOR_RU = {
    "normalize_target_item", "extract_target_term", "literal_target_terms", "normalize_term_identity",
    "front_vocabulary_rows_from_cards", "catalog_stats_from_cards",
}


class ParidadeDaNormalizacaoTest(unittest.TestCase):
    def test_as_funcoes_repetidas_sao_as_que_este_teste_cobre(self) -> None:
        publicas = lambda modulo: {n for n in dir(modulo) if callable(getattr(modulo, n)) and getattr(getattr(modulo, n), "__module__", "") == modulo.__name__}
        repetidas = sorted(publicas(bridge) & publicas(complemento))
        self.assertEqual(repetidas, FUNCOES_REPETIDAS, "uma função repetida entrou ou saiu: ajuste os casos deste teste")
        self.assertEqual(len(repetidas), 19)

    def test_cada_funcao_responde_igual_nas_duas_copias(self) -> None:
        for nome, chamadas in _casos().items():
            for args in chamadas:
                with self.subTest(funcao=nome, args=args):
                    argumentos = _com_normalizador(args, nome in FUNCOES_COM_NORMALIZADOR_RU)
                    self.assertEqual(getattr(bridge, nome)(*argumentos), getattr(complemento, nome)(*argumentos))

    def test_add_vocabulary_row_acumula_igual_nas_duas_copias(self) -> None:
        passos = [("cat", "word", "new"), ("cat", "word", "mature"), ("cat", "term", "recent"), ("big cat", "term", "new")]
        linhas_bridge: dict = {}
        linhas_complemento: dict = {}
        for valor, tipo, balde in passos:
            bridge.add_vocabulary_row(linhas_bridge, valor, tipo, balde)
            complemento.add_vocabulary_row(linhas_complemento, valor, tipo, balde)
        self.assertEqual(linhas_bridge, linhas_complemento)
        self.assertEqual(linhas_complemento[("word", "cat")]["cards"], 2)

    def test_o_normalizador_russo_ausente_levanta_igual_nas_duas_copias(self) -> None:
        for copia in (bridge, complemento):
            with self.subTest(copia=copia.__name__):
                with self.assertRaises(RuntimeError) as erro:
                    copia._apply_normalize_ru(None, "texto")
                self.assertEqual(str(erro.exception), "normalize_ru_unavailable")
        self.assertEqual(bridge._apply_normalize_ru(_ru_injetado, "a  b"), complemento._apply_normalize_ru(_ru_injetado, "a  b"))


if __name__ == "__main__":
    unittest.main()

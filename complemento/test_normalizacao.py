"""A leitura do vocabulário e dos números de um Baralho (`normalizacao.py`) em tabelas de entrada e saída, gravadas com o
código de hoje: a palavra inglesa reduzida, o termo-alvo de um Cartão, as palavras literais da frente, as linhas do Vocabulário,
o catálogo de um Baralho e os totais de vários. A saída é comparada como o JSON que a Conexão responde, com a ordem das chaves.

    python3.9 complemento/test_normalizacao.py
"""

import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import normalizacao


def normalizador_que_falha(_texto):
    raise ValueError("o normalizador do motor caiu")


PALAVRAS_INGLESAS = [
    ("", ""), ("--", ""), ("'", ""), ("Children", "child"), ("men's", "men"), ("John's", "john"), ("cities", "city"),
    ("ties", "tie"), ("wolves", "wolf"), ("loves", "love"), ("running", "run"), ("singing", "sing"), ("being", "being"),
    ("xxxing", "xx"), ("stopped", "stop"), ("baked", "bak"), ("used", "used"), ("added", "ad"), ("glass", "glass"),
    ("bus", "bus"), ("status", "status"), ("analysis", "analysis"), ("cats", "cat"), ("Don't", "don't"), ("3D", "d"),
    ("well-known", "well-known"), ("'quoted'", "quot"), ("goods", "goods"), ("FEET", "foot"), ("café", "caf"),
    ("wives's", "wive"), ("dies", "die"), ("boxes", "boxe"), ("ed", "ed"), ("fed", "fed"), ("ring", "ring"),
]

ITENS_DO_ALVO = [
    ("<b>Running</b> shoes's", "en", "run shoe"),
    ("Give UP!", "en", "give up"),
    ("John's well-known cats", "en", "john well-known cat"),
    ("123 456", "en", ""),
    ("Ёлка [Context: x]", "ru", "елка"),
]

TERMOS_ALVO = [
    ("Привет,  <b>мир</b> [Context: a]", "", "ru", normalizacao.normalizar_frase_ru, "привет, мир"),
    ("Ёлка  зелёная", "", "ru", None, "елка зеленая"),
    ("Ёлка  зелёная", "", "ru", normalizador_que_falha, "елка зеленая"),
    ("I was <b>Running</b> late", "", "en", None, "run"),
    ("<b>123</b>", "give up /ɡɪv ʌp/ – desistir", "en", None, "give up"),
    ("nothing bold", "", "en", None, ""),
    ("nothing bold", "Definition: /x/ a thing", "en", None, ""),
    ("nothing bold", "word /wɜːd/<br>Definition: palavra", "en", None, "word"),
    ("nothing bold", "take off → decolar /teɪk ɒf/", "en", None, "take off"),
    ("nothing bold", "look up - /lʊk ʌp/", "en", None, "look up"),
    ("nothing bold", "123 /x/", "en", None, ""),
    ("nothing bold", "plain back without ipa", "en", None, ""),
    ("<b></b> and <b>Dogs</b>", "cats /kæts/", "en", None, "dog"),
    ("<b>Cats</b> and <b>Dogs</b>", "", "en", None, "cat"),
    ("<b>Dogs</b>", "", "es", None, "dog"),
]

FRENTES_LITERAIS = [
    ("Don't stop-me now_ 3D <b>well-known</b> café 'quoted' -dash- x2 _", "en",
     {"café", "dash", "don't", "quoted", "stop-me", "well-known"}, "don't stop-me well-known café quoted dash"),
    ("Ёжик в тумане, по-русски! ЁЛКА abc 12", "ru", {"в", "ежик", "елка", "по-русски", "тумане"}, "ежик в тумане по-русски елка"),
    ("", "en", set(), ""),
    ("Ann's ann's [sound:a.mp3]<br>end", "en", {"ann's", "end"}, "ann's ann's end"),
]

TERMOS_LITERAIS = [
    ("<b>Give up</b> and <b>Look-out 2</b> <b>3</b>", "", "en", {"give up", "look-out"}),
    ("Ёжик в тумане", "", "ru", {"ежик в тумане"}),
    ("", "", "ru", set()),
    ("no bold", "take off /teɪk ɒf/", "en", {"take off"}),
    ("no bold", "", "en", set()),
]


CHAVES_DA_LINHA = ("word", "type", "cards", "new", "recent", "mature", "status")


def linhas(valores):
    return [dict(zip(CHAVES_DA_LINHA, linha)) for linha in valores]


CARTOES_EM_INGLES = [
    {"front": "I <b>give up</b> now", "back": "", "bucket": None},
    {"front": "You give up too", "back": "", "bucket": "learning"},
    {"front": "<b>Look out</b>!", "back": "", "bucket": "young"},
    {"front": "Look again", "back": "", "bucket": "mature"},
    {"front": "Odd bucket", "back": "", "bucket": "suspended"},
    {"front": "now now", "back": "", "bucket": "recent"},
    {"front": "plain", "back": "take off /teɪk ɒf/"},
]

VOCABULARIO_EM_INGLES = linhas([
    ("give up", "term", 1, 1, 0, 0, "new"),
    ("look out", "term", 1, 0, 1, 0, "recent"),
    ("take off", "term", 1, 1, 0, 0, "new"),
    ("give", "word", 2, 1, 1, 0, "mixed"),
    ("look", "word", 2, 0, 1, 1, "mixed"),
    ("now", "word", 2, 1, 1, 0, "mixed"),
    ("up", "word", 2, 1, 1, 0, "mixed"),
    ("again", "word", 1, 0, 0, 1, "mature"),
    ("bucket", "word", 1, 1, 0, 0, "new"),
    ("i", "word", 1, 1, 0, 0, "new"),
    ("odd", "word", 1, 1, 0, 0, "new"),
    ("out", "word", 1, 0, 1, 0, "recent"),
    ("plain", "word", 1, 1, 0, 0, "new"),
    ("too", "word", 1, 0, 1, 0, "recent"),
    ("you", "word", 1, 0, 1, 0, "recent"),
])

CARTOES_EM_RUSSO = [{"front": "Ёжик в тумане", "bucket": "new"}, {"front": "в тумане", "bucket": "mature"}]

VOCABULARIO_EM_RUSSO = linhas([
    ("в тумане", "term", 1, 0, 0, 1, "mature"),
    ("ежик в тумане", "term", 1, 1, 0, 0, "new"),
    ("в", "word", 2, 1, 0, 1, "mixed"),
    ("тумане", "word", 2, 1, 0, 1, "mixed"),
    ("ежик", "word", 1, 1, 0, 0, "new"),
])


CONTAGENS_DO_VOCABULARIO = (
    "targetTerms", "phraseVocabulary", "newPhraseVocabulary", "avgNewPhraseVocabularyPerCard", "singleNewVocabularyCards",
    "zeroNewVocabularyCards", "catalogedCards",
)


def vocabulario(contagens, com_ia=False):
    metricas = {"targetMetric": "anki_target_terms", "phraseMetric": "front_literal_words", "usesAiCatalog": com_ia}
    return {**dict(zip(CONTAGENS_DO_VOCABULARIO, contagens)), **metricas}


VOCABULARIO_VAZIO = vocabulario((0, 0, 0, 0.0, 0, 0, 0))

CATALOGOS = [
    ("en", [
        {"front": "the cat sat down", "back": "", "created": 3, "noteId": 1},
        {"front": "<b>Give up</b> the dog", "back": "", "created": 1, "noteId": 9},
        {"front": "", "back": "", "created": None, "noteId": None},
        {"front": "the cow ate", "back": "", "created": 2, "noteId": 6},
        {"front": "the cow", "back": "", "created": 2, "noteId": 5},
        {"front": "123", "back": "look up /lʊk ʌp/", "created": 4},
    ], vocabulario((2, 9, 9, 2.25, 2, 2, 4))),
    ("ru", [], VOCABULARIO_VAZIO),
    ("ru", [{"front": "Ёжик в тумане", "back": ""}, {"front": "ёжик", "back": ""}], vocabulario((2, 3, 3, 1.5, 0, 1, 2))),
]


def totais(contagens, vocabulario_total, por_estado):
    baralhos, notas, cartoes, frentes = contagens
    numeros = {
        "decks": baralhos, "notes": notas, "cards": cartoes, "uniqueTerms": vocabulario_total["targetTerms"],
        "uniqueFronts": frentes, "uniqueTermTokens": vocabulario_total["phraseVocabulary"], "vocabulary": vocabulario_total,
        "termMetric": "anki_target_terms",
    }
    return {**numeros, **dict(zip(("new", "learning", "young", "mature", "reviewed", "maturePct"), por_estado))}


TOTAIS_DOS_BARALHOS = [
    ([
        {"notes": 3, "cards": 4, "uniqueFronts": 3, "new": 1, "learning": 1, "young": 1, "mature": 1, "vocabulary": {
            "targetTerms": 2, "phraseVocabulary": 7, "newPhraseVocabulary": 7, "singleNewVocabularyCards": 1,
            "zeroNewVocabularyCards": 0, "catalogedCards": 3, "usesAiCatalog": True}},
        {"notes": 1, "cards": 2, "new": 0, "mature": 2, "vocabulary": None},
        normalizacao.empty_deck_stats("Vazio", "ru"),
        {"vocabulary": {"newPhraseVocabulary": 2, "catalogedCards": 3}},
    ], totais((4, 4, 6, 3), vocabulario((2, 7, 9, 1.5, 1, 0, 6), com_ia=True), (1, 1, 1, 3, 5, 60.0))),
    ([], totais((0, 0, 0, 0), VOCABULARIO_VAZIO, (0, 0, 0, 0, 0, 0.0))),
    ([{"new": 5, "vocabulary": {"catalogedCards": 0}}], totais((1, 0, 0, 0), VOCABULARIO_VAZIO, (5, 0, 0, 0, 0, 0.0))),
]


class TestNormalizacao(unittest.TestCase):
    def assertMesmoJson(self, obtido, esperado):
        self.assertEqual(json.dumps(obtido, ensure_ascii=False), json.dumps(esperado, ensure_ascii=False))

    def test_a_palavra_inglesa_perde_a_posse_o_plural_e_o_tempo_verbal(self):
        for palavra, esperada in PALAVRAS_INGLESAS:
            with self.subTest(palavra=palavra):
                self.assertEqual(normalizacao.normalize_en_word(palavra), esperada)

    def test_o_item_do_alvo_e_a_sequencia_das_palavras_reduzidas(self):
        for valor, idioma, esperado in ITENS_DO_ALVO:
            with self.subTest(valor=valor):
                self.assertEqual(normalizacao.normalize_target_item(valor, idioma, normalizacao.normalizar_frase_ru), esperado)

    def test_o_termo_alvo_vem_do_negrito_da_frente_senao_da_primeira_linha_do_verso_com_pronuncia(self):
        for frente, verso, idioma, normalizador, esperado in TERMOS_ALVO:
            with self.subTest(frente=frente, verso=verso, idioma=idioma):
                self.assertEqual(normalizacao.extract_target_term(frente, verso, idioma, normalizador), esperado)

    def test_as_palavras_literais_da_frente_sao_as_de_letras_sem_digito_nem_sublinhado(self):
        for frente, idioma, conjunto, termo in FRENTES_LITERAIS:
            with self.subTest(frente=frente):
                self.assertEqual(normalizacao.literal_front_words(frente, idioma), conjunto)
                self.assertEqual(normalizacao.literal_term_from_text(frente, idioma), termo)

    def test_os_termos_literais_sao_os_negritos_senao_o_termo_alvo(self):
        for frente, verso, idioma, esperados in TERMOS_LITERAIS:
            with self.subTest(frente=frente, verso=verso):
                self.assertEqual(normalizacao.literal_target_terms(frente, verso, idioma, normalizacao.normalizar_frase_ru), esperados)

    def test_o_vocabulario_da_frente_conta_palavras_e_expressoes_por_estado_do_cartao(self):
        for idioma, cartoes, esperado in [("en", CARTOES_EM_INGLES, VOCABULARIO_EM_INGLES), ("ru", CARTOES_EM_RUSSO, VOCABULARIO_EM_RUSSO)]:
            with self.subTest(idioma=idioma):
                obtido = normalizacao.front_vocabulary_rows_from_cards(cartoes, idioma, normalizacao.normalizar_frase_ru)
                self.assertMesmoJson(obtido, esperado)

    def test_o_catalogo_conta_as_palavras_novas_de_cada_cartao_na_ordem_de_criacao(self):
        for idioma, cartoes, esperado in CATALOGOS:
            with self.subTest(idioma=idioma, cartoes=len(cartoes)):
                self.assertMesmoJson(normalizacao.catalog_stats_from_cards(cartoes, idioma, normalizacao.normalizar_frase_ru), esperado)

    def test_o_vocabulario_vazio_tem_as_mesmas_chaves_do_catalogo(self):
        self.assertMesmoJson(normalizacao.empty_vocab_stats(), VOCABULARIO_VAZIO)

    def test_os_totais_somam_os_baralhos_e_o_vocabulario_de_cada_um(self):
        for linhas, esperado in TOTAIS_DOS_BARALHOS:
            with self.subTest(baralhos=len(linhas)):
                self.assertMesmoJson(normalizacao.deck_stats_totals(linhas), esperado)


if __name__ == "__main__":
    unittest.main()

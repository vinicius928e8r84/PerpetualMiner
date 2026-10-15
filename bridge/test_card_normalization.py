"""Testes de comportamento do modulo puro card_normalization (candidato B).

Tabelas de casos EN/RU exercitando a lematizacao, tokenizacao, strip de campo
Anki, extracao de negrito, status de vocabulario, bucketing de cartao e a
matematica de deck-stats. O caminho RU e coberto tanto no fallback (normalize_ru
ausente) quanto com um normalizador injetado, provando o seam de injecao.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("card_normalization.py")
if str(MODULE_PATH.parent) not in sys.path:
    sys.path.insert(0, str(MODULE_PATH.parent))

import card_normalization as cn  # noqa: E402  (apos ajustar sys.path)


class NormalizeEnWordTest(unittest.TestCase):
    CASES = [
        ("cats", "cat"),           # plural simples -s
        ("running", "run"),        # -ing com consoante dobrada
        ("played", "play"),        # -ed regular
        ("cities", "city"),        # -ies -> -y
        ("wolves", "wolf"),        # -ves -> -f
        ("children", "child"),     # excecao de lema
        ("men", "man"),            # excecao de lema
        ("boss", "boss"),          # -ss nao remove s
        ("is", "is"),              # curto demais para regra -s
        ("John's", "john"),        # possessivo 's removido
        ("", ""),
        ("123", ""),               # sem letras -> vazio
    ]

    def test_table(self) -> None:
        for raw, expected in self.CASES:
            with self.subTest(raw=raw):
                self.assertEqual(cn.normalize_en_word(raw), expected)


class TermWordsTest(unittest.TestCase):
    def test_en_drops_stop_words_and_lemmatizes(self) -> None:
        self.assertEqual(cn.term_words("The cats are running", "en"), ["cat", "run"])

    def test_en_strips_html_and_sound(self) -> None:
        self.assertEqual(cn.term_words("<b>Dogs</b> [sound:x.mp3]", "en"), ["dog"])

    def test_ru_fallback_without_normalizer(self) -> None:
        # Sem normalize_ru: cai no fallback regex, casefold + ё->е.
        self.assertEqual(cn.term_words("Кошки и Ёлки", "ru"), ["кошки", "и", "елки"])

    def test_ru_uses_injected_normalizer(self) -> None:
        # normalize_ru injetado deve ser aplicado antes da tokenizacao.
        called = {}

        def fake_norm(text: str) -> str:
            called["text"] = text
            return "мама папа"

        self.assertEqual(cn.term_words("qualquer", "ru", fake_norm), ["мама", "папа"])
        self.assertEqual(called["text"], "qualquer")


class StripAndBoldTest(unittest.TestCase):
    def test_strip_anki_field(self) -> None:
        self.assertEqual(
            cn.strip_anki_field("<b>hi</b><br>there [sound:x.mp3]"),
            "hi there",
        )

    def test_strip_empty(self) -> None:
        self.assertEqual(cn.strip_anki_field(""), "")

    def test_extract_bold_texts(self) -> None:
        self.assertEqual(
            cn.extract_bold_texts("<b>Hello</b> world <b>foo</b>"),
            ["Hello", "foo"],
        )

    def test_extract_bold_none(self) -> None:
        self.assertEqual(cn.extract_bold_texts("no bold here"), [])


class LiteralFrontWordsTest(unittest.TestCase):
    def test_en_dedups_and_drops_numeric_underscore(self) -> None:
        self.assertEqual(cn.literal_front_words("cat 123 dog_ cat", "en"), {"cat"})

    def test_ru_tokens(self) -> None:
        self.assertEqual(
            cn.literal_front_words("Кошки и собаки", "ru"),
            {"кошки", "и", "собаки"},
        )


class ExtractTargetTermTest(unittest.TestCase):
    def test_en_bold_priority(self) -> None:
        self.assertEqual(cn.extract_target_term("<b>run</b> fast", "", "en"), "run")

    def test_en_from_phonetic_back(self) -> None:
        self.assertEqual(cn.extract_target_term("", "apple /ˈæpəl/", "en"), "apple")

    def test_en_back_without_phonetic_returns_empty(self) -> None:
        self.assertEqual(cn.extract_target_term("", "just a definition", "en"), "")

    def test_ru_uses_term_identity_fallback(self) -> None:
        self.assertEqual(cn.extract_target_term("Привет", "", "ru"), "привет")


class VocabularyWordStatusTest(unittest.TestCase):
    CASES = [
        ({"new": 2}, "new"),
        ({"recent": 1}, "recent"),
        ({"mature": 3}, "mature"),
        ({"new": 1, "mature": 1}, "mixed"),
        ({}, "seen"),
    ]

    def test_table(self) -> None:
        for counts, expected in self.CASES:
            with self.subTest(counts=counts):
                self.assertEqual(cn.vocabulary_word_status(counts), expected)


class CardBucketTest(unittest.TestCase):
    CASES = [
        (0, 100, "new"),
        (1, 5, "learning"),
        (3, 5, "learning"),
        (2, 30, "mature"),
        (2, 5, "young"),
    ]

    def test_table(self) -> None:
        for card_type, interval, expected in self.CASES:
            with self.subTest(card_type=card_type, interval=interval):
                self.assertEqual(cn.card_bucket_from_values(card_type, interval), expected)
                self.assertEqual(
                    cn.card_bucket({"type": card_type, "interval": interval}),
                    expected,
                )


class IsExpressionTermTest(unittest.TestCase):
    def test_multiword(self) -> None:
        self.assertTrue(cn.is_expression_term("give up"))

    def test_singleword(self) -> None:
        self.assertFalse(cn.is_expression_term("run"))


class CatalogStatsTest(unittest.TestCase):
    def test_single_card(self) -> None:
        cards = [{"front": "<b>cat</b> dog", "back": "", "bucket": "new", "created": 1, "noteId": 1}]
        stats = cn.catalog_stats_from_cards(cards, "en")
        self.assertEqual(stats["targetTerms"], 1)
        self.assertEqual(stats["phraseVocabulary"], 2)
        self.assertEqual(stats["newPhraseVocabulary"], 2)
        self.assertEqual(stats["avgNewPhraseVocabularyPerCard"], 2.0)
        self.assertEqual(stats["catalogedCards"], 1)
        self.assertEqual(stats["singleNewVocabularyCards"], 0)
        self.assertEqual(stats["zeroNewVocabularyCards"], 0)

    def test_repeated_front_counts_zero_new(self) -> None:
        cards = [
            {"front": "cat", "back": "", "bucket": "new", "created": 1, "noteId": 1},
            {"front": "cat", "back": "", "bucket": "new", "created": 2, "noteId": 2},
        ]
        stats = cn.catalog_stats_from_cards(cards, "en")
        self.assertEqual(stats["phraseVocabulary"], 1)
        self.assertEqual(stats["singleNewVocabularyCards"], 1)  # 1o cartao: 1 token novo
        self.assertEqual(stats["zeroNewVocabularyCards"], 1)    # 2o cartao: nenhum novo


class FrontVocabularyRowsTest(unittest.TestCase):
    def test_word_rows_status_and_order(self) -> None:
        cards = [
            {"front": "cat dog", "back": "", "bucket": "new"},
            {"front": "cat", "back": "", "bucket": "mature"},
        ]
        rows = cn.front_vocabulary_rows_from_cards(cards, "en")
        by_word = {row["word"]: row for row in rows}
        self.assertEqual(by_word["cat"]["cards"], 2)
        self.assertEqual(by_word["cat"]["new"], 1)
        self.assertEqual(by_word["cat"]["mature"], 1)
        self.assertEqual(by_word["cat"]["status"], "mixed")
        self.assertEqual(by_word["dog"]["cards"], 1)
        self.assertEqual(by_word["dog"]["status"], "new")
        # ordenado por -cards: cat (2) antes de dog (1)
        self.assertEqual([row["word"] for row in rows], ["cat", "dog"])


class DeckStatsTotalsTest(unittest.TestCase):
    def test_aggregates(self) -> None:
        rows = [{
            "notes": 2, "cards": 3, "uniqueFronts": 2,
            "new": 1, "learning": 1, "young": 0, "mature": 1,
            "vocabulary": {
                "targetTerms": 1, "phraseVocabulary": 2, "newPhraseVocabulary": 2,
                "catalogedCards": 1, "singleNewVocabularyCards": 0,
                "zeroNewVocabularyCards": 0, "usesAiCatalog": False,
            },
        }]
        totals = cn.deck_stats_totals(rows)
        self.assertEqual(totals["decks"], 1)
        self.assertEqual(totals["notes"], 2)
        self.assertEqual(totals["cards"], 3)
        self.assertEqual(totals["uniqueTerms"], 1)
        self.assertEqual(totals["uniqueTermTokens"], 2)
        self.assertEqual(totals["reviewed"], 2)
        self.assertEqual(totals["maturePct"], 50.0)
        self.assertEqual(totals["vocabulary"]["avgNewPhraseVocabularyPerCard"], 2.0)

    def test_empty(self) -> None:
        totals = cn.deck_stats_totals([])
        self.assertEqual(totals["decks"], 0)
        self.assertEqual(totals["reviewed"], 0)
        self.assertEqual(totals["maturePct"], 0.0)


class NormalizeTermIdentityTest(unittest.TestCase):
    def test_en_casefold(self) -> None:
        self.assertEqual(cn.normalize_term_identity("Hello World", "en"), "hello world")

    def test_ru_fallback(self) -> None:
        self.assertEqual(cn.normalize_term_identity("Привет Мир", "ru"), "привет мир")

    def test_ru_injected(self) -> None:
        self.assertEqual(
            cn.normalize_term_identity("x", "ru", lambda t: "НОРМА"),
            "норма",
        )


class EmptyStatsTest(unittest.TestCase):
    def test_empty_deck_stats_shape(self) -> None:
        stats = cn.empty_deck_stats("Deck", "en", "Frente")
        self.assertTrue(stats["missing"])
        self.assertEqual(stats["deckName"], "Deck")
        self.assertEqual(stats["frontField"], "Frente")
        self.assertEqual(stats["vocabulary"], cn.empty_vocab_stats())


if __name__ == "__main__":
    unittest.main(verbosity=2)

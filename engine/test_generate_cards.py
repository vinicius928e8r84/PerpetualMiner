import tempfile
import unittest
from pathlib import Path

import generate_cards
from parser import MiningEntry, build_card_stem


BAD_CARD = """Anki Card
Source Context: Scientific Advertising - Chapter 8

Front: He exerts *himself* on brands of his own, if at all.

Back: Himself - /himSELF/

Definition: The individual person.

Simple meaning: The person does something on their own.

Gist: The sentence talks about personal effort.

-> He exerts himself on brands of his own, if at all. = He only puts effort into his own brands.

Other example: -> He did the work himself.

Trigger: Someone personally handles a project.

Image: None
Google Image Search Queries:
1. solo worker
2. entrepreneur
3. person working alone
4. business owner
"""


GOOD_CARD = """Anki Card
Source Context: Scientific Advertising - Chapter 8

Front: He *exerts himself* on brands of his own, if at all.

Back: exerts himself - /ig-ZURTS him-SELF/

Definition: Makes a deliberate personal effort.

Simple meaning: He personally tries hard.

Gist: The phrase describes someone only making effort for his own brands.

-> He exerts himself on brands of his own, if at all. = He only puts effort into his own brands.

Other example: -> The owner exerts himself when his own product is at stake.

Trigger: A founder personally pushes a project because it belongs to him.

Image: None
Google Image Search Queries:
1. entrepreneur working
2. personal effort
3. business owner
4. hard work
"""


def _config(root: Path) -> dict:
    return {
        "lang": "en",
        "openai_api_key": "test",
        "openai": {"chat_model": "mock-model"},
        "paths": {
            "output_dir": str(root / "Output"),
            "log_dir": str(root / "log"),
            "prompts": {
                "en_card": str(root / "prompts" / "en_card.txt"),
                "ru_card": str(root / "prompts" / "ru_card.txt"),
            },
        },
    }


def _write_prompts(root: Path) -> None:
    prompt_dir = root / "prompts"
    prompt_dir.mkdir()
    (prompt_dir / "en_card.txt").write_text("en prompt", encoding="utf-8")
    (prompt_dir / "ru_card.txt").write_text("ru prompt", encoding="utf-8")


class GenerateCardsKeywordValidationTests(unittest.TestCase):
    def test_rejects_back_headword_that_is_only_part_of_multi_word_keyword(self):
        self.assertFalse(generate_cards._validate_keyword(BAD_CARD, "exerts himself"))

    def test_accepts_back_headword_and_front_highlight_for_full_multi_word_keyword(self):
        self.assertTrue(generate_cards._validate_keyword(GOOD_CARD, "exerts himself"))

    def test_rejects_front_highlight_that_marks_only_part_of_multi_word_keyword(self):
        partial_front = GOOD_CARD.replace("*exerts himself*", "exerts *himself*")

        self.assertFalse(generate_cards._validate_keyword(partial_front, "exerts himself"))

    def test_run_retries_keyword_mismatch_and_saves_corrected_card(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / "Output").mkdir()
            (root / "log").mkdir()
            _write_prompts(root)
            entry = MiningEntry(
                keywords=["exerts himself"],
                phrase="He exerts himself on brands of his own, if at all.",
                context_source="Scientific Advertising",
                context_title="Chapter 8",
            )

            calls = []
            responses = [BAD_CARD, GOOD_CARD]
            original_call_model = generate_cards._call_model
            original_openai = generate_cards.openai.OpenAI
            generate_cards.openai.OpenAI = lambda api_key: object()

            def fake_call_model(*args, **kwargs):
                calls.append(args)
                return responses.pop(0)

            generate_cards._call_model = fake_call_model
            try:
                saved = generate_cards.run([entry], _config(root))
            finally:
                generate_cards._call_model = original_call_model
                generate_cards.openai.OpenAI = original_openai

            expected_stem = build_card_stem(
                "exerts himself",
                "He exerts himself on brands of his own, if at all.",
            )
            self.assertEqual(len(calls), 2)
            self.assertEqual(saved, [expected_stem])
            card_path = root / "Output" / f"{expected_stem}.txt"
            self.assertTrue(card_path.exists())
            self.assertIn("Back: exerts himself", card_path.read_text(encoding="utf-8"))

    def test_run_skips_card_after_persistent_keyword_mismatch(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / "Output").mkdir()
            (root / "log").mkdir()
            _write_prompts(root)
            entry = MiningEntry(
                keywords=["exerts himself"],
                phrase="He exerts himself on brands of his own, if at all.",
            )

            calls = []
            original_call_model = generate_cards._call_model
            original_openai = generate_cards.openai.OpenAI
            generate_cards.openai.OpenAI = lambda api_key: object()

            def fake_call_model(*args, **kwargs):
                calls.append(args)
                return BAD_CARD

            generate_cards._call_model = fake_call_model
            try:
                saved = generate_cards.run([entry], _config(root))
            finally:
                generate_cards._call_model = original_call_model
                generate_cards.openai.OpenAI = original_openai

            self.assertEqual(len(calls), 2)
            self.assertEqual(saved, [])
            self.assertEqual(list((root / "Output").glob("*.txt")), [])


if __name__ == "__main__":
    unittest.main()

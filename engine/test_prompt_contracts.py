import unittest
from pathlib import Path

import image_judge


ROOT = Path(__file__).resolve().parent
EN_PROMPTS = (ROOT / "prompts" / "en_card.txt",)
RU_PROMPT = ROOT / "prompts" / "ru_card.txt"


class EnglishPromptGistContractTests(unittest.TestCase):
    def test_english_prompts_include_contextual_gist_contract(self):
        for prompt_path in EN_PROMPTS:
            with self.subTest(prompt=prompt_path.name):
                prompt = prompt_path.read_text(encoding="utf-8")
                normalized_prompt = " ".join(prompt.split())
                lines = [line.strip() for line in prompt.splitlines()]

                self.assertIn(
                    "Gist: One short contextual sentence in English explaining the situation behind the phrase.",
                    lines,
                )

                simple_idx = lines.index(
                    "Simple meaning: Direct and intuitive explanation in simple English."
                )
                gist_idx = lines.index(
                    "Gist: One short contextual sentence in English explaining the situation behind the phrase."
                )
                arrow_idx = lines.index(
                    "\u2192 [Phrase without asterisks] = [Clear meaning in everyday English]"
                )
                self.assertLess(simple_idx, gist_idx)
                self.assertLess(gist_idx, arrow_idx)

                self.assertIn(
                    "Gist must always be written in English for English cards.",
                    normalized_prompt,
                )
                self.assertIn(
                    "If [Contexto] includes a series, season, episode, chapter, scene, character, book, or equivalent detail, make the Gist more specific about what is happening, what kind of scene or situation it is, and why the phrase makes sense there.",
                    normalized_prompt,
                )
                self.assertIn(
                    "The Gist requirement changes only the final card output; keep all existing rules for keyword focus, definitions, examples, triggers, images, and search queries unchanged.",
                    normalized_prompt,
                )

    def test_english_prompts_prioritize_free_real_image_queries(self):
        for prompt_path in EN_PROMPTS:
            with self.subTest(prompt=prompt_path.name):
                prompt = prompt_path.read_text(encoding="utf-8")
                normalized_prompt = " ".join(prompt.split())

                self.assertIn("Strong free-image strategy:", prompt)
                self.assertIn(
                    "For abstract, emotional, idiomatic, or hard-to-photograph targets, use a concrete universal symbol first",
                    normalized_prompt,
                )
                self.assertIn(
                    "Good queries are usually 1 to 4 words.",
                    normalized_prompt,
                )
                self.assertIn(
                    "At least two queries must be concrete symbols/actions when the target is abstract or idiomatic.",
                    normalized_prompt,
                )
                self.assertIn(
                    "Use character/source names only when context makes them the strongest visual anchor",
                    normalized_prompt,
                )
                self.assertNotIn("Avoid copyrighted character names", prompt)

    def test_english_prompts_lock_multi_word_keyword_surface(self):
        for prompt_path in EN_PROMPTS:
            with self.subTest(prompt=prompt_path.name):
                prompt = prompt_path.read_text(encoding="utf-8")
                normalized_prompt = " ".join(prompt.split())

                self.assertIn(
                    "For a multi-word target, the Back field MUST begin with the full exact target expression",
                    normalized_prompt,
                )
                self.assertIn(
                    "For a multi-word target, the Front field MUST highlight the full exact target expression as one span",
                    normalized_prompt,
                )
                self.assertIn(
                    "Never make the card about a subword inside the target expression",
                    normalized_prompt,
                )

    def test_russian_prompt_prioritizes_context_and_high_impact_free_queries(self):
        prompt = RU_PROMPT.read_text(encoding="utf-8")
        normalized_prompt = " ".join(prompt.split())

        self.assertIn(
            "If context names a character, person, series, movie, or source, use that name as one query when it is the strongest visual anchor",
            normalized_prompt,
        )
        self.assertIn(
            "Do not waste queries on generic settings",
            normalized_prompt,
        )
        self.assertIn(
            "starving child Africa",
            normalized_prompt,
        )
        self.assertIn(
            "Maximum-impact hunger or poverty queries are allowed",
            normalized_prompt,
        )

    def test_image_judge_rewards_high_impact_meaning_links(self):
        system_prompt = " ".join(image_judge._SYSTEM.split())

        self.assertIn(
            "Reward high-impact images for hunger, poverty, starvation, or suffering",
            system_prompt,
        )
        self.assertIn(
            "Do not require the image to recreate the literal fictional setting",
            system_prompt,
        )


if __name__ == "__main__":
    unittest.main()

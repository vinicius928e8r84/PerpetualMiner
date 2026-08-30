import unittest

import start


class EnglishInputValidationTests(unittest.TestCase):
    def test_valid_primary_keyword_line_passes(self):
        ok, reason = start._validate_english_input_line(
            "resent it : Many dealers resent it. [Contexto: livro - Scientific Advertising - Chapter 8]"
        )

        self.assertTrue(ok)
        self.assertEqual(reason, "")

    def test_line_without_colon_fails(self):
        ok, reason = start._validate_english_input_line("resent it Many dealers resent it.")

        self.assertFalse(ok)
        self.assertIn("dois-pontos", reason)

    def test_line_without_keyword_fails(self):
        ok, reason = start._validate_english_input_line(": Many dealers resent it.")

        self.assertFalse(ok)
        self.assertIn("keyword", reason)

    def test_line_without_phrase_fails(self):
        ok, reason = start._validate_english_input_line("resent it:")

        self.assertFalse(ok)
        self.assertIn("frase", reason)

    def test_primary_keyword_missing_from_phrase_fails(self):
        ok, reason = start._validate_english_input_line("resent it : Many dealers disliked the plan.")

        self.assertFalse(ok)
        self.assertIn("keyword principal", reason)

    def test_secondary_keywords_need_context_or_enough_phrase_detail(self):
        ok, reason = start._validate_english_input_line("consign | jobbers : Consign goods.")

        self.assertFalse(ok)
        self.assertIn("Context", reason)

    def test_secondary_keywords_with_context_pass(self):
        ok, reason = start._validate_english_input_line(
            "consign | jobbers : Some consign goods to jobbers so dealers can easily order. "
            "[Contexto: livro - Scientific Advertising - Chapter 8]"
        )

        self.assertTrue(ok)
        self.assertEqual(reason, "")


if __name__ == "__main__":
    unittest.main()

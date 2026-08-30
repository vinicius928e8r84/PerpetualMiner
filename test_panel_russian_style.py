from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent
PANEL_JS = ROOT / "painel.js"
PANEL_CSS = ROOT / "painel.css"


class PanelRussianStyleTests(unittest.TestCase):
    def test_panel_marks_russian_phrase_rows(self) -> None:
        source = PANEL_JS.read_text(encoding="utf-8")

        self.assertIn("idiomaFraseClasse", source)
        self.assertRegex(source, r"phrase-item\$\{exportedClass\}\$\{idiomaFraseClasse\}")
        self.assertIn("frase-ru", source)
        self.assertIn(r"[\u0400-\u04FF]", source)

    def test_russian_phrases_override_global_italic_style(self) -> None:
        css = PANEL_CSS.read_text(encoding="utf-8")

        self.assertRegex(css, r"\.phrase-text\s*\{[^}]*font-style:\s*italic;")
        self.assertRegex(css, r"\.phrase-item\.frase-ru\s+\.phrase-text\s*\{[^}]*font-style:\s*normal;")
        self.assertRegex(css, r"\.phrase-item\.frase-ru\s+\.word\s*\{[^}]*font-style:\s*normal;")


if __name__ == "__main__":
    unittest.main()

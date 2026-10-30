import re
import unittest
from pathlib import Path

import estilos
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


def _prompt_do_nivel(lang, nivel=None):
    return " ".join((ROOT / estilos.estilo(lang, nivel)["prompt"]).read_text(encoding="utf-8").split())


class PromptsPorNivelTests(unittest.TestCase):
    """O contrato dos prompts cobre a saída de cada idioma × nível: a língua da explicação, as partes do verso e as cores."""

    def test_cada_nivel_de_cada_idioma_tem_o_seu_prompt_com_o_texto_do_cartao_que_o_nivel_pede(self):
        for lang in estilos.idiomas():
            for nivel in estilos.DADOS["idiomas"][lang]["niveis"]:
                with self.subTest(lang=lang, nivel=nivel):
                    estilo, prompt = estilos.estilo(lang, nivel), _prompt_do_nivel(lang, nivel)
                    for parte in estilo["verso"]:
                        rotulo = estilos.rotulo(parte)
                        if rotulo:
                            self.assertRegex(prompt, r"%s: \[" % rotulo, "o prompt não diz como escrever a parte %s" % parte)
                    self.assertIn("Anki Card", prompt)
                    self.assertIn("Google Image Search Queries:", prompt)

    def test_o_nivel_com_cores_pede_o_alinhamento_com_os_pedacos_copiados_ao_pe_da_letra_da_literal(self):
        for lang in estilos.idiomas():
            for nivel in estilos.DADOS["idiomas"][lang]["niveis"]:
                if not estilos.estilo(lang, nivel)["cores"]:
                    continue
                with self.subTest(lang=lang, nivel=nivel):
                    prompt = _prompt_do_nivel(lang, nivel)
                    self.assertRegex(prompt, r"Alignment: 1 \| \[[^]]+\] \| \[[^]]+\]")
                    self.assertRegex(prompt, r"Portuguese chunk[^.]*MUST be copied verbatim from the Literal line")

    def test_a_explicacao_em_portugues_proibe_explicar_em_ingles_e_so_as_buscas_de_imagem_ficam_em_ingles(self):
        for lang in estilos.idiomas():
            for nivel in estilos.DADOS["idiomas"][lang]["niveis"]:
                if estilos.estilo(lang, nivel)["explicacao"] != "pt":
                    continue
                with self.subTest(lang=lang, nivel=nivel):
                    prompt = _prompt_do_nivel(lang, nivel)
                    self.assertIn("Brazilian Portuguese", prompt)
                    self.assertNotIn("100% in ENGLISH", prompt)
                    self.assertNotIn("NEVER translate to Portuguese", prompt)
                    self.assertRegex(prompt, r"(?i)never (write|explain)[^.]*in English")

    def test_o_iniciante_do_russo_parte_do_cartao_de_russo_de_hoje_traduzido_para_o_portugues(self):
        hoje = " ".join(RU_PROMPT.read_text(encoding="utf-8").split())
        iniciante = _prompt_do_nivel("ru")
        for regra in (
            "Keep the Russian phrase in Front exactly as provided",
            "Generate exactly four English Google image search queries",
            "Do not waste queries on generic settings",
            "Maximum-impact hunger or poverty queries are allowed",
            "Alignment is the single source of truth for card colors",
            "Usually produce 2 to 6 alignment pairs",
            "Do not use code fences.",
        ):
            self.assertIn(regra, hoje)
            self.assertIn(regra, iniciante)
        self.assertNotIn("English translation", iniciante)
        self.assertRegex(iniciante, r"Literal: \[Word-by-word literal Portuguese translation")
        self.assertRegex(iniciante, r"Natural: \[Natural Brazilian Portuguese translation")

    def test_o_iniciante_do_ingles_mantem_a_trava_da_palavra_e_a_primeira_linha_do_verso_que_o_motor_confere(self):
        prompt = _prompt_do_nivel("en")
        for regra in (
            "For a multi-word target, the Back field MUST begin with the full exact target expression",
            "For a multi-word target, the Front field MUST highlight the full exact target expression as one span",
            "Never make the card about a subword inside the target expression",
            "Back: [Target Keyword] \u2013 /[IPA Transcription]/",
            "ALWAYS output exactly four English image search queries",
        ):
            self.assertIn(regra, prompt)

    def test_o_iniciante_so_pede_no_verso_as_partes_que_o_estilo_diz(self):
        for lang in estilos.idiomas():
            with self.subTest(lang=lang):
                prompt = _prompt_do_nivel(lang)
                for parte in ("definicao", "outro_exemplo", "gatilho", "significado_simples"):
                    rotulo = estilos.rotulo(parte)
                    self.assertNotRegex(prompt, r"(?m)(^| )%s: \[" % re.escape(rotulo), "o Iniciante não leva %s" % parte)


if __name__ == "__main__":
    unittest.main()

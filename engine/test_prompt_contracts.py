import os
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

    def test_cada_nivel_do_ingles_mantem_a_trava_da_palavra_e_a_primeira_linha_do_verso_que_o_motor_confere(self):
        for nivel in estilos.niveis("en"):
            with self.subTest(nivel=nivel):
                prompt = _prompt_do_nivel("en", nivel)
                for regra in (
                    "For a multi-word target, the Back field MUST begin with the full exact target expression",
                    "For a multi-word target, the Front field MUST highlight the full exact target expression as one span",
                    "Never make the card about a subword inside the target expression",
                    "Back: [Target Keyword] \u2013 /[IPA Transcription]/",
                    "ALWAYS output exactly four English image search queries",
                ):
                    self.assertIn(regra, prompt)

    def test_cada_nivel_so_pede_no_verso_as_partes_que_o_estilo_diz(self):
        for lang in estilos.idiomas():
            for nivel in estilos.niveis(lang):
                with self.subTest(lang=lang, nivel=nivel):
                    prompt = _prompt_do_nivel(lang, nivel)
                    verso = estilos.estilo(lang, nivel)["verso"]
                    for parte in ("pronuncia", "literal", "natural", "cena", "definicao", "outro_exemplo", "significado_simples", "gatilho"):
                        pedida = re.search(r"(?m)(^| )%s: \[" % re.escape(estilos.rotulo(parte)), prompt) is not None
                        self.assertEqual(pedida, parte in verso, "%s: o prompt e o estilo discordam" % parte)

    def test_o_nivel_sem_cores_nao_pede_alinhamento_pronuncia_nem_traducao(self):
        for lang in estilos.idiomas():
            for nivel in estilos.niveis(lang):
                if estilos.estilo(lang, nivel)["cores"]:
                    continue
                with self.subTest(lang=lang, nivel=nivel):
                    prompt = _prompt_do_nivel(lang, nivel)
                    self.assertNotRegex(prompt, r"Alignment: 1 \|")
                    self.assertNotRegex(prompt, r"(Pronunciation|Literal|Natural): \[")

    def test_o_intermediario_do_ingles_define_em_portugues_a_palavra_inteira_e_da_outro_exemplo_em_ingles(self):
        prompt = _prompt_do_nivel("en", "intermediario")
        for regra in (
            "Definition: [Meaning of the target in Brazilian Portuguese",
            "Other example: [One new natural English sentence using the same target]",
            "Gist: [One short Brazilian Portuguese sentence",
            "For a phrasal verb, define the phrasal verb itself, never the verb alone.",
            "INTERMEDIATE learner",
        ):
            self.assertIn(regra, prompt)

    def test_o_avancado_do_ingles_parte_do_cartao_de_hoje_e_e_monolingue(self):
        hoje, avancado = " ".join(EN_PROMPTS[0].read_text(encoding="utf-8").split()), _prompt_do_nivel("en", "avancado")
        for regra in (
            "Target Keyword Focus (CRITICAL)",
            "LORE & UNIVERSE INTEGRATION (THE DEEP CONTEXT RULE)",
            "Other example: You MUST use the names of other characters from the same series/book",
            "Strong free-image strategy:",
            "NEVER translate to Portuguese. Everything must be in English.",
            "Gist must always be written in English for English cards.",
        ):
            self.assertIn(regra, hoje)
            self.assertIn(regra, avancado)
        self.assertIn("must be 100% in ENGLISH", avancado)
        self.assertNotIn("Brazilian Portuguese", avancado)
        self.assertNotIn("Trigger:", avancado)
        self.assertNotIn("Simple meaning:", avancado)

    def test_a_explicacao_em_ingles_proibe_o_portugues(self):
        for lang in estilos.idiomas():
            for nivel in estilos.niveis(lang):
                if estilos.estilo(lang, nivel)["explicacao"] != "en":
                    continue
                with self.subTest(lang=lang, nivel=nivel):
                    prompt = _prompt_do_nivel(lang, nivel)
                    self.assertRegex(prompt, r"No Portuguese allowed")
                    self.assertNotIn("Brazilian Portuguese", prompt)

    def test_cada_prompt_do_estilo_existe_e_nenhum_arquivo_de_prompt_fica_sem_nivel(self):
        usados = {Path(estilos.estilo(lang, nivel)["prompt"]).name for lang in estilos.idiomas() for nivel in estilos.niveis(lang)}
        for nome in usados:
            self.assertTrue((ROOT / "prompts" / nome).is_file(), nome)
        niveis = {nome for nome in os.listdir(ROOT / "prompts") if re.match(r"^(en|ru)_(iniciante|intermediario|avancado)\.txt$", nome)}
        self.assertEqual(niveis, usados)


if __name__ == "__main__":
    unittest.main()

import tempfile
import unittest
from pathlib import Path

import estilos
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

    def test_front_que_perde_uma_palavra_da_frase_original_e_recusado(self):
        phrase = "He exerts himself on brands of his own, if at all."
        dropped = GOOD_CARD.replace("He *exerts himself* on", "*exerts himself* on")

        self.assertFalse(generate_cards._front_keeps_the_phrase(dropped, phrase))
        self.assertTrue(generate_cards._front_keeps_the_phrase(GOOD_CARD, phrase))

    def test_run_regenera_o_cartao_cujo_front_perdeu_uma_palavra_da_frase(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / "Output").mkdir()
            (root / "log").mkdir()
            _write_prompts(root)
            entry = MiningEntry(keywords=["exerts himself"], phrase="He exerts himself on brands of his own, if at all.")
            dropped = GOOD_CARD.replace("He *exerts himself* on", "*exerts himself* on")
            responses = [dropped, GOOD_CARD]
            messages = []
            original_call_model = generate_cards._call_model

            def fake_call_model(base, key, system, message, *args, **kwargs):
                messages.append(message)
                return responses.pop(0)

            generate_cards._call_model = fake_call_model
            try:
                saved = generate_cards.run([entry], _config(root))
            finally:
                generate_cards._call_model = original_call_model

            self.assertEqual(len(messages), 2)
            self.assertIn("every word", messages[1])
            self.assertIn("Front: He *exerts himself* on", (root / "Output" / f"{saved[0]}.txt").read_text(encoding="utf-8"))

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

            def fake_call_model(*args, **kwargs):
                calls.append(args)
                return responses.pop(0)

            generate_cards._call_model = fake_call_model
            try:
                saved = generate_cards.run([entry], _config(root))
            finally:
                generate_cards._call_model = original_call_model

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

            def fake_call_model(*args, **kwargs):
                calls.append(args)
                return BAD_CARD

            generate_cards._call_model = fake_call_model
            try:
                saved = generate_cards.run([entry], _config(root))
            finally:
                generate_cards._call_model = original_call_model

            self.assertEqual(len(calls), 2)
            self.assertEqual(saved, [])
            self.assertEqual(list((root / "Output").glob("*.txt")), [])

    def test_a_named_card_is_the_only_label_in_the_log_and_the_cost_record_and_only_stems_limits_the_run(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / "Output").mkdir()
            (root / "log").mkdir()
            _write_prompts(root)
            entry = MiningEntry(keywords=["exerts himself", "toil"], phrase="He exerts himself on brands of his own, if at all.")
            labels, original_call_model = [], generate_cards._call_model

            def fake_call_model(openai_base, api_key, system_prompt, user_message, model, log_dir, keyword):
                labels.append(keyword)
                return GOOD_CARD

            generate_cards._call_model = fake_call_model
            try:
                with self.assertLogs("perpetualminer.motor", level="INFO") as logged:
                    saved = generate_cards.run(
                        [entry], _config(root), card_stem=lambda job, index: "77-%d" % index, only_stems={"77-0"}
                    )
            finally:
                generate_cards._call_model = original_call_model

            self.assertEqual(saved, ["77-0"])
            self.assertEqual(labels, ["77-0"])
            self.assertEqual([path.name for path in (root / "Output").glob("*.txt")], ["77-0.txt"])
            self.assertNotIn("exerts himself", "\n".join(logged.output))
            self.assertNotIn("toil", "\n".join(logged.output))

    def test_o_cartao_principal_e_o_gerado_usam_o_mesmo_prompt_com_mensagens_diferentes(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / "Output").mkdir()
            (root / "log").mkdir()
            _write_prompts(root)
            entry = MiningEntry(keywords=["exerts himself", "toil"], phrase="He exerts himself on brands of his own, if at all.")
            calls, original_call_model = {}, generate_cards._call_model

            def fake_call_model(openai_base, api_key, system_prompt, user_message, model, log_dir, keyword):
                calls.setdefault(keyword, (system_prompt, user_message))
                return GOOD_CARD

            generate_cards._call_model = fake_call_model
            try:
                generate_cards.run([entry], _config(root))
            finally:
                generate_cards._call_model = original_call_model

            (main_system, main_message), (generated_system, generated_message) = calls["exerts himself"], calls["toil"]
            self.assertEqual(main_system, "en prompt")
            self.assertEqual(generated_system, main_system)
            self.assertNotIn("SECONDARY keyword", main_message)
            self.assertIn("SECONDARY keyword", generated_message)
            self.assertNotEqual(generated_message, main_message)


CARTAO_INICIANTE = """Anki Card
Source Context: Série - The Office - S01E01

Front: She *gave up* smoking last year.

Back: gave up – /ɡeɪv ʌp/

Pronunciation: shi GUÊIV âp SMÔU-kin lést iâr

Literal: Ela desistiu fumando último ano

Natural: Ela parou de fumar ano passado.

Gist: Alguém conta que largou o cigarro.

Image: None
Google Image Search Queries:
1. broken cigarette
2. no smoking sign
3. person refusing cigarette
4. quit smoking

Alignment:
1 | She | Ela
2 | gave up | desistiu
3 | smoking | fumando
"""

CARTAO_RUSSO_INICIANTE = """Anki Card
Front
Я не мальчик!

Back
Pronunciation: ia ni MAL-tchik

Literal: Eu não menino

Natural: Eu não sou um menino!

Gist: Alguém corrige uma suposição errada sobre si.

Google Image Search Queries:
1. girl
2. young girl portrait
3. confident girl
4. female child portrait

Image: A confident girl, no text.

Alignment:
1 | Я | Eu
2 | не | não
3 | мальчик | menino
"""


def _com_o_estilo(root: Path, lang: str) -> dict:
    """A configuração de um Envio do add-on: o estilo do idioma (com o prompt do nível, lido do disco) no lugar dos `paths.prompts`."""
    estilo = estilos.estilo(lang)
    estilo["prompt"] = str(Path(__file__).resolve().parent / estilo["prompt"])
    return dict(_config(root), lang=lang, estilo=estilo)


class GenerateCardsByStyleTests(unittest.TestCase):
    def _gerar(self, lang, entry, resposta):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / "Output").mkdir()
            (root / "log").mkdir()
            enviados = []
            original = generate_cards._call_model

            def fake_call_model(openai_base, api_key, system_prompt, user_message, model, log_dir, keyword):
                enviados.append((system_prompt, user_message))
                return resposta

            generate_cards._call_model = fake_call_model
            try:
                saved = generate_cards.run([entry], _com_o_estilo(root, lang))
            finally:
                generate_cards._call_model = original
            textos = [path.read_text(encoding="utf-8") for path in (root / "Output").glob("*.txt")]
        return saved, enviados, textos

    def test_o_cartao_do_ingles_e_pedido_com_o_prompt_do_iniciante_e_so_salva_se_a_palavra_confere(self):
        entry = MiningEntry(keywords=["gave up"], phrase="She gave up smoking last year.")
        saved, enviados, textos = self._gerar("en", entry, CARTAO_INICIANTE)
        iniciante = (Path(__file__).resolve().parent / "prompts" / "en_iniciante.txt").read_text(encoding="utf-8").strip()
        self.assertEqual([prompt for prompt, _ in enviados], [iniciante])
        self.assertEqual(len(saved), 1)
        self.assertIn("Literal: Ela desistiu", textos[0])

    def test_o_estilo_diz_que_a_linha_russa_e_a_frase_inteira_e_o_prompt_do_iniciante_do_russo_vale(self):
        entry = MiningEntry(keywords=["Я не"], phrase="Я не мальчик!", context_source="Série", file_stem="russa")
        saved, enviados, textos = self._gerar("ru", entry, CARTAO_RUSSO_INICIANTE)
        iniciante = (Path(__file__).resolve().parent / "prompts" / "ru_iniciante.txt").read_text(encoding="utf-8").strip()
        self.assertEqual(([prompt for prompt, _ in enviados], saved), ([iniciante], ["russa"]))
        self.assertEqual(enviados[0][1], "Я не мальчик!\n[Context: Série]")

    def test_um_cartao_russo_sem_a_traducao_em_portugues_nao_e_salvo(self):
        entry = MiningEntry(keywords=["Я не"], phrase="Я не мальчик!", file_stem="russa")
        saved, _, textos = self._gerar("ru", entry, CARTAO_RUSSO_INICIANTE.replace("Literal:", "Outro:").replace("Natural:", "Mais:"))
        self.assertEqual((saved, textos), ([], []))

    def test_o_estilo_do_intermediario_do_russo_traz_o_prompt_dele_e_o_cartao_com_a_definicao_em_ingles_e_salvo(self):
        cartao = "Anki Card\nFront\nОна приходила вчера.\n\nBack\nWord: приходила\n\nDefinition: To come, to arrive.\n\nImage: A door.\n"
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / "Output").mkdir()
            (root / "log").mkdir()
            enviados = []
            original = generate_cards._call_model
            generate_cards._call_model = lambda base, key, prompt, mensagem, modelo, log, kw: enviados.append((prompt, mensagem)) or cartao
            config = _com_o_estilo(root, "ru")
            config["estilo"] = dict(estilos.estilo("ru", "intermediario"), prompt=str(Path(__file__).resolve().parent / "prompts" / "ru_intermediario.txt"))
            try:
                saved = generate_cards.run([MiningEntry(keywords=["Она приходила"], phrase="Она приходила вчера.", file_stem="russa")], config)
            finally:
                generate_cards._call_model = original
            textos = [path.read_text(encoding="utf-8") for path in (root / "Output").glob("*.txt")]
        intermediario = (Path(__file__).resolve().parent / "prompts" / "ru_intermediario.txt").read_text(encoding="utf-8").strip()
        self.assertEqual(([prompt for prompt, _ in enviados], saved), ([intermediario], ["russa"]))
        self.assertIn("Definition: To come", textos[0])


if __name__ == "__main__":
    unittest.main()

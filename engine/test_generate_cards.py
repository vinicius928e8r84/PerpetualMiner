import tempfile
import unittest
from pathlib import Path

import estilos
import generate_cards
from parser import MiningEntry, get_card_jobs


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


def roteiro(*respostas, pedidos=None):
    """The `pedir` of a test: answers `respostas` in order (the last one again when they run out) and keeps (system, message, label) of each request."""
    fila = list(respostas)

    def pedir(sistema, mensagem, rotulo):
        if pedidos is not None:
            pedidos.append((sistema, mensagem, rotulo))
        return fila.pop(0) if len(fila) > 1 else fila[0]

    return pedir


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

    def _card_com_front(self, front: str, keyword: str) -> str:
        return GOOD_CARD.replace("He *exerts himself* on brands of his own, if at all.", front).replace(
            "exerts himself - /ig-ZURTS him-SELF/", f"{keyword} - /x/")

    def test_front_com_rotulo_depois_da_frase_e_recusado(self):
        casos = [
            ("Stop putting off your homework until the last minute <br>Expressão-alvo: *put off*", "put off"),
            ("She turned down the job offer because the salary was too low.\n\nTarget: *turn down*", "turn down"),
            ("Our car broke down in the middle of the highway<br><br>Target: *break down*", "break down"),
        ]
        for front, keyword in casos:
            with self.subTest(keyword=keyword):
                self.assertFalse(generate_cards._validate_keyword(self._card_com_front(front, keyword), keyword))

    def test_front_sem_rotulo_com_a_expressao_na_frase_continua_aceito(self):
        card = self._card_com_front("She *turned down* the job offer because the salary was too low.", "turned down")

        self.assertTrue(generate_cards._validate_keyword(card, "turned down"))

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
            pedidos = []
            falha = generate_cards.escrever(get_card_jobs(entry)[0], _config(root), roteiro(dropped, GOOD_CARD, pedidos=pedidos), "5-0")

            self.assertEqual((falha, len(pedidos)), (None, 2))
            self.assertIn("every word", pedidos[1][1])
            self.assertIn("Front: He *exerts himself* on", (root / "Output" / "5-0.txt").read_text(encoding="utf-8"))

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
            falha = generate_cards.escrever(get_card_jobs(entry)[0], _config(root), roteiro(BAD_CARD, GOOD_CARD, pedidos=calls), "5-0")

            self.assertEqual(len(calls), 2)
            self.assertIsNone(falha)
            card_path = root / "Output" / "5-0.txt"
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
            falha = generate_cards.escrever(get_card_jobs(entry)[0], _config(root), roteiro(BAD_CARD, pedidos=calls), "5-0")

            self.assertEqual(len(calls), 2)
            self.assertEqual(falha, "keyword_mismatch")
            self.assertEqual(list((root / "Output").glob("*.txt")), [])

    def test_o_nome_do_cartao_e_o_unico_rotulo_no_log_e_no_pedido_e_so_o_cartao_pedido_e_escrito(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / "Output").mkdir()
            (root / "log").mkdir()
            _write_prompts(root)
            entry = MiningEntry(keywords=["exerts himself", "toil"], phrase="He exerts himself on brands of his own, if at all.")
            pedidos = []
            with self.assertLogs("perpetualminer.motor", level="INFO") as logged:
                falha = generate_cards.escrever(get_card_jobs(entry)[0], _config(root), roteiro(GOOD_CARD, pedidos=pedidos), "77-0")

            self.assertIsNone(falha)
            self.assertEqual([rotulo for _, _, rotulo in pedidos], ["77-0"])
            self.assertEqual([path.name for path in (root / "Output").glob("*.txt")], ["77-0.txt"])
            self.assertNotIn("exerts himself", "\n".join(logged.output))
            self.assertNotIn("toil", "\n".join(logged.output))

    def test_escrever_o_mesmo_cartao_duas_vezes_pede_e_paga_uma(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            _write_prompts(root)
            trabalho = get_card_jobs(MiningEntry(keywords=["exerts himself"], phrase="He exerts himself on brands of his own, if at all."))[0]
            pedidos = []
            falhas = [generate_cards.escrever(trabalho, _config(root), roteiro(GOOD_CARD, pedidos=pedidos), "8-0") for _ in range(2)]
            texto = (root / "Output" / "8-0.txt").read_text(encoding="utf-8")

        self.assertEqual((falhas, len(pedidos)), ([None, None], 1))
        self.assertIn("Back: exerts himself", texto)

    def test_a_recusa_do_provedor_volta_como_o_codigo_dela_e_nada_fica_no_disco(self):
        def recusa(sistema, mensagem, rotulo):
            raise generate_cards.provedores.ErroDoProvedor("openai_key_rejected")

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            _write_prompts(root)
            trabalho = get_card_jobs(MiningEntry(keywords=["toil"], phrase="They toil all day."))[0]
            falha = generate_cards.escrever(trabalho, _config(root), recusa, "8-0")
            escritos = list(root.rglob("*.txt*"))

        self.assertEqual(falha, "openai_key_rejected")
        self.assertEqual([caminho.name for caminho in escritos if caminho.parent.name == "Output"], [])

    def test_a_resposta_vazia_e_empty_response(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            _write_prompts(root)
            trabalho = get_card_jobs(MiningEntry(keywords=["toil"], phrase="They toil all day."))[0]
            self.assertEqual(generate_cards.escrever(trabalho, _config(root), roteiro(""), "8-0"), "empty_response")

    def test_o_cartao_principal_e_o_gerado_usam_o_mesmo_prompt_com_mensagens_diferentes(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / "Output").mkdir()
            (root / "log").mkdir()
            _write_prompts(root)
            entry = MiningEntry(keywords=["exerts himself", "toil"], phrase="He exerts himself on brands of his own, if at all.")
            pedidos = []
            for posicao, trabalho in enumerate(get_card_jobs(entry)):
                generate_cards.escrever(trabalho, _config(root), roteiro(GOOD_CARD, pedidos=pedidos), "77-%d" % posicao)
            calls = {}
            nomes = {"77-0": "exerts himself", "77-1": "toil"}
            for system_prompt, user_message, rotulo in pedidos:
                calls.setdefault(nomes[rotulo], (system_prompt, user_message))

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
            pedidos = []
            falha = generate_cards.escrever(get_card_jobs(entry)[0], _com_o_estilo(root, lang), roteiro(resposta, pedidos=pedidos), "3-0")
            enviados = [(sistema, mensagem) for sistema, mensagem, _ in pedidos]
            textos = [path.read_text(encoding="utf-8") for path in (root / "Output").glob("*.txt")]
        return falha, enviados, textos

    def test_o_cartao_do_ingles_e_pedido_com_o_prompt_do_iniciante_e_so_salva_se_a_palavra_confere(self):
        entry = MiningEntry(keywords=["gave up"], phrase="She gave up smoking last year.")
        falha, enviados, textos = self._gerar("en", entry, CARTAO_INICIANTE)
        iniciante = (Path(__file__).resolve().parent / "prompts" / "en_iniciante.txt").read_text(encoding="utf-8").strip()
        self.assertEqual([prompt for prompt, _ in enviados], [iniciante])
        self.assertEqual((falha, len(textos)), (None, 1))
        self.assertIn("Literal: Ela desistiu", textos[0])

    def test_o_estilo_diz_que_a_linha_russa_e_a_frase_inteira_e_o_prompt_do_iniciante_do_russo_vale(self):
        entry = MiningEntry(keywords=["Я не"], phrase="Я не мальчик!", context_source="Série", file_stem="russa")
        falha, enviados, textos = self._gerar("ru", entry, CARTAO_RUSSO_INICIANTE)
        iniciante = (Path(__file__).resolve().parent / "prompts" / "ru_iniciante.txt").read_text(encoding="utf-8").strip()
        self.assertEqual(([prompt for prompt, _ in enviados], falha, len(textos)), ([iniciante], None, 1))
        self.assertEqual(enviados[0][1], "Я не мальчик!\n[Context: Série]")

    def test_um_cartao_russo_sem_a_traducao_em_portugues_nao_e_salvo(self):
        entry = MiningEntry(keywords=["Я не"], phrase="Я не мальчик!", file_stem="russa")
        falha, _, textos = self._gerar("ru", entry, CARTAO_RUSSO_INICIANTE.replace("Literal:", "Outro:").replace("Natural:", "Mais:"))
        self.assertEqual((falha, textos), ("invalid_card", []))

    def test_o_estilo_do_intermediario_do_russo_traz_o_prompt_dele_e_o_cartao_com_a_definicao_em_ingles_e_salvo(self):
        cartao = "Anki Card\nFront\nОна приходила вчера.\n\nBack\nWord: приходила\n\nDefinition: To come, to arrive.\n\nImage: A door.\n"
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / "Output").mkdir()
            (root / "log").mkdir()
            pedidos = []
            config = _com_o_estilo(root, "ru")
            config["estilo"] = dict(estilos.estilo("ru", "intermediario"), prompt=str(Path(__file__).resolve().parent / "prompts" / "ru_intermediario.txt"))
            entrada = MiningEntry(keywords=["Она приходила"], phrase="Она приходила вчера.", file_stem="russa")
            falha = generate_cards.escrever(get_card_jobs(entrada)[0], config, roteiro(cartao, pedidos=pedidos), "3-0")
            enviados = [(sistema, mensagem) for sistema, mensagem, _ in pedidos]
            textos = [path.read_text(encoding="utf-8") for path in (root / "Output").glob("*.txt")]
        intermediario = (Path(__file__).resolve().parent / "prompts" / "ru_intermediario.txt").read_text(encoding="utf-8").strip()
        self.assertEqual(([prompt for prompt, _ in enviados], falha), ([intermediario], None))
        self.assertIn("Definition: To come", textos[0])


if __name__ == "__main__":
    unittest.main()

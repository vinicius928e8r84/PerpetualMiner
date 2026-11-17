import tempfile
import unittest
from pathlib import Path

import generate_cards
from parser import MiningEntry
from test_generate_cards import GOOD_CARD, _config, _write_prompts


class InflectedFormTests(unittest.TestCase):
    def _card_com_front(self, front: str, keyword: str) -> str:
        return GOOD_CARD.replace("He *exerts himself* on brands of his own, if at all.", front).replace(
            "exerts himself - /ig-ZURTS him-SELF/", f"{keyword} - /x/")

    def test_front_com_a_forma_flexionada_destacada_e_aceito_quando_o_lema_bate_com_a_palavra_chave(self):
        casos = [
            ("She *turned down* the job offer because the salary was too low.", "turn down"),
            ("She finally *gave up* smoking last year.", "give up"),
            ("I'm really *looking forward to* meeting you.", "look forward to"),
            ("Stop *putting off* your homework until the last minute.", "put off"),
            ("Our car *broke down* in the middle of the highway.", "break down"),
            ("We *ran out of* milk, so I had to go to the store.", "run out of"),
            ("He *gets along with* everyone.", "get along with"),
        ]
        for front, keyword in casos:
            with self.subTest(front=front):
                self.assertTrue(generate_cards._validate_keyword(self._card_com_front(front, keyword), keyword))

    def test_front_com_a_forma_flexionada_e_o_verso_na_mesma_forma_tambem_e_aceito(self):
        card = self._card_com_front("She *turned down* the job offer.", "turned down")

        self.assertTrue(generate_cards._validate_keyword(card, "turn down"))

    def test_front_com_forma_que_nao_e_do_lema_e_recusado(self):
        casos = [
            ("She *turned up* at the party.", "turn down"),
            ("Our car *broke up* in the middle of the highway.", "break down"),
            ("She *turned down* the offer.", "break down"),
            ("She *gave* up smoking.", "give up"),
            ("She *gived up* smoking.", "give up"),
            ("Our car *breaked down* yesterday.", "break down"),
        ]
        for front, keyword in casos:
            with self.subTest(front=front):
                self.assertFalse(generate_cards._validate_keyword(self._card_com_front(front, keyword), keyword))

    def test_front_com_a_forma_flexionada_e_o_rotulo_depois_da_frase_continua_recusado(self):
        card = self._card_com_front("She *turned down* the offer.\n\nTarget: *turn down*", "turn down")

        self.assertFalse(generate_cards._validate_keyword(card, "turn down"))

    def test_as_formas_do_lema_cobrem_os_irregulares_e_as_regras_do_ingles(self):
        casos = {
            "break": {"breaks", "broke", "broken", "breaking"},
            "give": {"gives", "gave", "given", "giving"},
            "put": {"puts", "putting"},
            "run": {"runs", "ran", "running"},
            "turn": {"turns", "turned", "turning"},
            "carry": {"carries", "carried", "carrying"},
            "come": {"comes", "came", "coming"},
            "stop": {"stops", "stopped", "stopping"},
            "make": {"makes", "made", "making"},
            "get": {"gets", "got", "gotten", "getting"},
        }
        for lema, formas in casos.items():
            with self.subTest(lema=lema):
                self.assertTrue(formas <= generate_cards._forms_of(lema))
        self.assertNotIn("turn", generate_cards._forms_of("break"))
        self.assertNotIn("gived", generate_cards._forms_of("give"))

    def _rodar(self, keyword, phrase, responses):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / "Output").mkdir()
            (root / "log").mkdir()
            _write_prompts(root)
            messages = []
            original_call_model = generate_cards._call_model

            def fake_call_model(base, key, system, message, *args, **kwargs):
                messages.append(message)
                return responses.pop(0)

            generate_cards._call_model = fake_call_model
            failures = {}
            try:
                saved = generate_cards.run([MiningEntry(keywords=[keyword], phrase=phrase)], _config(root), failures=failures)
            finally:
                generate_cards._call_model = original_call_model
            texts = [path.read_text(encoding="utf-8") for path in (root / "Output").glob("*.txt")]
        return saved, messages, texts, failures

    def test_run_salva_o_cartao_com_a_frase_minerada_e_a_forma_flexionada_destacada_sem_nova_tentativa(self):
        phrase = "She turned down the job offer because the salary was too low."
        card = self._card_com_front("She *turned down* the job offer because the salary was too low.", "turn down")

        saved, messages, texts, failures = self._rodar("turn down", phrase, [card])

        self.assertEqual((len(saved), len(messages), failures), (1, 1, {}))
        self.assertIn("Front: She *turned down* the job offer because the salary was too low.", texts[0])

    def test_run_regenera_o_cartao_que_reescreveu_a_frase_flexionada_para_a_forma_base(self):
        phrase = "Stop putting off your homework until the last minute."
        rewritten = self._card_com_front("Don't *put off* your homework until the last minute.", "put off")
        kept = self._card_com_front("Stop *putting off* your homework until the last minute.", "put off")

        saved, messages, texts, failures = self._rodar("put off", phrase, [rewritten, kept])

        self.assertEqual((len(saved), len(messages), failures), (1, 2, {}))
        self.assertIn("every word", messages[1])
        self.assertIn("Front: Stop *putting off* your homework", texts[0])

    def test_run_recusa_a_frase_flexionada_reescrita_que_persiste(self):
        phrase = "Our car broke down in the middle of the highway."
        rewritten = self._card_com_front("Our car *did break down* in the middle of the highway.", "break down")

        saved, messages, texts, failures = self._rodar("break down", phrase, [rewritten, rewritten])

        self.assertEqual((saved, texts, list(failures.values())), ([], [], ["keyword_mismatch"]))

    def test_a_nova_tentativa_do_lema_pede_a_forma_da_frase_e_nao_so_a_forma_base(self):
        message = generate_cards._build_keyword_retry_message("put off : Stop putting off", "put off")

        self.assertIn("exactly as it is written in the phrase", message)


if __name__ == "__main__":
    unittest.main()

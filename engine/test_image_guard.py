"""A triagem de imagem (concreto ou abstrato) fala com a OpenAI por HTTP direto: o que atravessa a fronteira e o que ela decide."""

import json
import tempfile
import unittest
from pathlib import Path

import image_guard
from test_servidor_de_mentira import ServidorDeMentira


def resposta(letra):
    return 200, {"choices": [{"message": {"content": letra}}], "usage": {"prompt_tokens": 80, "completion_tokens": 1}}


class ImageGuardTests(unittest.TestCase):
    def decidir(self, palavra, rota, **mais):
        with tempfile.TemporaryDirectory() as td, ServidorDeMentira({"/v1/chat/completions": rota}) as openai:
            decisao = image_guard.should_generate_image(palavra, "sk-proj-0000", td, openai_base=openai.base, **mais)
            custos = [json.loads(linha) for linha in (Path(td) / "costs.jsonl").read_text(encoding="utf-8").splitlines()] if (Path(td) / "costs.jsonl").exists() else []
            return decisao, openai.pedidos, custos

    def test_a_concrete_word_is_asked_to_the_model_and_the_cost_is_logged(self):
        decisao, pedidos, custos = self.decidir("bicycle", resposta("C"))
        self.assertTrue(decisao)
        corpo = pedidos[0]["corpo"]
        self.assertEqual((corpo["model"], corpo["max_tokens"], corpo["temperature"], corpo["messages"][1]), ("gpt-4o-mini", 1, 0, {"role": "user", "content": "bicycle"}))
        self.assertEqual([(c["type"], c["model"], c["keyword"]) for c in custos], [("tokens", "gpt-4o-mini", "[image_guard] bicycle")])

    def test_an_abstract_answer_skips_the_image(self):
        self.assertFalse(self.decidir("bicycle", resposta("A"))[0])

    def test_an_abstract_pattern_is_decided_without_asking_the_model(self):
        decisao, pedidos, _ = self.decidir("resilience", resposta("C"))
        self.assertEqual((decisao, pedidos), (False, []))

    def test_any_error_from_the_model_defaults_to_generating_the_image(self):
        self.assertTrue(self.decidir("bicycle", (500, {"error": {"message": "x"}}))[0])

    def test_the_cost_label_can_be_something_other_than_the_word(self):
        _, _, custos = self.decidir("bicycle", resposta("C"), label="1760000000000-0")
        self.assertEqual([c["keyword"] for c in custos], ["[image_guard] 1760000000000-0"])


if __name__ == "__main__":
    unittest.main()

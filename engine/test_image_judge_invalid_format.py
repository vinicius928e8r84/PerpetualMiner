"""O juiz de imagem fala com a OpenAI por HTTP direto (sem o SDK): o que atravessa a fronteira e o que o juiz devolve."""

import base64
import json
import tempfile
import unittest
from pathlib import Path

import image_judge
import openai_http
from test_servidor_de_mentira import ServidorDeMentira

PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
    b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde"
    b"\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0\x00\x00\x03\x01"
    b"\x01\x00\xc9\xfe\x92\xef\x00\x00\x00\x00IEND\xaeB`\x82"
)
CHAVE = "sk-proj-chave-do-juiz-0000"


def julgar(pasta, openai, mode="real_only", **mais):
    raiz = Path(pasta)
    imagem = raiz / "candidate.png"
    imagem.write_bytes(PNG_BYTES)
    (raiz / "log").mkdir(exist_ok=True)
    return image_judge.rank_candidates(
        api_key=CHAVE, model="mock-judge", log_dir=str(raiz / "log"), keyword="saw", phrase="I saw it happen.", context="test",
        card_text="Front: I saw it happen.", candidates=[{"path": str(imagem), "meta": {"query": "eye", "source": "openverse"}}],
        mode=mode, openai_base=openai.base, **mais)


def veredito(**campos):
    conteudo = dict({"best_index": 0, "best_score": 81, "verdict": "keep_real", "summary": "olho", "candidates": [{"index": 0, "score": 81, "reason": "olho"}]}, **campos)
    return 200, {"choices": [{"message": {"content": json.dumps(conteudo)}}], "usage": {"prompt_tokens": 1500, "completion_tokens": 40}}


class ImageJudgeTests(unittest.TestCase):
    def test_the_judge_sends_the_image_as_a_data_url_asks_for_json_and_returns_the_verdict(self):
        with tempfile.TemporaryDirectory() as td, ServidorDeMentira({"/v1/chat/completions": veredito()}) as openai:
            resultado = julgar(td, openai)
            pedido = openai.pedidos[0]
            custos = [json.loads(linha) for linha in (Path(td) / "log" / "costs.jsonl").read_text(encoding="utf-8").splitlines()]
        self.assertEqual((resultado["best_index"], resultado["best_score"], resultado["verdict"]), (0, 81, "keep_real"))
        self.assertEqual(pedido["cabecalhos"]["Authorization"], "Bearer " + CHAVE)
        self.assertEqual((pedido["corpo"]["model"], pedido["corpo"]["temperature"], pedido["corpo"]["response_format"]), ("mock-judge", 0, {"type": "json_object"}))
        imagens = [parte["image_url"]["url"] for parte in pedido["corpo"]["messages"][1]["content"] if parte["type"] == "image_url"]
        self.assertEqual(imagens, ["data:image/png;base64," + base64.b64encode(PNG_BYTES).decode("ascii")])
        self.assertEqual([(c["type"], c["model"], c["input_tokens"], c["output_tokens"], c["keyword"]) for c in custos], [("tokens", "mock-judge", 1500, 40, "[image_judge] saw")])

    def test_the_cost_label_can_be_something_other_than_the_keyword(self):
        with tempfile.TemporaryDirectory() as td, ServidorDeMentira({"/v1/chat/completions": veredito()}) as openai:
            julgar(td, openai, label="1760000000000-0")
            custos = (Path(td) / "log" / "costs.jsonl").read_text(encoding="utf-8")
        self.assertIn("[image_judge] 1760000000000-0", custos)
        self.assertNotIn("saw", custos)

    def test_invalid_image_format_returns_controlled_low_score(self):
        recusa = (400, {"error": {"message": "unsupported image " + CHAVE, "type": "invalid_request_error", "code": "invalid_image_format"}})
        with tempfile.TemporaryDirectory() as td, ServidorDeMentira({"/v1/chat/completions": recusa}) as openai:
            result = julgar(td, openai)

        self.assertEqual(result["error"], "invalid_image_format")
        self.assertEqual(result["best_index"], 0)
        self.assertEqual(result["best_score"], 0)
        self.assertEqual(result["verdict"], "generate_better")
        self.assertEqual(result["candidates"][0]["reason"], "discarded_after_invalid_image_format")

    def test_any_other_refusal_reaches_the_caller_as_the_openai_code(self):
        with tempfile.TemporaryDirectory() as td, ServidorDeMentira({"/v1/chat/completions": (429, {"error": {"code": "rate_limit_exceeded"}})}) as openai:
            with self.assertRaises(openai_http.ErroDaOpenAI) as recusa:
                julgar(td, openai)
        self.assertEqual(recusa.exception.codigo, openai_http.LIMITE_DE_USO)

    def test_a_passing_429_or_5xx_is_asked_again_and_the_judge_still_chooses_the_photo(self):
        for falha in [(429, {"error": {"code": "rate_limit_exceeded"}}), (503, {"error": {"message": "overloaded"}})]:
            vezes = []
            with self.subTest(falha[0]), tempfile.TemporaryDirectory() as td:
                with ServidorDeMentira({"/v1/chat/completions": lambda pedido: falha if not vezes.append(1) and len(vezes) == 1 else veredito()}) as openai:
                    resultado = julgar(td, openai)
                    pedidos = len(openai.pedidos)
                self.assertEqual((resultado["best_index"], resultado["verdict"], pedidos), (0, "keep_real", 2))

    def test_a_refusal_that_keeps_coming_is_asked_three_times_and_then_reaches_the_caller(self):
        with tempfile.TemporaryDirectory() as td, ServidorDeMentira({"/v1/chat/completions": (429, {"error": {"code": "rate_limit_exceeded"}})}) as openai:
            with self.assertRaises(openai_http.ErroDaOpenAI) as recusa:
                julgar(td, openai)
            pedidos = len(openai.pedidos)
        self.assertEqual((recusa.exception.codigo, pedidos), (openai_http.LIMITE_DE_USO, 3))

    def test_a_rejected_key_or_a_billing_refusal_is_not_asked_again(self):
        for status, corpo, codigo in [(401, {"error": {"code": "invalid_api_key"}}, openai_http.RECUSADA),
                                      (429, {"error": {"code": "insufficient_quota"}}, openai_http.SEM_CREDITO)]:
            with self.subTest(codigo), tempfile.TemporaryDirectory() as td, ServidorDeMentira({"/v1/chat/completions": (status, corpo)}) as openai:
                with self.assertRaises(openai_http.ErroDaOpenAI) as recusa:
                    julgar(td, openai)
                pedidos = len(openai.pedidos)
            self.assertEqual((recusa.exception.codigo, pedidos), (codigo, 1))


if __name__ == "__main__":
    unittest.main()

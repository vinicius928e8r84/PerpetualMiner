import base64
import json
import tempfile
import unittest
from pathlib import Path

import generate_images
from test_servidor_de_mentira import ServidorDeMentira

PNG_BYTES = b"fake png bytes"
B64 = base64.b64encode(PNG_BYTES).decode()
CHAVE = "sk-proj-chave-da-imagem-0000"


def _config(root: Path, base: str, model: str = "test-image-model") -> dict:
    return {
        "openai_api_key": CHAVE,
        "openai_base": base,
        "openai": {"image_model": model, "image_size": "1024x1024"},
        "paths": {
            "output_dir": str(root / "Output"),
            "log_dir": str(root / "log"),
            "prompts_file": str(root / "prompts.txt"),
        },
    }


def _ok(corpo=None):
    return 200, {"data": [{"b64_json": B64}], "usage": {"total_tokens": 1}}


def _model_gone(pedido):
    return 404, {"error": {"message": "The model `test-image-model` does not exist " + CHAVE, "type": "invalid_request_error", "code": "model_not_found"}}


def _failure_log(root: Path) -> list[dict]:
    path = root / "log" / generate_images.FAILURES_LOG
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def _good_or_gone(pedido):
    return _model_gone(pedido) if pedido["corpo"]["prompt"] == "bad prompt" else _ok()


class ImageModelFromConfigTests(unittest.TestCase):
    def test_generate_one_sends_the_model_the_size_and_the_key_from_config_and_stores_the_image(self):
        with tempfile.TemporaryDirectory() as tmp, ServidorDeMentira({"/v1/images/generations": _ok}) as openai:
            root = Path(tmp)
            ok = generate_images.generate_one(_config(root, openai.base, "some-other-model"), "cat", "a cat")
            pedido = openai.pedidos[0]
            guardada = (root / "Output" / "cat.png").read_bytes()

        self.assertTrue(ok)
        self.assertEqual(guardada, PNG_BYTES)
        self.assertEqual(pedido["cabecalhos"]["Authorization"], "Bearer " + CHAVE)
        self.assertEqual(pedido["corpo"], {"model": "some-other-model", "prompt": "a cat", "n": 1, "size": "1024x1024"})

    def test_generate_one_can_write_where_the_caller_says(self):
        with tempfile.TemporaryDirectory() as tmp, ServidorDeMentira({"/v1/images/generations": _ok}) as openai:
            destino = Path(tmp) / "elsewhere.png"
            ok = generate_images.generate_one(_config(Path(tmp), openai.base), "cat", "a cat", dest=destino)
            guardada = destino.read_bytes()
        self.assertEqual((ok, guardada), (True, PNG_BYTES))

    def test_generate_one_downloads_the_image_when_the_answer_is_a_url(self):
        with tempfile.TemporaryDirectory() as tmp, ServidorDeMentira() as openai:
            openai.rotas["/v1/images/generations"] = (200, {"data": [{"url": openai.base + "/img.png"}]})
            openai.rotas["/img.png"] = (200, ("image/png", PNG_BYTES))
            ok = generate_images.generate_one(_config(Path(tmp), openai.base), "cat", "a cat")
            guardada = (Path(tmp) / "Output" / "cat.png").read_bytes()
        self.assertEqual((ok, guardada), (True, PNG_BYTES))

    def test_shipped_config_no_longer_uses_the_retired_model(self):
        config = json.loads((Path(__file__).parent / "config.json").read_text(encoding="utf-8"))

        self.assertEqual(config["openai"]["image_model"], "gpt-image-2.5-flare")


class ImageGenerationFailureTests(unittest.TestCase):
    def test_unavailable_model_returns_false_and_logs_the_reason(self):
        with tempfile.TemporaryDirectory() as tmp, ServidorDeMentira({"/v1/images/generations": _model_gone}) as openai:
            root = Path(tmp)
            ok = generate_images.generate_one(_config(root, openai.base), "cat", "a cat")

            self.assertFalse(ok)
            self.assertFalse((root / "Output" / "cat.png").exists())
            entries = _failure_log(root)
            self.assertEqual(len(entries), 1)
            self.assertEqual(entries[0]["keyword"], "cat")
            self.assertEqual(entries[0]["model"], "test-image-model")
            self.assertEqual(entries[0]["reason"], "model_unavailable")
            self.assertNotIn(CHAVE, json.dumps(entries))

    def test_other_generation_errors_are_logged_as_generation_error(self):
        with tempfile.TemporaryDirectory() as tmp, ServidorDeMentira({"/v1/images/generations": (500, {"error": {"message": "boom"}})}) as openai:
            root = Path(tmp)
            ok = generate_images.generate_one(_config(root, openai.base), "cat", "a cat")

            self.assertFalse(ok)
            self.assertEqual(_failure_log(root)[0]["reason"], "generation_error")

    def test_a_passing_429_or_5xx_is_asked_again_and_the_image_is_stored(self):
        for falha in [(429, {"error": {"code": "rate_limit_exceeded"}}), (502, {"error": {"message": "bad gateway"}})]:
            vezes = []
            with self.subTest(falha[0]), tempfile.TemporaryDirectory() as tmp:
                with ServidorDeMentira({"/v1/images/generations": lambda pedido: (vezes.append(1), falha if len(vezes) == 1 else _ok())[1]}) as openai:
                    root = Path(tmp)
                    ok = generate_images.generate_one(_config(root, openai.base), "cat", "a cat")
                    pedidos = len(openai.pedidos)
                    guardada = (root / "Output" / "cat.png").read_bytes()
                self.assertEqual((ok, guardada, pedidos, _failure_log(root)), (True, PNG_BYTES, 2, []))

    def test_a_generation_that_keeps_failing_is_asked_three_times_and_then_logged_once(self):
        with tempfile.TemporaryDirectory() as tmp, ServidorDeMentira({"/v1/images/generations": (503, {"error": {"message": "boom"}})}) as openai:
            root = Path(tmp)
            ok = generate_images.generate_one(_config(root, openai.base), "cat", "a cat")
            self.assertEqual((ok, len(openai.pedidos), len(_failure_log(root))), (False, 3, 1))

    def test_a_missing_model_is_not_asked_again(self):
        with tempfile.TemporaryDirectory() as tmp, ServidorDeMentira({"/v1/images/generations": _model_gone}) as openai:
            generate_images.generate_one(_config(Path(tmp), openai.base), "cat", "a cat")
            self.assertEqual(len(openai.pedidos), 1)

    def test_an_answer_without_an_image_is_a_failure_too(self):
        with tempfile.TemporaryDirectory() as tmp, ServidorDeMentira({"/v1/images/generations": (200, {"data": []})}) as openai:
            root = Path(tmp)
            ok = generate_images.generate_one(_config(root, openai.base), "cat", "a cat")

            self.assertEqual((ok, (root / "Output" / "cat.png").exists()), (False, False))

    def test_no_answer_at_all_is_a_failure_and_does_not_raise(self):
        with ServidorDeMentira() as fora:
            base = fora.base
        with tempfile.TemporaryDirectory() as tmp:
            self.assertFalse(generate_images.generate_one(_config(Path(tmp), base), "cat", "a cat"))

    def test_one_card_failing_does_not_stop_the_other_cards(self):
        with tempfile.TemporaryDirectory() as tmp, ServidorDeMentira({"/v1/images/generations": _good_or_gone}) as openai:
            root = Path(tmp)
            config = _config(root, openai.base)
            results = []
            for stem, prompt in [("one", "good prompt"), ("two", "bad prompt"), ("three", "good prompt")]:
                results.append(generate_images.generate_one(config, stem, prompt))

            self.assertEqual(results, [True, False, True])
            self.assertTrue((root / "Output" / "one.png").exists())
            self.assertFalse((root / "Output" / "two.png").exists())
            self.assertTrue((root / "Output" / "three.png").exists())
            self.assertEqual([e["keyword"] for e in _failure_log(root)], ["two"])

    def test_run_keeps_going_after_a_failed_prompt_and_logs_it(self):
        with tempfile.TemporaryDirectory() as tmp, ServidorDeMentira({"/v1/images/generations": _good_or_gone}) as openai:
            root = Path(tmp)
            config = _config(root, openai.base)
            Path(config["paths"]["prompts_file"]).write_text(
                "one: good prompt\ntwo: bad prompt\nthree: good prompt\n", encoding="utf-8"
            )
            generated = generate_images.run(config)

            self.assertEqual(generated, ["one.png", "three.png"])
            self.assertEqual(_failure_log(root)[0]["reason"], "model_unavailable")


if __name__ == "__main__":
    unittest.main()

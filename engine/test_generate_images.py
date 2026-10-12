import base64
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

import httpx
import openai
import yaml

import generate_images

PNG_BYTES = b"fake png bytes"
B64 = base64.b64encode(PNG_BYTES).decode()


def _config(root: Path, model: str = "test-image-model") -> dict:
    return {
        "openai_api_key": "test",
        "openai": {"image_model": model, "image_size": "1024x1024"},
        "paths": {
            "output_dir": str(root / "Output"),
            "log_dir": str(root / "log"),
            "prompts_file": str(root / "prompts.txt"),
        },
    }


def _ok_response():
    return SimpleNamespace(data=[SimpleNamespace(b64_json=B64, url=None)])


def _model_gone_error() -> openai.NotFoundError:
    request = httpx.Request("POST", "https://api.openai.com/v1/images/generations")
    response = httpx.Response(404, request=request)
    return openai.NotFoundError(
        "The model `test-image-model` does not exist",
        response=response,
        body={"code": "model_not_found"},
    )


def _failure_log(root: Path) -> list[dict]:
    path = root / "log" / generate_images.FAILURES_LOG
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


class ImageModelFromConfigTests(unittest.TestCase):
    def test_generate_one_sends_the_model_from_config(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with mock.patch.object(generate_images.openai.images, "generate", return_value=_ok_response()) as gen:
                ok = generate_images.generate_one(_config(root, "some-other-model"), "cat", "a cat")

            self.assertTrue(ok)
            self.assertEqual(gen.call_args.kwargs["model"], "some-other-model")
            self.assertEqual((root / "Output" / "cat.png").read_bytes(), PNG_BYTES)

    def test_shipped_config_no_longer_uses_the_retired_model(self):
        config = yaml.safe_load((Path(__file__).parent / "config.yaml").read_text(encoding="utf-8"))

        self.assertEqual(config["openai"]["image_model"], "gpt-image-2.5-flare")


class ImageGenerationFailureTests(unittest.TestCase):
    def test_unavailable_model_returns_false_and_logs_the_reason(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with mock.patch.object(generate_images.openai.images, "generate", side_effect=_model_gone_error()):
                ok = generate_images.generate_one(_config(root), "cat", "a cat")

            self.assertFalse(ok)
            self.assertFalse((root / "Output" / "cat.png").exists())
            entries = _failure_log(root)
            self.assertEqual(len(entries), 1)
            self.assertEqual(entries[0]["keyword"], "cat")
            self.assertEqual(entries[0]["model"], "test-image-model")
            self.assertEqual(entries[0]["reason"], "model_unavailable")

    def test_other_generation_errors_are_logged_as_generation_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with mock.patch.object(generate_images.openai.images, "generate", side_effect=RuntimeError("boom")):
                ok = generate_images.generate_one(_config(root), "cat", "a cat")

            self.assertFalse(ok)
            self.assertEqual(_failure_log(root)[0]["reason"], "generation_error")

    def test_one_card_failing_does_not_stop_the_other_cards(self):
        def fake_generate(**kwargs):
            if kwargs["prompt"] == "bad prompt":
                raise _model_gone_error()
            return _ok_response()

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            config = _config(root)
            results = []
            with mock.patch.object(generate_images.openai.images, "generate", side_effect=fake_generate):
                for stem, prompt in [("one", "good prompt"), ("two", "bad prompt"), ("three", "good prompt")]:
                    results.append(generate_images.generate_one(config, stem, prompt))

            self.assertEqual(results, [True, False, True])
            self.assertTrue((root / "Output" / "one.png").exists())
            self.assertFalse((root / "Output" / "two.png").exists())
            self.assertTrue((root / "Output" / "three.png").exists())
            self.assertEqual([e["keyword"] for e in _failure_log(root)], ["two"])

    def test_run_keeps_going_after_a_failed_prompt_and_logs_it(self):
        def fake_generate(**kwargs):
            if kwargs["prompt"] == "bad prompt":
                raise _model_gone_error()
            return _ok_response()

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            config = _config(root)
            Path(config["paths"]["prompts_file"]).write_text(
                "one: good prompt\ntwo: bad prompt\nthree: good prompt\n", encoding="utf-8"
            )
            with mock.patch.object(generate_images.openai.images, "generate", side_effect=fake_generate):
                generated = generate_images.run(config)

            self.assertEqual(generated, ["one.png", "three.png"])
            self.assertEqual(_failure_log(root)[0]["reason"], "model_unavailable")


if __name__ == "__main__":
    unittest.main()

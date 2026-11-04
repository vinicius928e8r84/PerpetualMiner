"""O modo “imagem gerada” (`imageSource` `"2"`) do Envio: a triagem decide, a geração grava, e o que falha deixa o Cartão sem imagem."""

import json
import tempfile
import unittest
from pathlib import Path

import generate_images
import image_guard
from rodar_imagens import _run_images

CARD_TEXT = """Anki Card
Front: I *saw* it happen.
Back: saw - /saw/
Image: A person witnessing an event, no text.
"""


def _config(output_dir: Path, log_dir: Path) -> dict:
    return {
        "lang": "en",
        "openai_api_key": "test",
        "openai": {"image_model": "gpt-image-1", "image_judge_model": "mock-judge"},
        "image_judge": {"enabled": True},
        "paths": {"output_dir": str(output_dir), "log_dir": str(log_dir)},
    }


def _records(log_dir: Path) -> list[dict]:
    path = log_dir / "costs.jsonl"
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()] if path.exists() else []


class GeneratedImageModeTests(unittest.TestCase):
    def run_mode(self, *, wants, generated):
        originals = (image_guard.should_generate_image, generate_images.generate_one)
        calls = {"guard": [], "generate": []}

        def should_generate_image(keyword, *args, **kwargs):
            calls["guard"].append(keyword)
            return wants

        def generate_one(config, stem, prompt, dest=None):
            calls["generate"].append((stem, prompt))
            if generated:
                (dest or Path(config["paths"]["output_dir"]) / f"{stem}.png").write_bytes(b"png")
            return generated

        image_guard.should_generate_image, generate_images.generate_one = should_generate_image, generate_one
        self.addCleanup(lambda: setattr(image_guard, "should_generate_image", originals[0]))
        self.addCleanup(lambda: setattr(generate_images, "generate_one", originals[1]))
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            output_dir, log_dir = root / "Output", root / "log"
            output_dir.mkdir()
            log_dir.mkdir()
            (output_dir / "saw.txt").write_text(CARD_TEXT, encoding="utf-8")
            result = _run_images(_config(output_dir, log_dir), ["saw:A person witnessing an event"], output_dir, "2", "test", str(log_dir))
            return result, calls, sorted(p.name for p in output_dir.glob("*.png")), _records(log_dir)

    def test_a_concrete_word_is_generated_and_recorded_as_a_generated_image(self):
        (files, skipped, sources), calls, pngs, records = self.run_mode(wants=True, generated=True)
        self.assertEqual((files, skipped, sources, pngs), (["saw.png"], 0, {"saw": "gerada"}, ["saw.png"]))
        self.assertEqual(calls["generate"], [("saw", "A person witnessing an event")])
        self.assertEqual([(r["type"], r.get("source") or r.get("result")) for r in records], [("image", "dalle"), ("image_pipeline", "generated_direct")])

    def test_an_abstract_word_is_skipped_without_paying_for_the_generation(self):
        (files, skipped, sources), calls, pngs, records = self.run_mode(wants=False, generated=True)
        self.assertEqual((files, skipped, sources, pngs, calls["generate"]), ([], 1, {}, [], []))
        self.assertEqual([(r["type"], r["result"]) for r in records], [("image_pipeline", "abstract_guard")])

    def test_a_failed_generation_leaves_the_card_without_an_image(self):
        (files, skipped, sources), calls, pngs, records = self.run_mode(wants=True, generated=False)
        self.assertEqual((files, skipped, sources, pngs), ([], 0, {}, []))
        self.assertEqual([(r["type"], r["result"]) for r in records], [("image_pipeline", "generation_failed")])


if __name__ == "__main__":
    unittest.main()

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx
import openai

import image_judge


PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
    b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde"
    b"\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0\x00\x00\x03\x01"
    b"\x01\x00\xc9\xfe\x92\xef\x00\x00\x00\x00IEND\xaeB`\x82"
)


class _FakeCompletions:
    def create(self, **kwargs):
        response = httpx.Response(
            400,
            request=httpx.Request("POST", "https://api.openai.test/v1/chat/completions"),
        )
        raise openai.BadRequestError(
            "Error code: 400 - invalid_image_format",
            response=response,
            body={"error": {"code": "invalid_image_format"}},
        )


class _FakeChat:
    def __init__(self):
        self.completions = _FakeCompletions()


class _FakeOpenAI:
    def __init__(self, api_key):
        self.chat = _FakeChat()


class ImageJudgeInvalidFormatTests(unittest.TestCase):
    def test_invalid_image_format_returns_controlled_low_score(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            image_path = root / "candidate.png"
            image_path.write_bytes(PNG_BYTES)
            log_dir = root / "log"
            log_dir.mkdir()

            with patch.object(image_judge.openai, "OpenAI", _FakeOpenAI):
                result = image_judge.rank_candidates(
                    api_key="test",
                    model="mock-judge",
                    log_dir=str(log_dir),
                    keyword="saw",
                    phrase="I saw it happen.",
                    context="test",
                    card_text="Front: I saw it happen.",
                    candidates=[{"path": str(image_path), "meta": {"query": "eye"}}],
                    mode="real_only",
                )

            self.assertEqual(result["error"], "invalid_image_format")
            self.assertEqual(result["best_index"], 0)
            self.assertEqual(result["best_score"], 0)
            self.assertEqual(result["verdict"], "generate_better")
            self.assertEqual(result["candidates"][0]["reason"], "discarded_after_invalid_image_format")


if __name__ == "__main__":
    unittest.main()

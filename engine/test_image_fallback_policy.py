import json
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path

import generate_images
import google_images
import image_guard
import image_judge
from rodar_imagens import _build_card_google_queries, _run_images


CARD_TEXT = """Anki Card
Source Context: Game of Thrones
Front: I *saw* it happen.
Back: saw - /saw/
Definition: perceived with the eyes.
Simple meaning: noticed visually.
Google Image Search Queries:
1. eye
2. person looking
3. witness
4. watching scene
Image: A person witnessing an event, no text.
"""


RU_HUNGER_CARD_TEXT = """Anki Card
Source Context: Fairy Tale - King scene - hungry subjects
Front
Vashe Velichestvo, my golodny!

Back
Pronunciation: Vashe Velichestvo, my golodny!

Literal: Your Majesty, we hungry!

Natural: Your Majesty, we are hungry!

Gist: Subjects address their ruler and say they are starving.

Google Image Search Queries:
1. King Arthur character
2. food
3. empty plate
4. starving child Africa

Image: Hungry subjects asking a ruler for food, no text in the image.
"""


def _config(log_dir: Path, lang: str = "en") -> dict:
    return {
        "lang": lang,
        "openai_api_key": "test",
        "openai": {
            "image_model": "gpt-image-1",
            "image_judge_model": "mock-judge",
        },
        "image_judge": {
            "enabled": True,
            "real_candidate_limit": 8,
            "real_total_candidate_limit": 24,
            "max_queries": 8,
            "real_min_score": 55,
            "real_skip_generate_score": 88,
            "generated_win_margin": 20,
        },
        "paths": {"log_dir": str(log_dir)},
    }


def _candidate(query: str) -> dict:
    return {
        "url": f"mock://{query}/0",
        "thumbnail": f"mock://{query}/0",
        "query": query,
        "source": "mock",
    }


def _write_fake_image(dest: Path) -> None:
    dest.write_bytes(b"fake image bytes over 2048" * 100)


def _pipeline_records(log_dir: Path, keyword: str) -> list[dict]:
    path = log_dir / "costs.jsonl"
    if not path.exists():
        return []
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
        and json.loads(line).get("type") == "image_pipeline"
        and json.loads(line).get("keyword") == keyword
    ]


@contextmanager
def _patched_pipeline(
    *,
    search_candidates,
    download_candidate,
    rank_candidates,
    generate_one,
    should_generate_image,
):
    originals = {
        "search_candidates": google_images.search_candidates,
        "download_candidate": google_images.download_candidate,
        "rank_candidates": image_judge.rank_candidates,
        "generate_one": generate_images.generate_one,
        "should_generate_image": image_guard.should_generate_image,
    }
    google_images.search_candidates = search_candidates
    google_images.download_candidate = download_candidate
    image_judge.rank_candidates = rank_candidates
    generate_images.generate_one = generate_one
    image_guard.should_generate_image = should_generate_image
    try:
        yield
    finally:
        google_images.search_candidates = originals["search_candidates"]
        google_images.download_candidate = originals["download_candidate"]
        image_judge.rank_candidates = originals["rank_candidates"]
        generate_images.generate_one = originals["generate_one"]
        image_guard.should_generate_image = originals["should_generate_image"]


class ImageFallbackPolicyTests(unittest.TestCase):
    def test_build_card_google_queries_preserves_explicit_order_and_max_queries(self):
        card_text = """Anki Card
Front: Hungry people ask for food.
Back: hungry - /HUN-gree/
Google Image Search Queries:
1. food
2. empty plate
3. food
4. starving child Africa
Image: Hungry people asking for food, no text.
Natural: We are very hungry.
"""

        queries = _build_card_google_queries(
            card_text,
            stem="hungry_people",
            prompt="fallback generated prompt",
            lang="ru",
            max_queries=3,
        )

        self.assertEqual(queries, ["food", "empty plate", "starving child Africa"])

    def test_russian_hunger_card_sends_high_impact_queries_to_openverse_first(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            output_dir = root / "Output"
            log_dir = root / "log"
            output_dir.mkdir()
            log_dir.mkdir()
            (output_dir / "vashe_velichestvo.txt").write_text(RU_HUNGER_CARD_TEXT, encoding="utf-8")

            calls = {"generate": 0, "queries": []}

            def search_candidates(query, limit=8):
                calls["queries"].append((query, limit))
                return [_candidate(query)] if query == "starving child Africa" else []

            def rank_candidates(**kwargs):
                self.assertEqual(kwargs["keyword"], "King Arthur character")
                return {
                    "best_index": 0,
                    "best_score": 78,
                    "verdict": "keep_real",
                    "summary": "strong hunger memory link",
                    "candidates": [{"index": 0, "score": 78, "reason": "high impact hunger image"}],
                }

            def generate_one(*args, **kwargs):
                calls["generate"] += 1
                raise AssertionError("strong free hunger image should prevent paid generation")

            with _patched_pipeline(
                search_candidates=search_candidates,
                download_candidate=lambda candidate, dest: (_write_fake_image(dest) or True),
                rank_candidates=rank_candidates,
                generate_one=generate_one,
                should_generate_image=lambda *args, **kwargs: True,
            ):
                img_files, skipped, sources = _run_images(
                    _config(log_dir, lang="ru"),
                    ["vashe_velichestvo:Fallback prompt"],
                    output_dir,
                    "1",
                    "test",
                    str(log_dir),
                )

            self.assertEqual([query for query, _ in calls["queries"][:4]], [
                "King Arthur character",
                "food",
                "empty plate",
                "starving child Africa",
            ])
            self.assertEqual(img_files, ["vashe_velichestvo.png"])
            self.assertEqual(skipped, 0)
            self.assertEqual(sources, {"vashe_velichestvo": "real"})
            self.assertEqual(calls["generate"], 0)

    def test_acceptable_real_image_prevents_generation(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            output_dir = root / "Output"
            log_dir = root / "log"
            output_dir.mkdir()
            log_dir.mkdir()
            (output_dir / "saw.txt").write_text(CARD_TEXT, encoding="utf-8")

            calls = {"generate": 0, "queries": []}

            def search_candidates(query, limit=8):
                calls["queries"].append((query, limit))
                return [_candidate(query)]

            def rank_candidates(**kwargs):
                return {
                    "best_index": 0,
                    "best_score": 60,
                    "verdict": "keep_real",
                    "summary": "usable mental link",
                    "candidates": [{"index": 0, "score": 60, "reason": "eye link"}],
                }

            def generate_one(*args, **kwargs):
                calls["generate"] += 1
                raise AssertionError("generation should not run for an acceptable real image")

            with _patched_pipeline(
                search_candidates=search_candidates,
                download_candidate=lambda candidate, dest: (_write_fake_image(dest) or True),
                rank_candidates=rank_candidates,
                generate_one=generate_one,
                should_generate_image=lambda *args, **kwargs: True,
            ):
                img_files, skipped, sources = _run_images(
                    _config(log_dir),
                    ["saw:A fallback generated prompt"],
                    output_dir,
                    "1",
                    "test",
                    str(log_dir),
                )

            self.assertEqual(img_files, ["saw.png"])
            self.assertEqual(skipped, 0)
            self.assertEqual(sources, {"saw": "real"})
            self.assertEqual(calls["generate"], 0)
            self.assertIn(("eye", 8), calls["queries"])
            self.assertTrue((output_dir / "saw.png").exists())

    def test_abstract_english_card_keeps_good_real_image_without_paid_generation(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            output_dir = root / "Output"
            log_dir = root / "log"
            output_dir.mkdir()
            log_dir.mkdir()
            (output_dir / "resilience.txt").write_text(CARD_TEXT, encoding="utf-8")

            calls = {"generate": 0, "queries": []}

            def search_candidates(query, limit=8):
                calls["queries"].append((query, limit))
                return [_candidate(query)]

            def rank_candidates(**kwargs):
                return {
                    "best_index": 0,
                    "best_score": 60,
                    "verdict": "keep_real",
                    "summary": "usable symbol",
                    "candidates": [{"index": 0, "score": 60, "reason": "clear enough"}],
                }

            def generate_one(*args, **kwargs):
                calls["generate"] += 1
                raise AssertionError("good free real images should prevent paid generation")

            with _patched_pipeline(
                search_candidates=search_candidates,
                download_candidate=lambda candidate, dest: (_write_fake_image(dest) or True),
                rank_candidates=rank_candidates,
                generate_one=generate_one,
                should_generate_image=lambda *args, **kwargs: False,
            ):
                img_files, skipped, sources = _run_images(
                    _config(log_dir),
                    ["resilience:A generated prompt that should be blocked"],
                    output_dir,
                    "1",
                    "test",
                    str(log_dir),
                )

            records = _pipeline_records(log_dir, "resilience")
            self.assertEqual(img_files, ["resilience.png"])
            self.assertEqual(skipped, 0)
            self.assertEqual(sources, {"resilience": "real"})
            self.assertEqual(calls["generate"], 0)
            self.assertGreater(len(calls["queries"]), 0)
            self.assertEqual(records[-1]["generation_policy"], "normal")
            self.assertFalse(records[-1]["paid_generation_blocked_by_guard"])

    def test_abstract_english_card_uses_paid_fallback_when_no_real_image_is_found(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            output_dir = root / "Output"
            log_dir = root / "log"
            output_dir.mkdir()
            log_dir.mkdir()
            (output_dir / "resilience.txt").write_text(CARD_TEXT, encoding="utf-8")

            calls = {"generate": 0, "queries": []}

            def search_candidates(query, limit=8):
                calls["queries"].append((query, limit))
                return []

            def generate_one(config, stem, prompt, dest=None):
                calls["generate"] += 1
                _write_fake_image(dest or (output_dir / f"{stem}.png"))
                return True

            with _patched_pipeline(
                search_candidates=search_candidates,
                download_candidate=lambda candidate, dest: False,
                rank_candidates=lambda **kwargs: {},
                generate_one=generate_one,
                should_generate_image=lambda *args, **kwargs: False,
            ):
                img_files, skipped, sources = _run_images(
                    _config(log_dir),
                    ["resilience:A generated prompt that should be blocked"],
                    output_dir,
                    "1",
                    "test",
                    str(log_dir),
                )

            records = _pipeline_records(log_dir, "resilience")
            self.assertEqual(img_files, ["resilience.png"])
            self.assertEqual(skipped, 0)
            self.assertEqual(sources, {"resilience": "gerada"})
            self.assertEqual(calls["generate"], 1)
            self.assertGreater(len(calls["queries"]), 0)
            self.assertEqual(records[-1]["result"], "no_real_candidates")
            self.assertEqual(records[-1]["final_source"], "gerada")
            self.assertEqual(records[-1]["generation_policy"], "normal")
            self.assertFalse(records[-1]["paid_generation_blocked_by_guard"])

    def test_abstract_english_card_uses_paid_fallback_when_real_image_is_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            output_dir = root / "Output"
            log_dir = root / "log"
            output_dir.mkdir()
            log_dir.mkdir()
            (output_dir / "resilience.txt").write_text(CARD_TEXT, encoding="utf-8")

            calls = {"generate": 0}

            def rank_candidates(**kwargs):
                if kwargs["mode"] == "real_only":
                    return {
                        "best_index": 0,
                        "best_score": 20,
                        "verdict": "generate_better",
                        "summary": "too abstract",
                        "candidates": [{"index": 0, "score": 20, "reason": "weak"}],
                    }
                return {
                    "best_index": 1,
                    "best_score": 85,
                    "verdict": "keep_generated",
                    "summary": "generated is clearer",
                    "candidates": [
                        {"index": 0, "score": 20, "reason": "weak"},
                        {"index": 1, "score": 85, "reason": "clear"},
                    ],
                }

            def generate_one(config, stem, prompt, dest=None):
                calls["generate"] += 1
                _write_fake_image(dest or (output_dir / f"{stem}.png"))
                return True

            with _patched_pipeline(
                search_candidates=lambda query, limit=8: [_candidate(query)],
                download_candidate=lambda candidate, dest: (_write_fake_image(dest) or True),
                rank_candidates=rank_candidates,
                generate_one=generate_one,
                should_generate_image=lambda *args, **kwargs: False,
            ):
                img_files, skipped, sources = _run_images(
                    _config(log_dir),
                    ["resilience:A generated prompt that should be blocked"],
                    output_dir,
                    "1",
                    "test",
                    str(log_dir),
                )

            records = _pipeline_records(log_dir, "resilience")
            self.assertEqual(img_files, ["resilience.png"])
            self.assertEqual(skipped, 0)
            self.assertEqual(sources, {"resilience": "gerada"})
            self.assertEqual(calls["generate"], 1)
            self.assertEqual(records[-1]["result"], "generated_won")
            self.assertEqual(records[-1]["best_real_score"], 20)
            self.assertEqual(records[-1]["generation_policy"], "normal")
            self.assertFalse(records[-1]["paid_generation_blocked_by_guard"])

    def test_concrete_english_card_uses_paid_fallback_when_no_real_image_is_found(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            output_dir = root / "Output"
            log_dir = root / "log"
            output_dir.mkdir()
            log_dir.mkdir()
            (output_dir / "saw.txt").write_text(CARD_TEXT, encoding="utf-8")

            calls = {"generate": 0, "queries": []}

            def search_candidates(query, limit=8):
                calls["queries"].append((query, limit))
                return []

            def generate_one(config, stem, prompt, dest=None):
                calls["generate"] += 1
                _write_fake_image(dest or (output_dir / f"{stem}.png"))
                return True

            with _patched_pipeline(
                search_candidates=search_candidates,
                download_candidate=lambda candidate, dest: False,
                rank_candidates=lambda **kwargs: {},
                generate_one=generate_one,
                should_generate_image=lambda *args, **kwargs: True,
            ):
                img_files, skipped, sources = _run_images(
                    _config(log_dir),
                    ["saw:A fallback generated prompt"],
                    output_dir,
                    "1",
                    "test",
                    str(log_dir),
                )

            records = _pipeline_records(log_dir, "saw")
            self.assertEqual(img_files, ["saw.png"])
            self.assertEqual(skipped, 0)
            self.assertEqual(sources, {"saw": "gerada"})
            self.assertEqual(calls["generate"], 1)
            self.assertGreater(len(calls["queries"]), 0)
            self.assertEqual(records[-1]["result"], "no_real_candidates")
            self.assertEqual(records[-1]["final_source"], "gerada")
            self.assertEqual(records[-1]["generation_policy"], "normal")
            self.assertFalse(records[-1]["paid_generation_blocked_by_guard"])

    def test_concrete_english_card_uses_paid_fallback_when_real_downloads_fail(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            output_dir = root / "Output"
            log_dir = root / "log"
            output_dir.mkdir()
            log_dir.mkdir()
            (output_dir / "saw.txt").write_text(CARD_TEXT, encoding="utf-8")

            calls = {"generate": 0}

            def generate_one(config, stem, prompt, dest=None):
                calls["generate"] += 1
                _write_fake_image(dest or (output_dir / f"{stem}.png"))
                return True

            with _patched_pipeline(
                search_candidates=lambda query, limit=8: [_candidate(query)],
                download_candidate=lambda candidate, dest: False,
                rank_candidates=lambda **kwargs: {},
                generate_one=generate_one,
                should_generate_image=lambda *args, **kwargs: True,
            ):
                img_files, skipped, sources = _run_images(
                    _config(log_dir),
                    ["saw:A fallback generated prompt"],
                    output_dir,
                    "1",
                    "test",
                    str(log_dir),
                )

            records = _pipeline_records(log_dir, "saw")
            self.assertEqual(img_files, ["saw.png"])
            self.assertEqual(skipped, 0)
            self.assertEqual(sources, {"saw": "gerada"})
            self.assertEqual(calls["generate"], 1)
            self.assertEqual(records[-1]["result"], "real_download_failed")
            self.assertEqual(records[-1]["openverse_candidate_count"], 8)
            self.assertEqual(records[-1]["final_source"], "gerada")

    def test_concrete_english_card_uses_paid_fallback_when_real_image_is_weak(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            output_dir = root / "Output"
            log_dir = root / "log"
            output_dir.mkdir()
            log_dir.mkdir()
            (output_dir / "saw.txt").write_text(CARD_TEXT, encoding="utf-8")

            calls = {"generate": 0}

            def rank_candidates(**kwargs):
                if kwargs["mode"] == "real_only":
                    return {
                        "best_index": 0,
                        "best_score": 20,
                        "verdict": "generate_better",
                        "summary": "weak real image",
                        "candidates": [{"index": 0, "score": 20, "reason": "weak"}],
                    }
                return {
                    "best_index": 1,
                    "best_score": 85,
                    "verdict": "keep_generated",
                    "summary": "generated is clearer",
                    "candidates": [
                        {"index": 0, "score": 20, "reason": "weak"},
                        {"index": 1, "score": 85, "reason": "clear"},
                    ],
                }

            def generate_one(config, stem, prompt, dest=None):
                calls["generate"] += 1
                _write_fake_image(dest or (output_dir / f"{stem}.png"))
                return True

            with _patched_pipeline(
                search_candidates=lambda query, limit=8: [_candidate(query)],
                download_candidate=lambda candidate, dest: (_write_fake_image(dest) or True),
                rank_candidates=rank_candidates,
                generate_one=generate_one,
                should_generate_image=lambda *args, **kwargs: True,
            ):
                img_files, skipped, sources = _run_images(
                    _config(log_dir),
                    ["saw:A fallback generated prompt"],
                    output_dir,
                    "1",
                    "test",
                    str(log_dir),
                )

            records = _pipeline_records(log_dir, "saw")
            self.assertEqual(img_files, ["saw.png"])
            self.assertEqual(skipped, 0)
            self.assertEqual(sources, {"saw": "gerada"})
            self.assertEqual(calls["generate"], 1)
            self.assertEqual(records[-1]["result"], "generated_won")
            self.assertEqual(records[-1]["best_real_score"], 20)
            self.assertEqual(records[-1]["generation_policy"], "normal")
            self.assertFalse(records[-1]["paid_generation_blocked_by_guard"])

    def test_invalid_image_format_from_judge_uses_paid_fallback_and_logs_pipeline(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            output_dir = root / "Output"
            log_dir = root / "log"
            output_dir.mkdir()
            log_dir.mkdir()
            (output_dir / "saw.txt").write_text(CARD_TEXT, encoding="utf-8")

            calls = {"generate": 0}

            def rank_candidates(**kwargs):
                if kwargs["mode"] == "real_only":
                    return {
                        "best_index": 0,
                        "best_score": 0,
                        "verdict": "generate_better",
                        "summary": "invalid image format fallback",
                        "candidates": [{"index": 0, "score": 0, "reason": "discarded_after_invalid_image_format"}],
                        "error": "invalid_image_format",
                    }
                return {
                    "best_index": 1,
                    "best_score": 0,
                    "verdict": "keep_generated",
                    "summary": "generated fallback after invalid image format",
                    "candidates": [
                        {"index": 0, "score": 0, "reason": "discarded_after_invalid_image_format"},
                        {"index": 1, "score": 100, "reason": "safe generated fallback"},
                    ],
                    "error": "invalid_image_format",
                }

            def generate_one(config, stem, prompt, dest=None):
                calls["generate"] += 1
                _write_fake_image(dest or (output_dir / f"{stem}.png"))
                return True

            with _patched_pipeline(
                search_candidates=lambda query, limit=8: [_candidate(query)],
                download_candidate=lambda candidate, dest: (_write_fake_image(dest) or True),
                rank_candidates=rank_candidates,
                generate_one=generate_one,
                should_generate_image=lambda *args, **kwargs: True,
            ):
                img_files, skipped, sources = _run_images(
                    _config(log_dir),
                    ["saw:A fallback generated prompt"],
                    output_dir,
                    "1",
                    "test",
                    str(log_dir),
                )

            records = _pipeline_records(log_dir, "saw")
            self.assertEqual(img_files, ["saw.png"])
            self.assertEqual(skipped, 0)
            self.assertEqual(sources, {"saw": "gerada"})
            self.assertEqual(calls["generate"], 1)
            self.assertEqual(records[-1]["result"], "generated_won")
            self.assertEqual(records[-1]["final_source"], "gerada")
            self.assertEqual(records[-1]["judge_error"], "invalid_image_format")
            self.assertEqual(records[-1]["compare_judge_error"], "invalid_image_format")

    def test_english_google_mode_uses_paid_fallback_after_free_search_fails(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            output_dir = root / "Output"
            log_dir = root / "log"
            output_dir.mkdir()
            log_dir.mkdir()
            (output_dir / "saw.txt").write_text(CARD_TEXT, encoding="utf-8")

            calls = {"generate": 0, "queries": []}

            def search_candidates(query, limit=8):
                calls["queries"].append((query, limit))
                return []

            def generate_one(config, stem, prompt, dest=None):
                calls["generate"] += 1
                _write_fake_image(dest or (output_dir / f"{stem}.png"))
                return True

            with _patched_pipeline(
                search_candidates=search_candidates,
                download_candidate=lambda candidate, dest: False,
                rank_candidates=lambda **kwargs: {},
                generate_one=generate_one,
                should_generate_image=lambda *args, **kwargs: True,
            ):
                img_files, skipped, sources = _run_images(
                    _config(log_dir),
                    ["saw:A fallback generated prompt"],
                    output_dir,
                    "1",
                    "test",
                    str(log_dir),
                )

            records = _pipeline_records(log_dir, "saw")
            self.assertEqual(img_files, ["saw.png"])
            self.assertEqual(skipped, 0)
            self.assertEqual(sources, {"saw": "gerada"})
            self.assertEqual(calls["generate"], 1)
            self.assertGreater(len(calls["queries"]), 0)
            self.assertEqual(records[-1]["generation_policy"], "normal")
            self.assertEqual(records[-1]["final_source"], "gerada")

    def test_russian_cards_do_not_call_image_guard(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            output_dir = root / "Output"
            log_dir = root / "log"
            output_dir.mkdir()
            log_dir.mkdir()
            (output_dir / "privet.txt").write_text(CARD_TEXT, encoding="utf-8")

            calls = {"queries": []}

            def search_candidates(query, limit=8):
                calls["queries"].append((query, limit))
                return [_candidate(query)]

            def rank_candidates(**kwargs):
                return {
                    "best_index": 0,
                    "best_score": 60,
                    "verdict": "keep_real",
                    "summary": "usable",
                    "candidates": [{"index": 0, "score": 60, "reason": "usable"}],
                }

            def guard_should_not_run(*args, **kwargs):
                raise AssertionError("RU image flow should not call image_guard")

            with _patched_pipeline(
                search_candidates=search_candidates,
                download_candidate=lambda candidate, dest: (_write_fake_image(dest) or True),
                rank_candidates=rank_candidates,
                generate_one=lambda *args, **kwargs: (_ for _ in ()).throw(
                    AssertionError("good real RU image should not need generation")
                ),
                should_generate_image=guard_should_not_run,
            ):
                img_files, skipped, sources = _run_images(
                    _config(log_dir, lang="ru"),
                    ["privet:A fallback generated prompt"],
                    output_dir,
                    "1",
                    "test",
                    str(log_dir),
                )

            self.assertEqual(img_files, ["privet.png"])
            self.assertEqual(skipped, 0)
            self.assertEqual(sources, {"privet": "real"})
            self.assertGreater(len(calls["queries"]), 0)


if __name__ == "__main__":
    unittest.main()

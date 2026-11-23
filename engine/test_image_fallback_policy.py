import copy
import json
import tempfile
import unittest
from collections import namedtuple
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import generate_images
import google_images
import image_guard
import image_judge
from image_queries import CardToSearch
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


Card = namedtuple("Card", "stem prompt text")
ImagesMade = namedtuple("ImagesMade", "img_files skipped sources")


def _card(stem: str, prompt: str, text: str = CARD_TEXT) -> Card:
    return Card(stem, prompt, text)


@dataclass(frozen=True)
class FakePipeline:
    search_candidates: Callable
    download_candidate: Callable
    rank_candidates: Callable
    generate_one: Callable
    should_generate_image: Callable


_PIPELINE_SEAMS = {
    "search_candidates": google_images,
    "download_candidate": google_images,
    "rank_candidates": image_judge,
    "generate_one": generate_images,
    "should_generate_image": image_guard,
}


@contextmanager
def _patched_pipeline(fake: FakePipeline):
    originals = {name: getattr(module, name) for name, module in _PIPELINE_SEAMS.items()}
    for name, module in _PIPELINE_SEAMS.items():
        setattr(module, name, getattr(fake, name))
    try:
        yield
    finally:
        for name, module in _PIPELINE_SEAMS.items():
            setattr(module, name, originals[name])


def _download_succeeds(candidate, dest):
    return _write_fake_image(dest) or True


def _download_fails(candidate, dest):
    return False


def _guard_sees_concrete(*args, **kwargs):
    return True


def _guard_sees_abstract(*args, **kwargs):
    return False


def _guard_must_not_run(*args, **kwargs):
    raise AssertionError("RU image flow should not call image_guard")


def _judge_always(answer: dict) -> Callable:
    return lambda **kwargs: copy.deepcopy(answer)


def _judge_by_mode(real_only: dict, real_vs_generated: dict) -> Callable:
    return lambda **kwargs: copy.deepcopy(real_only if kwargs["mode"] == "real_only" else real_vs_generated)


def _real_verdict(score: int, summary: str, reason: str) -> dict:
    return {
        "best_index": 0,
        "best_score": score,
        "verdict": "keep_real",
        "summary": summary,
        "candidates": [{"index": 0, "score": score, "reason": reason}],
    }


def _weak_real_verdict(summary: str) -> dict:
    return {
        "best_index": 0,
        "best_score": 20,
        "verdict": "generate_better",
        "summary": summary,
        "candidates": [{"index": 0, "score": 20, "reason": "weak"}],
    }


_GENERATED_IS_CLEARER = {
    "best_index": 1,
    "best_score": 85,
    "verdict": "keep_generated",
    "summary": "generated is clearer",
    "candidates": [
        {"index": 0, "score": 20, "reason": "weak"},
        {"index": 1, "score": 85, "reason": "clear"},
    ],
}

_DISCARDED_AFTER_INVALID_FORMAT = {"index": 0, "score": 0, "reason": "discarded_after_invalid_image_format"}

_INVALID_FORMAT_REAL_ONLY = {
    "best_index": 0,
    "best_score": 0,
    "verdict": "generate_better",
    "summary": "invalid image format fallback",
    "candidates": [_DISCARDED_AFTER_INVALID_FORMAT],
    "error": "invalid_image_format",
}

_INVALID_FORMAT_REAL_VS_GENERATED = {
    "best_index": 1,
    "best_score": 0,
    "verdict": "keep_generated",
    "summary": "generated fallback after invalid image format",
    "candidates": [
        _DISCARDED_AFTER_INVALID_FORMAT,
        {"index": 1, "score": 100, "reason": "safe generated fallback"},
    ],
    "error": "invalid_image_format",
}

_NORMAL_POLICY = {"generation_policy": "normal", "paid_generation_blocked_by_guard": False}
_PAID_WITHOUT_REAL_CANDIDATES = {"result": "no_real_candidates", "final_source": "gerada", **_NORMAL_POLICY}
_GENERATED_WON_OVER_WEAK_REAL = {"result": "generated_won", "best_real_score": 20, **_NORMAL_POLICY}
_PAID_AFTER_DOWNLOADS_FAILED = {"result": "real_download_failed", "openverse_candidate_count": 8, "final_source": "gerada"}
_GENERATED_WON_AFTER_INVALID_FORMAT = {
    "result": "generated_won",
    "final_source": "gerada",
    "judge_error": "invalid_image_format",
    "compare_judge_error": "invalid_image_format",
}


class ImageFallbackPolicyTests(unittest.TestCase):
    def setUp(self):
        workdir = tempfile.TemporaryDirectory()
        self.addCleanup(workdir.cleanup)
        root = Path(workdir.name)
        self.output_dir = root / "Output"
        self.log_dir = root / "log"
        self.output_dir.mkdir()
        self.log_dir.mkdir()
        self.queries = []
        self.generated = 0

    def search_finding_every_query(self, query, limit=8):
        self.queries.append((query, limit))
        return [_candidate(query)]

    def search_finding_nothing(self, query, limit=8):
        self.queries.append((query, limit))
        return []

    def generate(self, config, stem, prompt, dest=None):
        self.generated += 1
        _write_fake_image(dest or (self.output_dir / f"{stem}.png"))
        return True

    def generation_forbidden(self, why: str) -> Callable:
        def generate_one(*args, **kwargs):
            self.generated += 1
            raise AssertionError(why)
        return generate_one

    def photos_found(self, judge: Callable, generate: Callable, guard: Callable) -> FakePipeline:
        return FakePipeline(self.search_finding_every_query, _download_succeeds, judge, generate, guard)

    def good_enough_photo_found(self, verdict: dict, why_not_generate: str, guard: Callable) -> FakePipeline:
        return self.photos_found(_judge_always(verdict), self.generation_forbidden(why_not_generate), guard)

    def nothing_found(self, guard: Callable) -> FakePipeline:
        return FakePipeline(self.search_finding_nothing, _download_fails, _judge_always({}), self.generate, guard)

    def photos_found_but_not_downloaded(self, guard: Callable) -> FakePipeline:
        return FakePipeline(self.search_finding_every_query, _download_fails, _judge_always({}), self.generate, guard)

    def mine(self, card: Card, fake: FakePipeline, lang: str = "en") -> ImagesMade:
        (self.output_dir / f"{card.stem}.txt").write_text(card.text, encoding="utf-8")
        with _patched_pipeline(fake):
            made = _run_images(
                _config(self.log_dir, lang=lang),
                [f"{card.stem}:{card.prompt}"],
                self.output_dir,
                "1",
                "test",
                str(self.log_dir),
            )
        return ImagesMade(*made)

    def assert_real_photo_kept(self, made: ImagesMade, stem: str):
        self.assertEqual(made, ImagesMade([f"{stem}.png"], 0, {stem: "real"}))
        self.assertEqual(self.generated, 0)

    def assert_paid_fallback(self, made: ImagesMade, stem: str):
        self.assertEqual(made, ImagesMade([f"{stem}.png"], 0, {stem: "gerada"}))
        self.assertEqual(self.generated, 1)

    def assert_last_record(self, stem: str, expected: dict):
        last = _pipeline_records(self.log_dir, stem)[-1]
        self.assertEqual({name: last.get(name) for name in expected}, expected)

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
            CardToSearch(card_text, stem="hungry_people", prompt="fallback generated prompt"),
            lang="ru",
            max_queries=3,
        )

        self.assertEqual(queries, ["food", "empty plate", "starving child Africa"])

    def test_russian_hunger_card_sends_high_impact_queries_to_openverse_first(self):
        def search_finding_only_the_starving_child(query, limit=8):
            self.queries.append((query, limit))
            return [_candidate(query)] if query == "starving child Africa" else []

        def judge_of_the_first_query(**kwargs):
            self.assertEqual(kwargs["card"].keyword, "King Arthur character")
            return _real_verdict(78, "strong hunger memory link", "high impact hunger image")

        made = self.mine(_card("vashe_velichestvo", "Fallback prompt", RU_HUNGER_CARD_TEXT), FakePipeline(
            search_finding_only_the_starving_child,
            _download_succeeds,
            judge_of_the_first_query,
            self.generation_forbidden("strong free hunger image should prevent paid generation"),
            _guard_sees_concrete,
        ), lang="ru")

        self.assertEqual([query for query, _ in self.queries[:4]], [
            "King Arthur character",
            "food",
            "empty plate",
            "starving child Africa",
        ])
        self.assert_real_photo_kept(made, "vashe_velichestvo")

    def test_acceptable_real_image_prevents_generation(self):
        made = self.mine(_card("saw", "A fallback generated prompt"), self.good_enough_photo_found(
            _real_verdict(60, "usable mental link", "eye link"),
            "generation should not run for an acceptable real image",
            _guard_sees_concrete,
        ))

        self.assert_real_photo_kept(made, "saw")
        self.assertIn(("eye", 8), self.queries)
        self.assertTrue((self.output_dir / "saw.png").exists())

    def test_abstract_english_card_keeps_good_real_image_without_paid_generation(self):
        made = self.mine(_card("resilience", "A generated prompt that should be blocked"), self.good_enough_photo_found(
            _real_verdict(60, "usable symbol", "clear enough"),
            "good free real images should prevent paid generation",
            _guard_sees_abstract,
        ))

        self.assert_real_photo_kept(made, "resilience")
        self.assertTrue(self.queries)
        self.assert_last_record("resilience", _NORMAL_POLICY)

    def test_abstract_english_card_uses_paid_fallback_when_no_real_image_is_found(self):
        made = self.mine(
            _card("resilience", "A generated prompt that should be blocked"),
            self.nothing_found(_guard_sees_abstract),
        )

        self.assert_paid_fallback(made, "resilience")
        self.assertTrue(self.queries)
        self.assert_last_record("resilience", _PAID_WITHOUT_REAL_CANDIDATES)

    def test_abstract_english_card_uses_paid_fallback_when_real_image_is_rejected(self):
        made = self.mine(_card("resilience", "A generated prompt that should be blocked"), self.photos_found(
            _judge_by_mode(_weak_real_verdict("too abstract"), _GENERATED_IS_CLEARER),
            self.generate,
            _guard_sees_abstract,
        ))

        self.assert_paid_fallback(made, "resilience")
        self.assert_last_record("resilience", _GENERATED_WON_OVER_WEAK_REAL)

    def test_concrete_english_card_uses_paid_fallback_when_no_real_image_is_found(self):
        made = self.mine(_card("saw", "A fallback generated prompt"), self.nothing_found(_guard_sees_concrete))

        self.assert_paid_fallback(made, "saw")
        self.assertTrue(self.queries)
        self.assert_last_record("saw", _PAID_WITHOUT_REAL_CANDIDATES)

    def test_concrete_english_card_uses_paid_fallback_when_real_downloads_fail(self):
        made = self.mine(
            _card("saw", "A fallback generated prompt"),
            self.photos_found_but_not_downloaded(_guard_sees_concrete),
        )

        self.assert_paid_fallback(made, "saw")
        self.assert_last_record("saw", _PAID_AFTER_DOWNLOADS_FAILED)

    def test_concrete_english_card_uses_paid_fallback_when_real_image_is_weak(self):
        made = self.mine(_card("saw", "A fallback generated prompt"), self.photos_found(
            _judge_by_mode(_weak_real_verdict("weak real image"), _GENERATED_IS_CLEARER),
            self.generate,
            _guard_sees_concrete,
        ))

        self.assert_paid_fallback(made, "saw")
        self.assert_last_record("saw", _GENERATED_WON_OVER_WEAK_REAL)

    def test_invalid_image_format_from_judge_uses_paid_fallback_and_logs_pipeline(self):
        made = self.mine(_card("saw", "A fallback generated prompt"), self.photos_found(
            _judge_by_mode(_INVALID_FORMAT_REAL_ONLY, _INVALID_FORMAT_REAL_VS_GENERATED),
            self.generate,
            _guard_sees_concrete,
        ))

        self.assert_paid_fallback(made, "saw")
        self.assert_last_record("saw", _GENERATED_WON_AFTER_INVALID_FORMAT)

    def test_english_google_mode_uses_paid_fallback_after_free_search_fails(self):
        made = self.mine(_card("saw", "A fallback generated prompt"), self.nothing_found(_guard_sees_concrete))

        self.assert_paid_fallback(made, "saw")
        self.assertTrue(self.queries)
        self.assert_last_record("saw", {"generation_policy": "normal", "final_source": "gerada"})

    def test_russian_cards_do_not_call_image_guard(self):
        made = self.mine(_card("privet", "A fallback generated prompt"), self.good_enough_photo_found(
            _real_verdict(60, "usable", "usable"),
            "good real RU image should not need generation",
            _guard_must_not_run,
        ), lang="ru")

        self.assertEqual(made, ImagesMade(["privet.png"], 0, {"privet": "real"}))
        self.assertTrue(self.queries)


if __name__ == "__main__":
    unittest.main()

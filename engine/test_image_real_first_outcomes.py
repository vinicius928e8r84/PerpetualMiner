"""Cada desfecho da “foto real primeiro” (`imageSource` `"1"`), visto de fora: o que `real_first` devolve, de onde veio a
imagem, o arquivo gravado e o registro `image_pipeline` que fica no `costs.jsonl`. As fronteiras (busca no Openverse,
download, juiz, geração) são fakes; o resto é o código real."""

import json
import tempfile
import unittest
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable
from unittest import mock

import generate_images
import google_images
import image_judge
import image_pipeline

CARD_TEXT = """Anki Card
Source Context: Friends - Ross - dinosaur talk
Front: The *bone* is huge.
Back: bone - /bone/
Google Image Search Queries:
1. dinosaur bone
2. fossil
Image: A huge dinosaur bone in a museum, no text.
"""

GENERATED_COST = 0.04
CARD_FIELDS = ("strategy", "result", "final_source", "generated_attempted", "actual_cost_usd", "cost_saved_vs_generated_usd")


def _photos(query, limit=8, **hosts):
    return [{"url": f"mock://{query}/{i}", "query": query} for i in range(2)]


def _judge(real_score, compare=None, real_error=None):
    def rank_candidates(**kwargs):
        if kwargs["mode"] == "real_only":
            return dict({"best_index": 1, "best_score": real_score}, **({"error": real_error} if real_error else {}))
        return compare
    return rank_candidates


def _compare(winner, real_score, generated_score):
    return {"best_index": winner, "candidates": [{"index": 0, "score": real_score}, {"index": 1, "score": generated_score}]}


@dataclass
class Scenario:
    """One card and what each border answers: the card's text on disk, its prompt and policy, the photo search, the
    downloads, the judge and the generation."""
    prompt: str = "a dinosaur bone"
    policy: str = "normal"
    card: bool = True
    search: Callable = _photos
    downloads: bool = True
    judge: Callable = field(default_factory=lambda: _judge(0))
    generates: bool = True
    by_card: bool = False
    lang: str = "en"
    judge_cfg: dict = field(default_factory=dict)

    def config(self, log_dir: Path) -> dict:
        judge = dict({"enabled": True, "real_min_score": 60, "real_skip_generate_score": 90, "generated_win_margin": 5}, **self.judge_cfg)
        return {
            "lang": self.lang,
            "openai": {"image_model": "gpt-image-1", "image_judge_model": "mock-judge"},
            "image_judge": judge,
            "paths": {"log_dir": str(log_dir)},
            "image_records_by_card": self.by_card,
        }

    def download_candidate(self, meta, dest):
        if self.downloads:
            dest.write_bytes((meta.get("url") or meta["thumbnail"]).encode())
        return self.downloads

    def generate_one(self, config, stem, prompt, dest=None):
        if self.generates:
            dest.write_bytes(b"generated")
        return self.generates


@contextmanager
def _borders(scenario: Scenario):
    with mock.patch.object(google_images, "search_candidates", scenario.search), \
            mock.patch.object(google_images, "download_candidate", scenario.download_candidate), \
            mock.patch.object(image_judge, "rank_candidates", scenario.judge), \
            mock.patch.object(generate_images, "generate_one", scenario.generate_one), \
            mock.patch.dict(image_pipeline.cost_tracker.PRICES, {"gpt-image-1": GENERATED_COST}):
        yield


class RealFirstOutcomes(unittest.TestCase):
    def choose(self, scenario: Scenario):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            output_dir, log_dir = root / "Output", root / "log"
            output_dir.mkdir()
            log_dir.mkdir()
            if scenario.card:
                (output_dir / "bone.txt").write_text(CARD_TEXT, encoding="utf-8")
            dest = output_dir / "bone.png"
            with _borders(scenario):
                pipeline = image_pipeline.build(scenario.config(log_dir), output_dir, "1", "test", str(log_dir))
                returned = pipeline.real_first("bone", scenario.prompt, dest, generation_policy=scenario.policy)
            saved = dest.read_bytes() if dest.exists() else None
            lines = (log_dir / "costs.jsonl").read_text(encoding="utf-8").splitlines()
            records = [json.loads(line) for line in lines if json.loads(line)["type"] == "image_pipeline"]
            return returned, pipeline.img_sources, saved, records

    def outcome(self, scenario: Scenario):
        returned, sources, saved, records = self.choose(scenario)
        record, = records
        return (returned, sources, saved) + tuple(record.get(name) for name in CARD_FIELDS)

    def test_a_photo_at_the_skip_score_is_kept_before_any_generation(self):
        self.assertEqual(
            self.outcome(Scenario(judge=_judge(90))),
            (True, {"bone": "real"}, b"mock://dinosaur bone/1", "multi_query_visual", "real_won_before_generation", "real", False, 0.0, GENERATED_COST),
        )

    def test_a_photo_at_the_minimum_is_accepted_before_any_generation(self):
        self.assertEqual(
            self.outcome(Scenario(judge=_judge(60))),
            (True, {"bone": "real"}, b"mock://dinosaur bone/1", "aggressive_real_first", "real_accepted_before_generation", "real", False, 0.0, GENERATED_COST),
        )

    def test_with_the_judge_off_the_first_downloaded_photo_is_kept(self):
        self.assertEqual(
            self.outcome(Scenario(judge_cfg={"enabled": False})),
            (True, {"bone": "real"}, b"mock://dinosaur bone/0", "multi_query_visual", "judge_disabled", "real", False, 0.0, GENERATED_COST),
        )

    def test_a_generated_image_that_wins_by_the_margin_is_kept(self):
        self.assertEqual(
            self.outcome(Scenario(judge=_judge(30, _compare(1, 50, 80)))),
            (True, {"bone": "gerada"}, b"generated", "multi_query_visual", "generated_won", "gerada", True, GENERATED_COST, 0.0),
        )

    def test_a_generated_image_that_wins_by_exactly_the_margin_is_kept(self):
        self.assertEqual(
            self.outcome(Scenario(judge=_judge(30, _compare(1, 60, 65)))),
            (True, {"bone": "gerada"}, b"generated", "multi_query_visual", "generated_won", "gerada", True, GENERATED_COST, 0.0),
        )

    def test_a_photo_that_reaches_the_minimum_in_the_comparison_is_kept(self):
        self.assertEqual(
            self.outcome(Scenario(judge=_judge(30, _compare(1, 60, 64)))),
            (True, {"bone": "real"}, b"mock://dinosaur bone/1", "multi_query_visual", "real_won_after_compare", "real", True, 0.0, GENERATED_COST),
        )

    def test_after_the_comparison_the_record_keeps_the_scores_the_judge_compared(self):
        _, _, _, (record,) = self.choose(Scenario(judge=_judge(30, _compare(1, 60, 64))))
        self.assertEqual((record["best_real_score"], record["generated_score"]), (60, 64))

    def test_a_weak_photo_that_loses_the_comparison_gives_way_to_the_generated_image(self):
        self.assertEqual(
            self.outcome(Scenario(judge=_judge(30, _compare(0, 40, 42)))),
            (True, {"bone": "gerada"}, b"generated", "multi_query_visual", "generated_defaulted", "gerada", True, GENERATED_COST, 0.0),
        )

    def test_a_failed_generation_after_a_weak_photo_leaves_the_card_without_an_image(self):
        self.assertEqual(
            self.outcome(Scenario(judge=_judge(30), generates=False)),
            (False, {}, None, "multi_query_visual", "generation_failed_real_too_weak", "none", True, 0.0, 0.0),
        )

    def test_without_a_prompt_a_weak_photo_leaves_the_card_without_an_image(self):
        self.assertEqual(
            self.outcome(Scenario(judge=_judge(30), prompt="")),
            (False, {}, None, "multi_query_visual", "no_generation_prompt_and_real_too_weak", "none", False, 0.0, 0.0),
        )

    def test_free_only_skips_a_weak_photo_without_paying(self):
        returned, sources, saved, (record,) = self.choose(Scenario(judge=_judge(30), policy="free_only"))
        self.assertEqual(
            (returned, sources, saved, record["result"], record["skip_reason"], record["cost_saved_vs_generated_usd"], record["generation_policy"]),
            (False, {}, None, "skipped_real_not_found", "real_too_weak", GENERATED_COST, "free_only"),
        )

    def test_free_only_skips_a_card_with_no_photo_without_paying(self):
        returned, sources, saved, (record,) = self.choose(Scenario(search=lambda query, limit=8: [], policy="free_only"))
        self.assertEqual(
            (returned, sources, saved, record["result"], record["skip_reason"], record["final_source"], record["generated_attempted"]),
            (False, {}, None, "skipped_real_not_found", "no_real_candidates", "skipped", False),
        )

    def test_free_only_with_nothing_to_search_records_that_there_was_no_query(self):
        returned, sources, saved, (record,) = self.choose(Scenario(card=False, prompt="", policy="free_only", lang="ru"))
        self.assertEqual(
            (returned, saved, record["result"], record["query_count"], record["cost_saved_vs_generated_usd"]),
            (False, None, "skipped_no_real_queries", 0, 0.0),
        )

    def test_without_a_prompt_and_without_photos_nothing_is_generated(self):
        self.assertEqual(
            self.outcome(Scenario(search=lambda query, limit=8: [], prompt="")),
            (False, {}, None, "multi_query_visual", "no_real_candidates", "none", False, 0.0, 0.0),
        )

    def test_a_failed_generation_without_photos_is_recorded_as_such(self):
        self.assertEqual(
            self.outcome(Scenario(downloads=False, generates=False)),
            (False, {}, None, "multi_query_visual", "real_download_failed_generation_failed", "none", True, 0.0, 0.0),
        )

    def test_the_search_stops_at_the_total_candidate_limit_and_skips_repeated_photos(self):
        def search(query, limit=8):
            return [{"url": "mock://same"}, {"thumbnail": f"mock://{query}"}, {"url": ""}]

        _, _, _, (record,) = self.choose(Scenario(search=search, judge=_judge(95), judge_cfg={"real_total_candidate_limit": 4}))
        self.assertEqual(
            (record["openverse_candidate_count"], [(stats["query"], stats["raw_candidates"], stats["unique_candidates"]) for stats in record["query_stats"]]),
            (4, [("dinosaur bone", 3, 2), ("fossil", 3, 1), ("A huge dinosaur bone in a museum, no text", 3, 1)]),
        )

    def test_the_card_queries_are_searched_in_order_up_to_the_maximum(self):
        searched = []

        def search(query, limit=8):
            searched.append((query, limit))
            return []

        self.choose(Scenario(search=search, judge_cfg={"max_queries": 3, "real_candidate_limit": 5}))
        self.assertEqual(searched, [("dinosaur bone", 5), ("fossil", 5), ("A huge dinosaur bone in a museum, no text", 5)])

    def test_the_judge_sees_the_card_and_the_judge_errors_are_recorded(self):
        seen = []

        def rank_candidates(**kwargs):
            card, judge = kwargs["card"], kwargs["judge"]
            seen.append((kwargs["mode"], card.keyword, card.phrase, card.context, judge.model, len(kwargs["candidates"])))
            return _judge(30, dict(_compare(1, 40, 90), error="timeout"), real_error="invalid_image_format")(**kwargs)

        _, _, _, (record,) = self.choose(Scenario(judge=rank_candidates))
        self.assertEqual(
            (seen, record["judge_error"], record["compare_judge_error"], record["best_real_query"], record["generated_score"]),
            ([("real_only", "dinosaur bone", "The bone is huge.", "Friends - Ross - dinosaur talk", "mock-judge", 16),
              ("real_vs_generated", "dinosaur bone", "The bone is huge.", "Friends - Ross - dinosaur talk", "mock-judge", 2)],
             "invalid_image_format", "timeout", "dinosaur bone", 90),
        )

    def test_records_by_card_keep_no_search_text(self):
        _, _, _, (record,) = self.choose(Scenario(judge=_judge(95), by_card=True))
        self.assertEqual([name for name in image_pipeline.QUERY_FIELDS if name in record], [])


if __name__ == "__main__":
    unittest.main()

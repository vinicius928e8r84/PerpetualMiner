"""
image_real_first.py - The "real photo first" choice of a card's picture (Openverse candidates, GPT-vision judge,
generated image as the fallback), cut out of `image_pipeline.py` to keep each file small. Nothing here is called
directly: `ImagePipeline.real_first` hands `RealFirst` the run's pipeline, the card and its generation policy, and
`choose` walks the steps (search, download, judge, compare with a generated image), writing one `image_pipeline` record.
"""

import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

if __package__:  # inside the Anki add-on the engine is the package `complemento.motor`
    from . import generate_images, google_images, image_judge
    from .image_queries import _card_phrase_and_context_from_text
else:
    import generate_images
    import google_images
    import image_judge
    from image_queries import _card_phrase_and_context_from_text


@dataclass(frozen=True)
class Card:
    """The card whose picture is chosen: its stem (the file name and the cost record's keyword), the prompt of its
    generated image ("" when the card has none) and where the picture is written."""
    stem: str
    prompt: str
    dest: Path


@dataclass(frozen=True)
class GenerationPolicy:
    """Whether the card may pay for a generated image: "normal" may, "free_only" keeps a real photo or nothing."""
    name: str = "normal"
    paid_generation_blocked_by_guard: bool = False

    @property
    def free_only(self) -> bool:
        return self.name == "free_only"

    def fields(self) -> dict:
        return {"generation_policy": self.name, "paid_generation_blocked_by_guard": self.paid_generation_blocked_by_guard}


@dataclass(frozen=True)
class Outcome:
    """How the choice ended, as the record names it: where the picture came from ("real", "gerada", "skipped" or
    "none"), why, and whether a generated image was asked for."""
    final_source: str
    result: str
    generated_attempted: bool
    strategy: str = "multi_query_visual"
    skip_reason: Optional[str] = None


@dataclass
class RealFirst:
    """One card's "real photo first" choice. The steps fill the state the record reports: the queries searched, the
    candidates collected and downloaded, the judge's best photo and the errors the judge returned."""
    pipeline: object
    card: Card
    policy: GenerationPolicy
    card_text: str = field(init=False)
    phrase: str = field(init=False)
    context: str = field(init=False)
    keyword: str = field(init=False)
    queries: list = field(init=False)
    query_stats: list = field(init=False, default_factory=list)
    collected: list = field(init=False, default_factory=list)
    seen_urls: set = field(init=False, default_factory=set)
    real_candidates: list = field(init=False, default_factory=list)
    best_real: Optional[dict] = field(init=False, default=None)
    best_real_score: int = field(init=False, default=0)
    min_real_score: int = field(init=False, default=0)
    judge_errors: dict = field(init=False, default_factory=dict)

    def __post_init__(self):
        self.card_text = self.pipeline.card_content(self.card)
        self.phrase, self.context = _card_phrase_and_context_from_text(self.card_text)
        self.keyword = self.pipeline.visual_subject(self.card)
        self.queries = self.pipeline.search_queries(self.card)

    def choose(self) -> bool:
        """True when the card got a picture (a real photo or a generated image) at `card.dest`."""
        if self.policy.free_only and not self.queries:
            return self._leave_without_image(Outcome("skipped", "skipped_no_real_queries", False), {"best_real_score": 0})
        self._search()
        if not self.collected:
            return self._without_real("no_real_candidates")
        with tempfile.TemporaryDirectory(prefix="anki_imgjudge_") as tmpdir:
            return self._choose_among_downloads(Path(tmpdir))

    def _search(self) -> None:
        for query in self.queries:
            raw_candidates = google_images.search_candidates(
                query, limit=self.pipeline.real_candidate_limit, **self.pipeline.openverse_hosts,
            )
            unique_for_query = self._collect(raw_candidates)
            self.query_stats.append({"query": query, "raw_candidates": len(raw_candidates), "unique_candidates": unique_for_query})
            if self._search_is_full():
                break

    def _search_is_full(self) -> bool:
        return len(self.collected) >= self.pipeline.real_total_candidate_limit

    def _collect(self, raw_candidates: list) -> int:
        added = 0
        for meta in raw_candidates:
            if self._search_is_full():
                break
            url = meta.get("url") or meta.get("thumbnail")
            if not url or url in self.seen_urls:
                continue
            self.seen_urls.add(url)
            self.collected.append(meta)
            added += 1
        return added

    def _choose_among_downloads(self, tmpdir: Path) -> bool:
        self.real_candidates = self._download(tmpdir)
        if not self.real_candidates:
            return self._without_real("real_download_failed")
        if not self.pipeline.judge_enabled:
            return self._keep_real(Outcome("real", "judge_disabled", False))
        self._rank_the_photos()
        judge_cfg = self.pipeline.judge_cfg
        skip_generate_score = int(judge_cfg.get("real_skip_generate_score", 88))
        self.min_real_score = int(judge_cfg.get("real_min_score", 74))
        if self.best_real_score >= skip_generate_score:
            return self._keep_real(Outcome("real", "real_won_before_generation", False), self._ranked_scores())
        if self.best_real_score >= self.min_real_score:
            return self._keep_real(Outcome("real", "real_accepted_before_generation", False, "aggressive_real_first"), self._ranked_scores())
        return self._the_best_photo_is_weak(tmpdir / "generated.png")

    def _download(self, tmpdir: Path) -> list:
        downloaded = []
        for idx, meta in enumerate(self.collected):
            tmp_path = tmpdir / f"real_{idx}.png"
            if google_images.download_candidate(meta, tmp_path):
                downloaded.append({"path": str(tmp_path), "meta": {**meta, "kind": "real"}})
        return downloaded

    def _ask_the_judge(self, candidates: list, mode: str) -> dict:
        card = image_judge.CardForTheJudge(self.keyword, self.phrase, self.context, self.card_text)
        judge = image_judge.TheJudge(
            **self.pipeline.judge_extra(self.card),
            model=self.pipeline.config["openai"].get("image_judge_model", "gpt-4.1-mini"),
            log_dir=self.pipeline.log_dir,
        )
        return image_judge.rank_candidates(card=card, judge=judge, candidates=candidates, mode=mode)

    def _rank_the_photos(self) -> None:
        real_rank = self._ask_the_judge(self.real_candidates, "real_only")
        best_real_idx = max(0, min(int(real_rank.get("best_index", 0)), len(self.real_candidates) - 1))
        self.best_real_score = int(real_rank.get("best_score", 0) or 0)
        self.best_real = self.real_candidates[best_real_idx]
        if real_rank.get("error"):
            self.judge_errors["judge_error"] = real_rank["error"]

    def _ranked_scores(self) -> dict:
        return {"best_real_query": self.best_real["meta"].get("query", ""), "best_real_score": self.best_real_score}

    def _the_best_photo_is_weak(self, gen_path: Path) -> bool:
        if self.policy.free_only:
            outcome = Outcome("skipped", "skipped_real_not_found", False, skip_reason="real_too_weak")
            return self._leave_without_image(outcome, self._ranked_scores())
        if not self.card.prompt:
            return self._leave_without_image(Outcome("none", "no_generation_prompt_and_real_too_weak", False), self._ranked_scores())
        if not generate_images.generate_one(self.pipeline.config, self.card.stem, self.card.prompt, dest=gen_path):
            return self._leave_without_image(Outcome("none", "generation_failed_real_too_weak", True), self._ranked_scores())
        return self._compare_with_the_generated_image(gen_path)

    def _compare_with_the_generated_image(self, gen_path: Path) -> bool:
        compare = self._ask_the_judge([
            {"path": self.best_real["path"], "meta": {**self.best_real["meta"], "kind": "real-final"}},
            {"path": str(gen_path), "meta": {"source": "openai", "query": self.card.prompt, "kind": "generated"}},
        ], "real_vs_generated")
        if compare.get("error"):
            self.judge_errors["compare_judge_error"] = compare["error"]
        winner = int(compare.get("best_index", 0) or 0)
        scores = {item.get("index"): int(item.get("score", 0) or 0) for item in compare.get("candidates", [])}
        gen_score, real_score = scores.get(1, 0), scores.get(0, self.best_real_score)
        margin = int(self.pipeline.judge_cfg.get("generated_win_margin", 4))
        if winner == 1 and gen_score >= real_score + margin:
            return self._keep_generated(gen_path, Outcome("gerada", "generated_won", True), dict(self._ranked_scores(), generated_score=gen_score))
        compared = dict(self._ranked_scores(), best_real_score=real_score, generated_score=gen_score)
        if real_score >= self.min_real_score:
            return self._keep_real(Outcome("real", "real_won_after_compare", True), compared)
        return self._keep_generated(gen_path, Outcome("gerada", "generated_defaulted", True), compared)

    def _without_real(self, reason: str) -> bool:
        """No real photo to judge (none found, or none downloaded): free_only skips, otherwise the generated image."""
        if self.policy.free_only:
            outcome = Outcome("skipped", "skipped_real_not_found", False, skip_reason=reason)
            return self._leave_without_image(outcome, {"best_real_query": "", "best_real_score": 0})
        if not self.card.prompt:
            return self._leave_without_image(Outcome("none", reason, False))
        if not generate_images.generate_one(self.pipeline.config, self.card.stem, self.card.prompt, dest=self.card.dest):
            return self._leave_without_image(Outcome("none", f"{reason}_generation_failed", True))
        self.pipeline.count_generated(self.card)
        self._record(Outcome("gerada", reason, True))
        return True

    def _photo_to_keep(self) -> str:
        """The judge's best photo, or the first one downloaded when the judge is off."""
        return (self.best_real or self.real_candidates[0])["path"]

    def _keep_real(self, outcome: Outcome, scores: Optional[dict] = None) -> bool:
        self.pipeline.save_real(self._photo_to_keep(), self.card)
        self._record(outcome, scores)
        return True

    def _keep_generated(self, gen_path: Path, outcome: Outcome, scores: dict) -> bool:
        self.pipeline.save_generated(gen_path, self.card)
        self._record(outcome, scores)
        return True

    def _leave_without_image(self, outcome: Outcome, scores: Optional[dict] = None) -> bool:
        self._record(outcome, scores)
        return False

    def _costs(self, final_source: str) -> dict:
        """What the choice paid and what it saved against paying for a generated image."""
        cost = self.pipeline.generated_image_cost
        paid = cost if final_source == "gerada" else 0.0
        saved = {"real": cost, "skipped": cost if self.card.prompt else 0.0}.get(final_source, 0.0)
        return {"actual_cost_usd": paid, "cost_saved_vs_generated_usd": saved}

    def _record(self, outcome: Outcome, scores: Optional[dict] = None) -> None:
        fields = {
            "strategy": outcome.strategy,
            "query_count": len(self.queries),
            "queries": self.queries,
            "query_stats": self.query_stats,
            "openverse_candidate_count": len(self.collected),
            "unique_real_candidates": len(self.real_candidates),
            **(scores or {}),
            "final_source": outcome.final_source,
            "result": outcome.result,
        }
        if outcome.skip_reason:
            fields["skip_reason"] = outcome.skip_reason
        fields["generated_attempted"] = outcome.generated_attempted
        fields.update(self._costs(outcome.final_source), **self.judge_errors, **self.policy.fields())
        self.pipeline.record_pipeline(self.card, fields)

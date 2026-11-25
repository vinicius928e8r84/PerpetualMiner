from dataclasses import dataclass, field
from pathlib import Path

if __package__:
    from . import cost_tracker, generate_images, image_guard
    from .image_queries import CardToSearch, _build_card_google_queries, _english_query_variants_from_text, _visual_subject_for_card
    from .image_real_first import Card, GenerationPolicy, RealFirst
else:
    import cost_tracker
    import generate_images
    import image_guard
    from image_queries import CardToSearch, _build_card_google_queries, _english_query_variants_from_text, _visual_subject_for_card
    from image_real_first import Card, GenerationPolicy, RealFirst

QUERY_FIELDS = ("queries", "query_stats", "best_real_query")

DIRECT_OUTCOMES = {
    "skipped": ("skipped", "abstract_guard", False),
    "ok": ("gerada", "generated_direct", True),
    "failed": ("none", "generation_failed", True),
}


def _judge_limit(judge_cfg: dict, name: str, default: int) -> int:
    return int(judge_cfg.get(name, default) or default)


@dataclass
class ImagePipeline:
    config: dict
    output_dir: Path
    img_source: str
    pela_chave: object
    log_dir: str
    img_sources: dict = field(default_factory=dict, init=False)

    def __post_init__(self):
        config = self.config
        self.by_card = bool(config.get("image_records_by_card"))
        self.openverse_hosts = {"openverse_base": config["openverse_base"]} if config.get("openverse_base") else {}
        self.judge_cfg = config.get("image_judge", {})
        self.judge_enabled = bool(self.judge_cfg.get("enabled", True) and self.img_source == "1")
        self.image_model = config["openai"]["image_model"]
        self.generated_image_cost = float(cost_tracker.PRICES.get(self.image_model, 0.040))
        self.real_candidate_limit = _judge_limit(self.judge_cfg, "real_candidate_limit", 8)
        self.real_total_candidate_limit = _judge_limit(self.judge_cfg, "real_total_candidate_limit", 24)
        self.max_queries = _judge_limit(self.judge_cfg, "max_queries", 8)
        self.guard_enabled = config.get("lang") != "ru"

    def real_first(self, stem: str, prompt: str, dest: Path, generation_policy: str = "normal") -> bool:
        return RealFirst(self, Card(stem, prompt, dest), GenerationPolicy(generation_policy)).choose()

    def generate_direct(self, stem: str, prompt: str, dest: Path) -> str:
        card = Card(stem, prompt, dest)
        outcome = self._generate_if_wanted(card)
        final_source, result, attempted = DIRECT_OUTCOMES[outcome]
        self.record_pipeline(card, {
            "strategy": "direct_generation",
            "final_source": final_source,
            "result": result,
            "generated_attempted": attempted,
            "actual_cost_usd": self.generated_image_cost if final_source == "gerada" else 0.0,
            "cost_saved_vs_generated_usd": 0.0,
            **GenerationPolicy().fields(),
        })
        return outcome

    def _generate_if_wanted(self, card: Card) -> str:
        if not self.wants_image(card):
            return "skipped"
        if not generate_images.generate_one(self.config, card.stem, card.prompt, dest=card.dest):
            return "failed"
        self.count_generated(card)
        return "ok"

    def guard_extra(self, card: Card) -> dict:
        return {"label": card.stem} if self.by_card else {}

    def judge_extra(self, card: Card) -> dict:
        return dict(self.guard_extra(card), juiz=self.config.get("juiz_da_imagem"))

    def card_content(self, card: Card) -> str:
        card_path = self.output_dir / f"{card.stem}.txt"
        if not card_path.exists():
            return ""
        try:
            return card_path.read_text(encoding="utf-8")
        except Exception:
            return ""

    def search_queries(self, card: Card) -> list:
        queries = _build_card_google_queries(
            CardToSearch(self.card_content(card), stem=card.stem, prompt=card.prompt),
            lang=self.config.get("lang", "en"),
            max_queries=self.max_queries,
        )
        if queries or not card.prompt:
            return queries
        return _english_query_variants_from_text(card.prompt)[:self.max_queries]

    def visual_subject(self, card: Card) -> str:
        return _visual_subject_for_card(self.card_content(card), card.stem, card.prompt)

    def wants_image(self, card: Card) -> bool:
        if not self.guard_enabled:
            return True
        return image_guard.should_generate_image(self.visual_subject(card), self.pela_chave, self.log_dir, **self.guard_extra(card))

    def save_real(self, photo: str, card: Card) -> None:
        card.dest.write_bytes(Path(photo).read_bytes())
        cost_tracker.record_image(self.log_dir, model="google_images", source="google", keyword=card.stem)
        self.img_sources[card.stem.lower()] = "real"

    def save_generated(self, generated: Path, card: Card) -> None:
        card.dest.write_bytes(generated.read_bytes())
        self.count_generated(card)

    def count_generated(self, card: Card) -> None:
        cost_tracker.record_image(self.log_dir, model=self.image_model, source="dalle", keyword=card.stem)
        self.img_sources[card.stem.lower()] = "gerada"

    def record_pipeline(self, card: Card, fields: dict) -> None:
        if self.by_card:
            fields = {name: value for name, value in fields.items() if name not in QUERY_FIELDS}
        cost_tracker.record_image_pipeline(self.log_dir, keyword=card.stem, **fields)


build = ImagePipeline

"""
image_pipeline.py - How the pipeline gets a card's picture: the real photo the judge likes, or an image generated from
the card's prompt. The same code runs in the bridge (`start._run_images`) and inside the Anki add-on (`complemento/imagem_do_cartao.py`):
standard library only, no output of its own. `build` returns the functions that do one card; `image_real_first.py` has
the "real photo first" one.

Two optional keys of `config` are for the add-on: `openai_base` / `openverse_base` (where the requests go; the bridge uses the
real addresses) and `image_records_by_card` (the cost records name the card by its stem and keep no search text, because they stay
on disk after the Frases are erased).
"""

import re
from pathlib import Path
from types import SimpleNamespace

if __package__:  # inside the Anki add-on the engine is the package `complemento.motor`
    from . import cost_tracker, generate_images, image_guard
    from .image_queries import (
        _build_card_google_queries, _card_phrase_and_context_from_text, _visual_subject_for_card,
    )
    from .image_real_first import criar as criar_real_first
else:
    import cost_tracker
    import generate_images
    import image_guard
    from image_queries import _build_card_google_queries, _card_phrase_and_context_from_text, _visual_subject_for_card
    from image_real_first import criar as criar_real_first

QUERY_FIELDS = ("queries", "query_stats", "best_real_query")


def build(config, output_dir, img_source, api_key, log_dir):
    """The pipeline for one run: `real_first(stem, prompt, dest)`, `generate_direct(stem, prompt, dest)` and `img_sources`
    (`{stem: "real" | "gerada"}`, filled as the pictures are chosen). The card's text is read from `output_dir/{stem}.txt`."""
    img_sources: dict[str, str] = {}
    by_card = bool(config.get("image_records_by_card"))
    openverse_hosts = {"openverse_base": config["openverse_base"]} if config.get("openverse_base") else {}
    openai_host = {"openai_base": config["openai_base"]} if config.get("openai_base") else {}

    def guard_extra(stem: str) -> dict:
        return dict(openai_host, label=stem) if by_card else dict(openai_host)

    def judge_extra(stem: str) -> dict:  # the judge alone goes through the ChatGPT plan when there is one; the guard and the generation use the key
        return dict(guard_extra(stem), plano=config["plano_do_chatgpt"]) if config.get("plano_do_chatgpt") else guard_extra(stem)

    stopwords = {
        "a", "an", "the", "and", "or", "but", "with", "without", "for", "from",
        "into", "onto", "over", "under", "near", "beside", "behind", "inside",
        "outside", "through", "across", "against", "between", "among", "in",
        "on", "at", "of", "to", "by", "as", "is", "are", "was", "were", "be",
        "being", "been", "this", "that", "these", "those", "their", "them",
        "they", "he", "she", "his", "her", "its", "it", "someone", "person",
        "people", "man", "woman", "standing", "sitting", "looking", "wearing",
        "holding", "showing", "appearing", "scene", "setting", "simple",
        "room", "cartoon", "realistic", "photo", "image", "background", "text",
        "like", "if", "while", "as_if",
    }
    judge_cfg = config.get("image_judge", {})
    judge_enabled = bool(judge_cfg.get("enabled", True) and img_source == "1")
    image_model = config["openai"]["image_model"]
    generated_image_cost = float(cost_tracker.PRICES.get(image_model, 0.040))
    real_candidate_limit = int(judge_cfg.get("real_candidate_limit", 8) or 8)
    real_total_candidate_limit = int(judge_cfg.get("real_total_candidate_limit", 24) or 24)
    max_queries = int(judge_cfg.get("max_queries", 8) or 8)

    def _normalize_query(query: str) -> str:
        query = re.sub(r"^[\-\u2013\u2014]\s*", "", query.strip())
        query = re.sub(r"[*_`]+", " ", query)
        query = re.sub(r"\s+", " ", query)
        return query.strip(" .,!?:;\"'()[]{}")

    def _content_terms(query: str) -> list[str]:
        clean = _normalize_query(query)
        if not clean:
            return []
        words = re.sub(r"[^A-Za-z0-9\s]", " ", clean).lower()
        words = re.sub(r"\s+", " ", words).strip().split()
        terms = [w for w in words if len(w) > 2 and w not in stopwords]
        deduped: list[str] = []
        seen: set[str] = set()
        for term in terms:
            if term not in seen:
                deduped.append(term)
                seen.add(term)
        return deduped

    def _english_query_variants(query: str) -> list[str]:
        clean = _normalize_query(query)
        if not clean:
            return []

        variants = [clean]
        no_punct = re.sub(r"[^A-Za-z0-9\s]", " ", clean)
        no_punct = re.sub(r"\s+", " ", no_punct).strip()
        if no_punct and no_punct.casefold() != clean.casefold():
            variants.append(no_punct)

        words = [w for w in no_punct.split() if len(w) > 2]
        if len(words) >= 2:
            for size in (4, 3, 2):
                if len(words) >= size:
                    for i in range(len(words) - size + 1):
                        variants.append(" ".join(words[i:i + size]))
        content_words = _content_terms(clean)
        if content_words:
            variants.append(" ".join(content_words[:2]))
            variants.append(" ".join(content_words[:3]))
            variants.append(" ".join(content_words[:4]))
            if len(content_words) >= 2:
                variants.append(f"{content_words[0]} {content_words[-1]}")
        if words:
            variants.append(" ".join(sorted(words, key=len, reverse=True)[:3]))
        if len(words) > 5:
            variants.append(" ".join(words[:5]))
        if len(words) > 6:
            variants.append(" ".join(words[:4]))
            variants.append(" ".join(words[-4:]))

        deduped: list[str] = []
        seen: set[str] = set()
        for variant in variants:
            key = variant.casefold()
            if variant and key not in seen:
                deduped.append(variant)
                seen.add(key)
        return deduped

    def _card_content(stem: str) -> str:
        card_path = output_dir / f"{stem}.txt"
        if not card_path.exists():
            return ""
        try:
            return card_path.read_text(encoding="utf-8")
        except Exception:
            return ""

    def _field_value(content: str, pattern: str) -> str:
        match = re.search(pattern, content, re.IGNORECASE)
        if not match:
            return ""
        return match.group(1).strip().rstrip("*").strip()

    def _card_google_queries(stem: str, prompt: str) -> list[str]:
        content = _card_content(stem)
        return _build_card_google_queries(
            content,
            stem=stem,
            prompt=prompt,
            lang=config.get("lang", "en"),
            max_queries=max_queries,
        )

    def _visual_subject(stem: str, prompt: str) -> str:
        content = _card_content(stem)
        return _visual_subject_for_card(content, stem, prompt)

    def _card_phrase_and_context(content: str) -> tuple[str, str]:
        return _card_phrase_and_context_from_text(content)

    def _record_pipeline(stem: str, **fields) -> None:
        if by_card:
            for name in QUERY_FIELDS:
                fields.pop(name, None)
        fields.setdefault("generation_policy", "normal")
        fields.setdefault("paid_generation_blocked_by_guard", False)
        cost_tracker.record_image_pipeline(log_dir, keyword=stem, **fields)

    def _policy_fields(generation_policy: str, paid_generation_blocked_by_guard: bool) -> dict:
        return {
            "generation_policy": generation_policy,
            "paid_generation_blocked_by_guard": paid_generation_blocked_by_guard,
        }

    guard_enabled = config.get("lang") != "ru"

    def _wants_image(stem: str, prompt: str) -> bool:
        if not guard_enabled:
            return True
        return image_guard.should_generate_image(_visual_subject(stem, prompt), api_key, log_dir, **guard_extra(stem))

    def _save_real(best_path: str, stem: str, dest: Path) -> bool:
        dest.write_bytes(Path(best_path).read_bytes())
        cost_tracker.record_image(log_dir, model="google_images", source="google", keyword=stem)
        img_sources[stem.lower()] = "real"
        return True

    def _save_generated(gen_path: Path, stem: str, dest: Path) -> bool:
        dest.write_bytes(gen_path.read_bytes())
        cost_tracker.record_image(log_dir, model=image_model, source="dalle", keyword=stem)
        img_sources[stem.lower()] = "gerada"
        return True

    def _generate_without_real(
        stem: str,
        prompt: str,
        dest: Path,
        queries: list[str],
        reason: str,
        query_stats: list[dict],
        generation_policy: str = "normal",
        paid_generation_blocked_by_guard: bool = False,
        openverse_candidate_count: int = 0,
        best_real_score: int = 0,
        best_real_query: str = "",
    ) -> bool:
        policy_fields = _policy_fields(generation_policy, paid_generation_blocked_by_guard)
        if generation_policy == "free_only":
            _record_pipeline(
                stem,
                strategy="multi_query_visual",
                query_count=len(queries),
                queries=queries,
                query_stats=query_stats,
                openverse_candidate_count=openverse_candidate_count,
                unique_real_candidates=0,
                best_real_query=best_real_query,
                best_real_score=best_real_score,
                final_source="skipped",
                result="skipped_real_not_found",
                skip_reason=reason,
                generated_attempted=False,
                actual_cost_usd=0.0,
                cost_saved_vs_generated_usd=generated_image_cost if prompt else 0.0,
                **policy_fields,
            )
            return False

        if not prompt:
            _record_pipeline(
                stem,
                strategy="multi_query_visual",
                query_count=len(queries),
                queries=queries,
                query_stats=query_stats,
                openverse_candidate_count=openverse_candidate_count,
                unique_real_candidates=0,
                final_source="none",
                result=reason,
                generated_attempted=False,
                actual_cost_usd=0.0,
                cost_saved_vs_generated_usd=0.0,
                **policy_fields,
            )
            return False

        if not generate_images.generate_one(config, stem, prompt, dest=dest):
            _record_pipeline(
                stem,
                strategy="multi_query_visual",
                query_count=len(queries),
                queries=queries,
                query_stats=query_stats,
                openverse_candidate_count=openverse_candidate_count,
                unique_real_candidates=0,
                final_source="none",
                result=f"{reason}_generation_failed",
                generated_attempted=True,
                actual_cost_usd=0.0,
                cost_saved_vs_generated_usd=0.0,
                **policy_fields,
            )
            return False

        cost_tracker.record_image(log_dir, model=image_model, source="dalle", keyword=stem)
        img_sources[stem.lower()] = "gerada"
        _record_pipeline(
            stem,
            strategy="multi_query_visual",
            query_count=len(queries),
            queries=queries,
            query_stats=query_stats,
            openverse_candidate_count=openverse_candidate_count,
            unique_real_candidates=0,
            final_source="gerada",
            result=reason,
            generated_attempted=True,
            actual_cost_usd=generated_image_cost,
            cost_saved_vs_generated_usd=0.0,
            **policy_fields,
        )
        return True

    def generate_direct(stem: str, prompt: str, dest: Path) -> str:
        """Generated image only (no search): "skipped" (the guard says it is abstract), "ok" or "failed"."""
        if not _wants_image(stem, prompt):
            _record_pipeline(
                stem,
                strategy="direct_generation",
                final_source="skipped",
                result="abstract_guard",
                generated_attempted=False,
                actual_cost_usd=0.0,
                cost_saved_vs_generated_usd=0.0,
            )
            return "skipped"
        if generate_images.generate_one(config, stem, prompt, dest=dest):
            cost_tracker.record_image(log_dir, model=image_model, source="dalle", keyword=stem)
            img_sources[stem.lower()] = "gerada"
            _record_pipeline(
                stem,
                strategy="direct_generation",
                final_source="gerada",
                result="generated_direct",
                generated_attempted=True,
                actual_cost_usd=generated_image_cost,
                cost_saved_vs_generated_usd=0.0,
            )
            return "ok"
        _record_pipeline(
            stem,
            strategy="direct_generation",
            final_source="none",
            result="generation_failed",
            generated_attempted=True,
            actual_cost_usd=0.0,
            cost_saved_vs_generated_usd=0.0,
        )
        return "failed"

    pipeline = SimpleNamespace(
        config=config, api_key=api_key, log_dir=log_dir, judge_cfg=judge_cfg, judge_enabled=judge_enabled, max_queries=max_queries,
        generated_image_cost=generated_image_cost, real_candidate_limit=real_candidate_limit,
        real_total_candidate_limit=real_total_candidate_limit, openverse_hosts=openverse_hosts, judge_extra=judge_extra,
        card_content=_card_content, card_phrase_and_context=_card_phrase_and_context, visual_subject=_visual_subject,
        card_google_queries=_card_google_queries, english_query_variants=_english_query_variants, record_pipeline=_record_pipeline,
        policy_fields=_policy_fields, save_real=_save_real, save_generated=_save_generated, generate_without_real=_generate_without_real,
    )
    return SimpleNamespace(
        real_first=criar_real_first(pipeline), generate_direct=generate_direct, img_sources=img_sources,
        judge_enabled=judge_enabled, generated_image_cost=generated_image_cost,
    )

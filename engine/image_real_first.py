"""
image_real_first.py - The "real photo first" choice of a card's picture (Openverse candidates, GPT-vision judge,
generated image as the fallback), cut out of `image_pipeline.py` to keep each file small. Nothing here is called
directly: `image_pipeline.build` hands `criar` the pipeline's context and gets the function that does one card.
"""

import tempfile
from pathlib import Path

if __package__:  # inside the Anki add-on the engine is the package `complemento.motor`
    from . import generate_images, google_images, image_judge
else:
    import generate_images
    import google_images
    import image_judge


def criar(c):
    """The function that chooses one card's picture: `c` is the pipeline's context (see `image_pipeline.build`)."""
    config, api_key, log_dir, judge_cfg, judge_enabled = c.config, c.api_key, c.log_dir, c.judge_cfg, c.judge_enabled
    max_queries, generated_image_cost = c.max_queries, c.generated_image_cost
    real_candidate_limit, real_total_candidate_limit = c.real_candidate_limit, c.real_total_candidate_limit
    openverse_hosts, judge_extra = c.openverse_hosts, c.judge_extra
    _card_content, _card_phrase_and_context, _visual_subject = c.card_content, c.card_phrase_and_context, c.visual_subject
    _card_google_queries, _english_query_variants = c.card_google_queries, c.english_query_variants
    _record_pipeline, _policy_fields = c.record_pipeline, c.policy_fields
    _save_real, _save_generated, _generate_without_real = c.save_real, c.save_generated, c.generate_without_real

    def _score_real_candidates(
        stem: str,
        prompt: str,
        dest: Path,
        generation_policy: str = "normal",
        paid_generation_blocked_by_guard: bool = False,
    ) -> bool:
        policy_fields = _policy_fields(generation_policy, paid_generation_blocked_by_guard)
        card_text = _card_content(stem)
        phrase, context = _card_phrase_and_context(card_text)
        keyword = _visual_subject(stem, prompt)
        queries = _card_google_queries(stem, prompt)
        if not queries:
            queries = _english_query_variants(prompt)[:max_queries] if prompt else []
        if generation_policy == "free_only" and not queries:
            _record_pipeline(
                stem,
                strategy="multi_query_visual",
                query_count=0,
                queries=[],
                query_stats=[],
                openverse_candidate_count=0,
                unique_real_candidates=0,
                best_real_score=0,
                final_source="skipped",
                result="skipped_no_real_queries",
                generated_attempted=False,
                actual_cost_usd=0.0,
                cost_saved_vs_generated_usd=generated_image_cost if prompt else 0.0,
                **policy_fields,
            )
            return False

        collected: list[dict] = []
        seen_urls: set[str] = set()
        query_stats: list[dict] = []

        for query in queries:
            raw_candidates = google_images.search_candidates(query, limit=real_candidate_limit, **openverse_hosts)
            unique_for_query = 0
            for meta in raw_candidates:
                if len(collected) >= real_total_candidate_limit:
                    break
                url = meta.get("url") or meta.get("thumbnail")
                if not url or url in seen_urls:
                    continue
                seen_urls.add(url)
                collected.append(meta)
                unique_for_query += 1
            query_stats.append({
                "query": query,
                "raw_candidates": len(raw_candidates),
                "unique_candidates": unique_for_query,
            })
            if len(collected) >= real_total_candidate_limit:
                break

        if not collected:
            return _generate_without_real(
                stem,
                prompt,
                dest,
                queries,
                "no_real_candidates",
                query_stats,
                generation_policy,
                paid_generation_blocked_by_guard,
                openverse_candidate_count=0,
            )

        with tempfile.TemporaryDirectory(prefix="anki_imgjudge_") as tmpdir:
            real_candidates: list[dict] = []
            for idx, meta in enumerate(collected):
                tmp_path = Path(tmpdir) / f"real_{idx}.png"
                if not google_images.download_candidate(meta, tmp_path):
                    continue
                real_candidates.append({"path": str(tmp_path), "meta": {**meta, "kind": "real"}})

            if not real_candidates:
                return _generate_without_real(
                    stem,
                    prompt,
                    dest,
                    queries,
                    "real_download_failed",
                    query_stats,
                    generation_policy,
                    paid_generation_blocked_by_guard,
                    openverse_candidate_count=len(collected),
                )

            if not judge_enabled:
                ok = _save_real(real_candidates[0]["path"], stem, dest)
                if ok:
                    _record_pipeline(
                        stem,
                        strategy="multi_query_visual",
                        query_count=len(queries),
                        queries=queries,
                        query_stats=query_stats,
                        openverse_candidate_count=len(collected),
                        unique_real_candidates=len(real_candidates),
                        final_source="real",
                        result="judge_disabled",
                        generated_attempted=False,
                        actual_cost_usd=0.0,
                        cost_saved_vs_generated_usd=generated_image_cost,
                        **policy_fields,
                    )
                return ok

            real_rank = image_judge.rank_candidates(
                **judge_extra(stem),
                api_key=api_key,
                model=config["openai"].get("image_judge_model", "gpt-4.1-mini"),
                log_dir=log_dir,
                keyword=keyword,
                phrase=phrase,
                context=context,
                card_text=card_text,
                candidates=real_candidates,
                mode="real_only",
            )
            best_real_idx = max(0, min(int(real_rank.get("best_index", 0)), len(real_candidates) - 1))
            best_real_score = int(real_rank.get("best_score", 0) or 0)
            best_real = real_candidates[best_real_idx]
            best_real_query = best_real["meta"].get("query", "")
            real_judge_fields = {"judge_error": real_rank["error"]} if real_rank.get("error") else {}
            skip_generate_score = int(judge_cfg.get("real_skip_generate_score", 88))
            min_real_score = int(judge_cfg.get("real_min_score", 74))

            if best_real_score >= skip_generate_score:
                ok = _save_real(best_real["path"], stem, dest)
                if ok:
                    _record_pipeline(
                        stem,
                        strategy="multi_query_visual",
                        query_count=len(queries),
                        queries=queries,
                        query_stats=query_stats,
                        openverse_candidate_count=len(collected),
                        unique_real_candidates=len(real_candidates),
                        best_real_query=best_real_query,
                        best_real_score=best_real_score,
                        final_source="real",
                        result="real_won_before_generation",
                        generated_attempted=False,
                        actual_cost_usd=0.0,
                        cost_saved_vs_generated_usd=generated_image_cost,
                        **real_judge_fields,
                        **policy_fields,
                    )
                return ok

            if best_real_score >= min_real_score:
                ok = _save_real(best_real["path"], stem, dest)
                if ok:
                    _record_pipeline(
                        stem,
                        strategy="aggressive_real_first",
                        query_count=len(queries),
                        queries=queries,
                        query_stats=query_stats,
                        openverse_candidate_count=len(collected),
                        unique_real_candidates=len(real_candidates),
                        best_real_query=best_real_query,
                        best_real_score=best_real_score,
                        final_source="real",
                        result="real_accepted_before_generation",
                        generated_attempted=False,
                        actual_cost_usd=0.0,
                        cost_saved_vs_generated_usd=generated_image_cost,
                        **real_judge_fields,
                        **policy_fields,
                    )
                return ok

            if generation_policy == "free_only":
                _record_pipeline(
                    stem,
                    strategy="multi_query_visual",
                    query_count=len(queries),
                    queries=queries,
                    query_stats=query_stats,
                    openverse_candidate_count=len(collected),
                    unique_real_candidates=len(real_candidates),
                    best_real_query=best_real_query,
                    best_real_score=best_real_score,
                    final_source="skipped",
                    result="skipped_real_not_found",
                    skip_reason="real_too_weak",
                    generated_attempted=False,
                    actual_cost_usd=0.0,
                    cost_saved_vs_generated_usd=generated_image_cost if prompt else 0.0,
                    **real_judge_fields,
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
                    openverse_candidate_count=len(collected),
                    unique_real_candidates=len(real_candidates),
                    best_real_query=best_real_query,
                    best_real_score=best_real_score,
                    final_source="none",
                    result="no_generation_prompt_and_real_too_weak",
                    generated_attempted=False,
                    actual_cost_usd=0.0,
                    cost_saved_vs_generated_usd=0.0,
                    **real_judge_fields,
                    **policy_fields,
                )
                return False

            gen_path = Path(tmpdir) / "generated.png"
            if not generate_images.generate_one(config, stem, prompt, dest=gen_path):
                if best_real_score >= min_real_score:
                    ok = _save_real(best_real["path"], stem, dest)
                    if ok:
                        _record_pipeline(
                            stem,
                            strategy="multi_query_visual",
                            query_count=len(queries),
                            queries=queries,
                            query_stats=query_stats,
                            openverse_candidate_count=len(collected),
                            unique_real_candidates=len(real_candidates),
                            best_real_query=best_real_query,
                            best_real_score=best_real_score,
                            final_source="real",
                            result="generation_failed_real_kept",
                            generated_attempted=True,
                            actual_cost_usd=0.0,
                            cost_saved_vs_generated_usd=generated_image_cost,
                            **real_judge_fields,
                            **policy_fields,
                        )
                    return ok
                _record_pipeline(
                    stem,
                    strategy="multi_query_visual",
                    query_count=len(queries),
                    queries=queries,
                    query_stats=query_stats,
                    openverse_candidate_count=len(collected),
                    unique_real_candidates=len(real_candidates),
                    best_real_query=best_real_query,
                    best_real_score=best_real_score,
                    final_source="none",
                    result="generation_failed_real_too_weak",
                    generated_attempted=True,
                    actual_cost_usd=0.0,
                    cost_saved_vs_generated_usd=0.0,
                    **real_judge_fields,
                    **policy_fields,
                )
                return False

            compare = image_judge.rank_candidates(
                **judge_extra(stem),
                api_key=api_key,
                model=config["openai"].get("image_judge_model", "gpt-4.1-mini"),
                log_dir=log_dir,
                keyword=keyword,
                phrase=phrase,
                context=context,
                card_text=card_text,
                candidates=[
                    {"path": best_real["path"], "meta": {**best_real["meta"], "kind": "real-final"}},
                    {"path": str(gen_path), "meta": {"source": "openai", "query": prompt, "kind": "generated"}},
                ],
                mode="real_vs_generated",
            )
            compare_judge_fields = {"compare_judge_error": compare["error"]} if compare.get("error") else {}
            winner = int(compare.get("best_index", 0) or 0)
            scores = {item.get("index"): int(item.get("score", 0) or 0) for item in compare.get("candidates", [])}
            gen_score = scores.get(1, 0)
            real_score = scores.get(0, best_real_score)
            judge_fields = {**real_judge_fields, **compare_judge_fields}
            margin = int(judge_cfg.get("generated_win_margin", 4))

            if winner == 1 and gen_score >= real_score + margin:
                ok = _save_generated(gen_path, stem, dest)
                if ok:
                    _record_pipeline(
                        stem,
                        strategy="multi_query_visual",
                        query_count=len(queries),
                        queries=queries,
                        query_stats=query_stats,
                        openverse_candidate_count=len(collected),
                        unique_real_candidates=len(real_candidates),
                        best_real_query=best_real_query,
                        best_real_score=best_real_score,
                        generated_score=gen_score,
                        final_source="gerada",
                        result="generated_won",
                        generated_attempted=True,
                        actual_cost_usd=generated_image_cost,
                        cost_saved_vs_generated_usd=0.0,
                        **judge_fields,
                        **policy_fields,
                    )
                return ok

            if real_score >= min_real_score:
                ok = _save_real(best_real["path"], stem, dest)
                if ok:
                    _record_pipeline(
                        stem,
                        strategy="multi_query_visual",
                        query_count=len(queries),
                        queries=queries,
                        query_stats=query_stats,
                        openverse_candidate_count=len(collected),
                        unique_real_candidates=len(real_candidates),
                        best_real_query=best_real_query,
                        best_real_score=real_score,
                        generated_score=gen_score,
                        final_source="real",
                        result="real_won_after_compare",
                        generated_attempted=True,
                        actual_cost_usd=0.0,
                        cost_saved_vs_generated_usd=generated_image_cost,
                        **judge_fields,
                        **policy_fields,
                    )
                return ok

            ok = _save_generated(gen_path, stem, dest)
            if ok:
                _record_pipeline(
                    stem,
                    strategy="multi_query_visual",
                    query_count=len(queries),
                    queries=queries,
                    query_stats=query_stats,
                    openverse_candidate_count=len(collected),
                    unique_real_candidates=len(real_candidates),
                    best_real_query=best_real_query,
                    best_real_score=real_score,
                    generated_score=gen_score,
                    final_source="gerada",
                    result="generated_defaulted",
                    generated_attempted=True,
                    actual_cost_usd=generated_image_cost,
                    cost_saved_vs_generated_usd=0.0,
                    **judge_fields,
                    **policy_fields,
                )
            return ok

    return _score_real_candidates

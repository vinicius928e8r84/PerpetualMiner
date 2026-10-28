from __future__ import annotations

import base64
import json
import logging
from pathlib import Path
from typing import Any

if __package__:  # inside the Anki add-on the engine is the package `complemento.motor`
    from . import cost_tracker, openai_http
    from .image_utils import UnsupportedImageFormatError, supported_image_mime
else:
    import cost_tracker
    import openai_http
    from image_utils import UnsupportedImageFormatError, supported_image_mime


LOGGER = logging.getLogger("perpetualminer.motor")

_SYSTEM = """You are an expert visual selector for low-cost Anki flashcards.

Your job is to pick the real image that creates a usable memory link for the
target keyword inside the exact phrase/context. AI image generation is an
expensive fallback, so a natural real photo should win whenever it has a clear
mental association with the keyword, phrase, translation, or gist.

Scoring priorities:
1. Reward any clear mental link: literal keyword, phrase sense, simple symbol,
   common object, facial expression, human action, or broad scene association.
2. Prefer concrete and easy-to-grasp images over exact scene recreation. For
   "I saw", an eye, a person looking, or a witness can be a strong real image.
3. Reward high-impact images for hunger, poverty, starvation, or suffering when
   that is the main meaning of the card and the image creates a strong memory
   link.
4. Do not require the image to recreate the literal fictional setting. A direct
   symbol or human situation can beat a generic palace, street, village, or
   costume scene.
5. The image does not need to match every detail of the card. It only needs to
   help the learner remember the word or phrase without being misleading.
6. Penalize images with visible text, watermarks, low resolution, confusing collage,
   bad crops, or weak subject focus.
7. Give scores below 55 only when the image is unrelated, confusing, misleading,
   unusable, or too poor technically. Scores 55+ mean the real image is usable.
8. In real_vs_generated mode, choose the generated image only if the real image
   has no useful mental link or is technically unusable.

Return strict JSON with this shape:
{
  "best_index": 0,
  "best_score": 0,
  "verdict": "keep_real" | "generate_better" | "keep_generated",
  "summary": "short reason",
  "candidates": [
    {"index": 0, "score": 0, "reason": "short reason"}
  ]
}
Scores are integers from 0 to 100.
"""


def _record_cost(log_dir: str, model: str, usage: dict, keyword: str) -> None:
    if not usage:
        return
    cost_tracker.record_tokens(
        log_dir,
        model=model,
        input_tokens=usage.get("prompt_tokens") or 0,
        output_tokens=usage.get("completion_tokens") or 0,
        keyword=keyword,
    )


def _image_data_url(path: Path) -> str:
    data = path.read_bytes()
    mime = supported_image_mime(data)
    raw = base64.b64encode(data).decode("ascii")
    return f"data:{mime};base64,{raw}"


def _card_brief(card_text: str) -> str:
    lines = [line.strip() for line in (card_text or "").splitlines() if line.strip()]
    keep: list[str] = []
    in_query_block = False
    for line in lines:
        low = line.lower()
        if low.startswith("google image search queries:") or low.startswith("image search queries:"):
            in_query_block = True
            continue
        if in_query_block:
            if ":" in line and not line[:1].isdigit():
                in_query_block = False
            else:
                continue
        if low.startswith("image:") or low.startswith("google image search:") or low.startswith("image search query:"):
            continue
        keep.append(line)
    return "\n".join(keep[:12])


def _invalid_image_format_fallback(mode: str, valid_index_map: list[int]) -> dict[str, Any]:
    best_index = valid_index_map[0] if valid_index_map else 0
    if mode != "real_only" and valid_index_map:
        best_index = valid_index_map[-1]
    return {
        "best_index": best_index,
        "best_score": 0,
        "verdict": "generate_better" if mode == "real_only" else "keep_generated",
        "summary": "OpenAI rejected one or more image candidates as invalid_image_format; candidates discarded.",
        "candidates": [
            {
                "index": original_idx,
                "score": 0,
                "reason": "discarded_after_invalid_image_format",
            }
            for original_idx in valid_index_map
        ],
        "error": "invalid_image_format",
    }


def rank_candidates(
    *,
    api_key: str,
    model: str,
    log_dir: str,
    keyword: str,
    phrase: str,
    context: str,
    card_text: str,
    candidates: list[dict[str, Any]],
    mode: str,
    openai_base: str = openai_http.OPENAI_BASE,
    label: str | None = None,
) -> dict[str, Any]:
    """`label` is what the cost record says the call was for (the keyword by default; the add-on passes the card's id)."""
    content: list[dict[str, Any]] = [{
        "type": "text",
        "text": (
            f"Mode: {mode}\n"
            f"Keyword: {keyword}\n"
            f"Phrase: {phrase}\n"
            f"Context: {context or 'None'}\n"
            f"Card brief:\n{_card_brief(card_text)}\n\n"
            "Evaluate all candidates. The best image is the one that would help a learner"
            " instantly remember the keyword inside this specific card."
        ),
    }]

    valid_index_map: list[int] = []
    for original_idx, candidate in enumerate(candidates):
        try:
            data_url = _image_data_url(Path(candidate["path"]))
        except (KeyError, OSError, UnsupportedImageFormatError):
            continue
        idx = len(valid_index_map)
        valid_index_map.append(original_idx)
        meta = candidate.get("meta", {})
        content.append({
            "type": "text",
            "text": (
                f"Candidate {idx}\n"
                f"source={meta.get('source', '')}\n"
                f"query={meta.get('query', '')}\n"
                f"title={meta.get('title', '')}\n"
                f"creator={meta.get('creator', '')}\n"
                f"kind={meta.get('kind', '')}"
            ),
        })
        content.append({
            "type": "image_url",
            "image_url": {"url": data_url},
        })

    if not valid_index_map:
        return {
            "best_index": 0,
            "best_score": 0,
            "verdict": "generate_better" if mode == "real_only" else "keep_generated",
            "summary": "No supported image candidates.",
            "candidates": [],
        }

    try:
        raw, usage = openai_http.completar(
            openai_base,
            api_key,
            model,
            [
                {"role": "system", "content": _SYSTEM},
                {"role": "user", "content": content},
            ],
            temperatura=0,
            formato_json=True,
            repeticoes=openai_http.REPETICOES_DA_IMAGEM,
        )
    except openai_http.ErroDaOpenAI as exc:
        if exc.codigo != openai_http.IMAGEM_INVALIDA:
            raise
        LOGGER.warning(
            "image_judge invalid_image_format keyword=%s mode=%s candidates=%s",
            label or keyword,
            mode,
            len(valid_index_map),
        )
        return _invalid_image_format_fallback(mode, valid_index_map)
    _record_cost(log_dir, model, usage, f"[image_judge] {label or keyword}")

    try:
        data = json.loads(raw)
    except Exception:
        data = {}

    data.setdefault("best_index", 0)
    data.setdefault("best_score", 0)
    data.setdefault("verdict", "keep_real" if mode == "real_only" else "keep_generated")
    data.setdefault("summary", raw.strip()[:300] or "No summary.")
    data.setdefault("candidates", [])
    try:
        compact_idx = max(0, min(int(data.get("best_index", 0)), len(valid_index_map) - 1))
        data["best_index"] = valid_index_map[compact_idx]
    except Exception:
        data["best_index"] = valid_index_map[0]
    return data

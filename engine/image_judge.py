from __future__ import annotations

import base64
import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

if __package__:  # inside the Anki add-on the engine is the package `complemento.motor`
    from . import cost_tracker, provedores
    from .image_utils import UnsupportedImageFormatError, supported_image_mime
else:
    import cost_tracker
    import provedores
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
    cost_tracker.record_tokens(log_dir, cost_tracker.TokenUsage(model, usage.get("entrada", 0), usage.get("saida", 0)), keyword=keyword)


def _image_data_url(path: Path) -> str:
    data = path.read_bytes()
    mime = supported_image_mime(data)
    raw = base64.b64encode(data).decode("ascii")
    return f"data:{mime};base64,{raw}"


_QUERY_BLOCK_HEADINGS = ("google image search queries:", "image search queries:")
_IMAGE_LINES = ("image:", "google image search:", "image search query:")


def _card_brief(card_text: str) -> str:
    keep: list[str] = []
    in_query_block = False
    for line in _filled_lines(card_text):
        low = line.lower()
        if low.startswith(_QUERY_BLOCK_HEADINGS):
            in_query_block = True
            continue
        in_query_block = in_query_block and not _ends_the_query_block(line)
        if not in_query_block and not low.startswith(_IMAGE_LINES):
            keep.append(line)
    return "\n".join(keep[:12])


def _filled_lines(card_text: str) -> list[str]:
    return [line.strip() for line in (card_text or "").splitlines() if line.strip()]


def _ends_the_query_block(line: str) -> bool:
    return ":" in line and not line[:1].isdigit()


def _verdict_without_a_usable_photo(mode: str) -> str:
    return "generate_better" if mode == "real_only" else "keep_generated"


def _no_supported_candidates(mode: str) -> dict[str, Any]:
    return {
        "best_index": 0,
        "best_score": 0,
        "verdict": _verdict_without_a_usable_photo(mode),
        "summary": "No supported image candidates.",
        "candidates": [],
    }


def _invalid_image_format_fallback(mode: str, valid_index_map: list[int]) -> dict[str, Any]:
    best_index = valid_index_map[0] if valid_index_map else 0
    if mode != "real_only" and valid_index_map:
        best_index = valid_index_map[-1]
    return {
        "best_index": best_index,
        "best_score": 0,
        "verdict": _verdict_without_a_usable_photo(mode),
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
    juiz,
    model: str,
    log_dir: str,
    keyword: str,
    phrase: str,
    context: str,
    card_text: str,
    candidates: list[dict[str, Any]],
    mode: str,
    label: str | None = None,
) -> dict[str, Any]:
    """`juiz` asks the verdict: `juiz.julgar(model, system, content, label)` -> (the JSON text, the usage, whether the key paid it). In the
    add-on it is the IA dos cartões' `JuizDaImagem` (the ChatGPT plan, or the key's `model`); the engine never sees who pays nor the secret.
    `label` is what the cost record says the call was for (the keyword by default; the add-on passes the card's id); only the key's verdict
    has a cost record."""
    card_part = _CardForTheJudge(keyword, phrase, context, card_text).part(mode)
    photos = _PhotosForTheJudge(candidates)
    if not photos.valid_index_map:
        return _no_supported_candidates(mode)
    judging = _Judging(juiz, model, mode, label or keyword)
    return judging.verdict([card_part] + photos.content, photos.valid_index_map, log_dir)


@dataclass
class _CardForTheJudge:
    keyword: str
    phrase: str
    context: str
    card_text: str

    def part(self, mode: str) -> dict[str, Any]:
        return {
            "type": "text",
            "text": (
                f"Mode: {mode}\n"
                f"Keyword: {self.keyword}\n"
                f"Phrase: {self.phrase}\n"
                f"Context: {self.context or 'None'}\n"
                f"Card brief:\n{_card_brief(self.card_text)}\n\n"
                "Evaluate all candidates. The best image is the one that would help a learner"
                " instantly remember the keyword inside this specific card."
            ),
        }


class _PhotosForTheJudge:
    def __init__(self, candidates: list[dict[str, Any]]):
        self.content: list[dict[str, Any]] = []
        self.valid_index_map: list[int] = []
        for original_idx, candidate in enumerate(candidates):
            data_url = _readable_data_url(candidate)
            if data_url is not None:
                self.content += _candidate_parts(len(self.valid_index_map), candidate.get("meta", {}), data_url)
                self.valid_index_map.append(original_idx)


def _readable_data_url(candidate: dict[str, Any]) -> str | None:
    try:
        return _image_data_url(Path(candidate["path"]))
    except (KeyError, OSError, UnsupportedImageFormatError):
        return None


def _candidate_parts(idx: int, meta: dict[str, Any], data_url: str) -> list[dict[str, Any]]:
    return [
        {
            "type": "text",
            "text": (
                f"Candidate {idx}\n"
                f"source={meta.get('source', '')}\n"
                f"query={meta.get('query', '')}\n"
                f"title={meta.get('title', '')}\n"
                f"creator={meta.get('creator', '')}\n"
                f"kind={meta.get('kind', '')}"
            ),
        },
        {
            "type": "image_url",
            "image_url": {"url": data_url},
        },
    ]


@dataclass
class _Judging:
    juiz: Any
    model: str
    mode: str
    label: str

    def verdict(self, content: list[dict[str, Any]], valid_index_map: list[int], log_dir: str) -> dict[str, Any]:
        try:
            raw, usage, pela_chave = self.juiz.julgar(self.model, _SYSTEM, content, self.label)
        except provedores.ErroDoProvedor as exc:
            if exc.codigo != provedores.IMAGEM_INVALIDA:
                raise
            LOGGER.warning(
                "image_judge invalid_image_format keyword=%s mode=%s candidates=%s",
                self.label,
                self.mode,
                len(valid_index_map),
            )
            return _invalid_image_format_fallback(self.mode, valid_index_map)
        if pela_chave:
            _record_cost(log_dir, self.model, usage, f"[image_judge] {self.label}")
        return _parsed_verdict(raw, self.mode, valid_index_map)


def _parsed_verdict(raw: str, mode: str, valid_index_map: list[int]) -> dict[str, Any]:
    try:
        data = json.loads(raw)
    except Exception:
        data = {}

    data.setdefault("best_index", 0)
    data.setdefault("best_score", 0)
    data.setdefault("verdict", "keep_real" if mode == "real_only" else "keep_generated")
    data.setdefault("summary", raw.strip()[:300] or "No summary.")
    data.setdefault("candidates", [])
    data["best_index"] = _original_index(data, valid_index_map)
    return data


def _original_index(data: dict[str, Any], valid_index_map: list[int]) -> int:
    try:
        compact_idx = max(0, min(int(data.get("best_index", 0)), len(valid_index_map) - 1))
        return valid_index_map[compact_idx]
    except Exception:
        return valid_index_map[0]

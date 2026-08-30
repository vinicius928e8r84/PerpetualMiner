"""
parser.py — Rich mining.txt parser for PerpetualMiner.

Supported format:
    keyword1 | keyword2 | keyword3 : phrase [Context: Source - Title - Detail]

Backward-compatible with the original format:
    keyword: phrase
"""

import hashlib
import re
from dataclasses import dataclass
from typing import Optional, List
from pathlib import Path


def safe_filename(text: str) -> str:
    """Return a Windows/Linux-safe lowercase filename stem.

    Strips bracket content (e.g. [Context: ...]), lowercases,
    converts spaces to underscores, and removes reserved characters.
    Hyphens that are part of the word (e.g. do-gooders) are preserved.
    """
    # Remove bracket pairs and their content (e.g. "[Context: ...]")
    stem = re.sub(r'\[.*?\]', '', text).strip()
    # If the entire text was wrapped in brackets, just strip the bracket chars
    if not stem:
        stem = re.sub(r'[\[\]]', '', text).strip()
    # Lowercase
    stem = stem.lower()
    # Spaces → underscore
    stem = re.sub(r'\s+', '_', stem)
    # Strip Windows-reserved and bracket chars (keep hyphens)
    stem = re.sub(r'[<>:"/\\|?*\[\]]+', '', stem)
    # Collapse consecutive underscores; strip leading/trailing _ and -
    stem = re.sub(r'_+', '_', stem).strip('_-')
    return stem


def normalize_ru_phrase(text: str) -> str:
    """Normalize a Russian phrase for identity/duplicate checks."""
    text = re.sub(r"\s*\[(?:Context|Contexto):.*?\]\s*$", "", text, flags=re.IGNORECASE).strip()
    text = re.sub(r"\s*\[[^\]]+\]\s*$", "", text).strip()
    text = text.replace("ё", "е").replace("Ё", "Е")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def stable_phrase_stem(text: str, prefix_words: int = 6, hash_len: int = 10) -> str:
    """Build a readable, stable filename stem from the full phrase."""
    normalized = normalize_ru_phrase(text)
    compact = safe_filename(normalized)
    if not compact:
        compact = "card"

    words = compact.split("_")
    prefix = "_".join(words[:prefix_words]) if words else compact
    digest = hashlib.sha1(normalized.encode("utf-8")).hexdigest()[:hash_len]
    return f"{prefix}__{digest}".strip("_")


@dataclass
class MiningEntry:
    keywords: List[str]   # All keywords (split by |)
    phrase: str           # Original phrase
    context_source: Optional[str] = None
    context_title: Optional[str] = None
    context_detail: Optional[str] = None
    file_stem: Optional[str] = None

    @property
    def primary_keyword(self) -> str:
        return self.keywords[0]

    @property
    def has_context(self) -> bool:
        return any([self.context_source, self.context_title, self.context_detail])

    @property
    def context_str(self) -> str:
        parts = [p for p in [self.context_source, self.context_title, self.context_detail] if p]
        return " - ".join(parts)


@dataclass
class CardJob:
    """One card to be generated - one per keyword in a MiningEntry."""
    keyword: str
    phrase: str         # Original phrase, or an AI instruction for secondary keywords
    is_generated: bool  # True = AI must invent a new sentence
    entry: MiningEntry
    file_stem: Optional[str] = None

    @property
    def filename_stem(self) -> str:
        return self.file_stem or self.entry.file_stem or safe_filename(self.keyword)


def build_card_stem(keyword: str, phrase: str, hash_len: int = 8) -> str:
    """Build a stable per-card stem so repeated keywords do not collide."""
    keyword_part = safe_filename(keyword) or "card"
    normalized_phrase = re.sub(r"\s+", " ", phrase or "").strip()
    digest = hashlib.sha1(f"{keyword}\n{normalized_phrase}".encode("utf-8")).hexdigest()[:hash_len]
    return f"{keyword_part}__{digest}"


def get_card_jobs(entry: MiningEntry) -> List[CardJob]:
    """Expand a MiningEntry into one CardJob per keyword.

    - keywords[0] → original phrase, keyword highlighted
    - keywords[1..N] → AI instruction to create a new sentence
    """
    jobs: List[CardJob] = []
    for i, keyword in enumerate(entry.keywords):
        if i == 0:
            jobs.append(CardJob(
                keyword=keyword,
                phrase=entry.phrase,
                is_generated=False,
                entry=entry,
                file_stem=entry.file_stem or build_card_stem(keyword, entry.phrase),
            ))
        else:
            context_hint = f" Context: {entry.context_str}." if entry.has_context else ""
            instruction = (
                f"Write a new example sentence using the word or phrase '{keyword}'."
                f"{context_hint}"
                f" (Original sentence for reference: \"{entry.phrase}\")"
            )
            jobs.append(CardJob(
                keyword=keyword,
                phrase=instruction,
                is_generated=True,
                entry=entry,
                file_stem=entry.file_stem or build_card_stem(keyword, entry.phrase),
            ))
    return jobs


def parse_mining_file(path: Path) -> List[MiningEntry]:
    """Parse mining.txt into a list of MiningEntry objects.

    Supports:
        kw1 | kw2 : phrase [Context: Source - Title - Detail]
        keyword: phrase                          (legacy format)
    """
    entries: List[MiningEntry] = []
    with open(path, "r", encoding="utf-8") as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line:
                continue

            # Extract optional [Context: ...] / [Contexto: ...] block
            context_source = context_title = context_detail = None
            ctx_match = re.search(r'\[(?:Context|Contexto):\s*(.*?)\]', line, re.IGNORECASE)
            if ctx_match:
                ctx_parts = [p.strip() for p in ctx_match.group(1).split(" - ")]
                context_source = ctx_parts[0] if len(ctx_parts) > 0 else None
                context_title  = ctx_parts[1] if len(ctx_parts) > 1 else None
                context_detail = ctx_parts[2] if len(ctx_parts) > 2 else None
                line = line[:ctx_match.start()].strip()

            if ":" not in line:
                continue

            keywords_raw, phrase = line.split(":", 1)
            phrase = phrase.strip()
            keywords = [kw.strip() for kw in keywords_raw.split("|") if kw.strip()]

            if not keywords or not phrase:
                continue

            entries.append(MiningEntry(
                keywords=keywords,
                phrase=phrase,
                context_source=context_source,
                context_title=context_title,
                context_detail=context_detail,
            ))
    return entries


def parse_mining_file_ru(path: Path) -> List[MiningEntry]:
    """Russian parser: each non-empty line is a full phrase.

    No keyword:phrase split required. The filename stem is derived from the
    full normalized phrase so different sentences never collide.
    """
    entries: List[MiningEntry] = []
    with open(path, "r", encoding="utf-8") as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line:
                continue

            # Capture the optional [Context: ...] / [Contexto: ...] block so the
            # Russian prompt can build a Gist line, then remove it from the phrase.
            context_source = context_title = context_detail = None
            ctx_match = re.search(r'\[(?:Context|Contexto):\s*(.*?)\]', line, re.IGNORECASE)
            if ctx_match:
                ctx_parts = [p.strip() for p in ctx_match.group(1).split(" - ")]
                context_source = ctx_parts[0] if len(ctx_parts) > 0 else None
                context_title  = ctx_parts[1] if len(ctx_parts) > 1 else None
                context_detail = ctx_parts[2] if len(ctx_parts) > 2 else None

            # The Russian model expects only the bare Russian phrase in Front, so
            # strip the bracketed metadata (which would otherwise trigger refusals).
            phrase = normalize_ru_phrase(line)
            if not phrase:
                continue

            # Keep a short human-readable label, but use the full phrase for the stem.
            words   = phrase.split()
            keyword = " ".join(words[:2]) if len(words) >= 2 else words[0]
            entries.append(MiningEntry(
                keywords=[keyword],
                phrase=phrase,
                context_source=context_source,
                context_title=context_title,
                context_detail=context_detail,
                file_stem=stable_phrase_stem(phrase),
            ))
    return entries

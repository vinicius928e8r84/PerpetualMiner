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
    stem = stem.lower()
    stem = re.sub(r'\s+', '_', stem)
    # Strip Windows-reserved and bracket chars (keep hyphens)
    stem = re.sub(r'[<>:"/\\|?*\[\]]+', '', stem)
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


def _split_context(line: str):
    """(line without the [Context: ...] / [Contexto: ...] block, source, title, detail)."""
    ctx_match = re.search(r'\[(?:Context|Contexto):\s*(.*?)\]', line, re.IGNORECASE)
    if not ctx_match:
        return line, None, None, None
    ctx_parts = [p.strip() for p in ctx_match.group(1).split(" - ")]
    return (
        line[:ctx_match.start()].strip(),
        ctx_parts[0] if len(ctx_parts) > 0 else None,
        ctx_parts[1] if len(ctx_parts) > 1 else None,
        ctx_parts[2] if len(ctx_parts) > 2 else None,
    )


def parse_mining_line(raw_line: str) -> Optional[MiningEntry]:
    """One mining line (`kw1 | kw2 : phrase [Context: Source - Title - Detail]`, or `keyword: phrase`), or None."""
    line = raw_line.strip()
    if not line:
        return None
    line, context_source, context_title, context_detail = _split_context(line)
    if ":" not in line:
        return None
    keywords_raw, phrase = line.split(":", 1)
    phrase = phrase.strip()
    keywords = [kw.strip() for kw in keywords_raw.split("|") if kw.strip()]
    if not keywords or not phrase:
        return None
    return MiningEntry(
        keywords=keywords,
        phrase=phrase,
        context_source=context_source,
        context_title=context_title,
        context_detail=context_detail,
    )


def _split_target_word(line: str):
    """(first Palavra group, phrase) when `line` starts with `palavra : `, else (None, line).

    The panel sends the Palavra only with words that occur in the phrase, so a prefix whose words are not all
    in the rest is part of the phrase (a Russian sentence may contain ' : ').
    """
    prefix, sep, rest = line.partition(" : ")
    if not sep or not prefix.strip() or not rest.strip():
        return None, line
    words = lambda text: re.findall(r"\w+", text.lower())
    rest_words = set(words(rest))
    groups = [g.strip() for g in prefix.split("|") if g.strip()]
    if not groups or not all(w in rest_words for g in groups for w in words(g)):
        return None, line
    return groups[0], rest


def parse_mining_line_ru(raw_line: str) -> Optional[MiningEntry]:
    """One Russian line: the whole line is the phrase (no keyword:phrase split), or None.

    The filename stem is derived from the full normalized phrase so different sentences never collide.
    """
    line = raw_line.strip()
    if not line:
        return None
    # Capture the optional [Context: ...] block so the Russian prompt can build a Gist line, then remove it
    # from the phrase: the Russian model expects only the bare Russian phrase in Front (metadata triggers refusals).
    body, context_source, context_title, context_detail = _split_context(line)
    target, body = _split_target_word(body)
    phrase = normalize_ru_phrase(body)
    if not phrase:
        return None
    # Keep a short human-readable label, but use the full phrase for the stem.
    words = phrase.split()
    keyword = target or (" ".join(words[:2]) if len(words) >= 2 else words[0])
    return MiningEntry(
        keywords=[keyword],
        phrase=phrase,
        context_source=context_source,
        context_title=context_title,
        context_detail=context_detail,
        file_stem=stable_phrase_stem(phrase),
    )


def parse_line(entrada: str, raw_line: str) -> Optional[MiningEntry]:
    """One mining line the way the language's style reads it (`estilos.json` › `entrada`): `frase` is the whole line, else `kw | kw : phrase`."""
    return parse_mining_line_ru(raw_line) if entrada == "frase" else parse_mining_line(raw_line)


def _parse_file(path: Path, parse_line) -> List[MiningEntry]:
    with open(path, "r", encoding="utf-8") as f:
        return [entry for entry in (parse_line(raw_line) for raw_line in f) if entry is not None]


def parse_mining_file(path: Path) -> List[MiningEntry]:
    """Parse mining.txt into a list of MiningEntry objects.

    Supports:
        kw1 | kw2 : phrase [Context: Source - Title - Detail]
        keyword: phrase                          (legacy format)
    """
    return _parse_file(path, parse_mining_line)


def parse_mining_file_ru(path: Path) -> List[MiningEntry]:
    """Russian parser: each non-empty line is a full phrase (see `parse_mining_line_ru`)."""
    return _parse_file(path, parse_mining_line_ru)

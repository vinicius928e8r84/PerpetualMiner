import hashlib
import re
from dataclasses import dataclass
from typing import Optional, List
from pathlib import Path


def safe_filename(text: str) -> str:
    stem = re.sub(r'\[.*?\]', '', text).strip()
    if not stem:
        stem = re.sub(r'[\[\]]', '', text).strip()
    stem = stem.lower()
    stem = re.sub(r'\s+', '_', stem)
    stem = re.sub(r'[<>:"/\\|?*\[\]]+', '', stem)
    stem = re.sub(r'_+', '_', stem).strip('_-')
    return stem


def normalize_ru_phrase(text: str) -> str:
    text = re.sub(r"\s*\[(?:Context|Contexto):.*?\]\s*$", "", text, flags=re.IGNORECASE).strip()
    text = re.sub(r"\s*\[[^\]]+\]\s*$", "", text).strip()
    text = text.replace("ё", "е").replace("Ё", "Е")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def stable_phrase_stem(text: str, prefix_words: int = 6, hash_len: int = 10) -> str:
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
    keywords: List[str]
    phrase: str
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
    keyword: str
    phrase: str
    is_generated: bool
    entry: MiningEntry
    file_stem: Optional[str] = None

    @property
    def filename_stem(self) -> str:
        return self.file_stem or self.entry.file_stem or safe_filename(self.keyword)


def build_card_stem(keyword: str, phrase: str, hash_len: int = 8) -> str:
    keyword_part = safe_filename(keyword) or "card"
    normalized_phrase = re.sub(r"\s+", " ", phrase or "").strip()
    digest = hashlib.sha1(f"{keyword}\n{normalized_phrase}".encode("utf-8")).hexdigest()[:hash_len]
    return f"{keyword_part}__{digest}"


def get_card_jobs(entry: MiningEntry) -> List[CardJob]:
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
    prefix, _, rest = line.partition(" : ")
    groups = [g.strip() for g in prefix.split("|") if g.strip()]
    if rest.strip() and _every_word_occurs_in(groups, rest):
        return groups[0], rest
    return None, line


def _every_word_occurs_in(groups: List[str], phrase: str) -> bool:
    phrase_words = set(_words(phrase))
    return bool(groups) and all(w in phrase_words for g in groups for w in _words(g))


def _words(text: str) -> List[str]:
    return re.findall(r"\w+", text.lower())


def parse_mining_line_ru(raw_line: str) -> Optional[MiningEntry]:
    line = raw_line.strip()
    if not line:
        return None
    body, context_source, context_title, context_detail = _split_context(line)
    target, body = _split_target_word(body)
    phrase = normalize_ru_phrase(body)
    if not phrase:
        return None
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
    return parse_mining_line_ru(raw_line) if entrada == "frase" else parse_mining_line(raw_line)


def _parse_file(path: Path, parse_line) -> List[MiningEntry]:
    with open(path, "r", encoding="utf-8") as f:
        return [entry for entry in (parse_line(raw_line) for raw_line in f) if entry is not None]


def parse_mining_file(path: Path) -> List[MiningEntry]:
    return _parse_file(path, parse_mining_line)


def parse_mining_file_ru(path: Path) -> List[MiningEntry]:
    return _parse_file(path, parse_mining_line_ru)

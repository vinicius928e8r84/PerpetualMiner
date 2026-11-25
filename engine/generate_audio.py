import re
from pathlib import Path
from typing import Optional, Tuple

if __package__:
    from .parser import CardJob
else:
    from parser import CardJob


def _has_cyrillic(text: str) -> bool:
    return bool(re.search(r"[\u0400-\u04FF]", text))


def _pick_profile(text: str, config: dict, field: str) -> dict:
    lang_key = "ru" if _has_cyrillic(text) else "en"
    profile = (
        config.get("tts", {})
        .get("profiles", {})
        .get(lang_key, {})
        .get(field, {})
    ) or {}
    return {
        "lang": profile.get("lang", "ru" if lang_key == "ru" else "en"),
        "tld": profile.get("tld", "ru" if lang_key == "ru" else "com"),
    }


def _clean_for_tts(text: str) -> str:
    return re.sub(r'\[.*?\]', '', text).strip()


def phrase_from_card_text(content: str) -> Optional[str]:
    match = re.search(
        r'\*{0,2}Front:?\*{0,2}\s*(.*?)\s*\*{0,2}Back:?\*{0,2}',
        content,
        re.DOTALL | re.IGNORECASE,
    )
    if not match:
        return None
    phrase = match.group(1).strip()
    phrase = re.sub(r"🔊.*", "", phrase).strip()
    phrase = re.sub(r'\[Phrase with[^\]]*\]\s*:?\s*', '', phrase, flags=re.IGNORECASE).strip()
    phrase = re.sub(r'\[.*?\]', '', phrase).strip()
    phrase = re.sub(r'\*+', '', phrase).strip()
    return phrase or None


def word_from_card_text(content: str) -> Optional[str]:
    match = re.search(r"^[^\S\n]*\*{0,2}Word:\*{0,2}[^\S\n]*(.+)$", content, re.IGNORECASE | re.MULTILINE)
    return match.group(1).replace("\u0301", "").strip().strip("*").strip() or None if match else None


def voices(job: CardJob, card_text: Optional[str], config: dict) -> Tuple[Tuple[str, str, str], Tuple[str, str, str]]:
    phrase_text = (phrase_from_card_text(card_text) if card_text is not None else None) or _clean_for_tts(job.phrase)
    word_text = _clean_for_tts((word_from_card_text(card_text) if card_text is not None else None) or job.keyword)
    word_profile = _pick_profile(word_text, config, "word")
    phrase_profile = _pick_profile(phrase_text, config, "phrase")
    return (
        (word_text, word_profile["lang"], word_profile["tld"]),
        (phrase_text, phrase_profile["lang"], phrase_profile["tld"]),
    )


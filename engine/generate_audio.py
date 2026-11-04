"""
generate_audio.py — What a card says and with which accent (the add-on asks Google for the MP3 in `complemento/voz.py`).

Language is read from config.json (tts.target_lang).
Texts containing Cyrillic script automatically switch to tts.cyrillic_lang.

For AI-generated secondary cards the phrase is read from the card .txt file
(produced by generate_cards.py) so the spoken audio matches the actual sentence
the Assistant created, not the original entry phrase.

Output filenames: {stem}_word.mp3  and  {stem}_phrase.mp3

`voices()` is what a card says and with which accent (the word is the card's own `Word:` line when it has one, else the keyword of its line); the module uses the standard library only, so it also imports as
`complemento.motor.generate_audio` inside the Anki add-on.
"""

import re
from pathlib import Path
from typing import Optional, Tuple

if __package__:  # inside the Anki add-on the engine is the package `complemento.motor`
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
    """Strip [bracket metadata] blocks so TTS only speaks the actual words."""
    return re.sub(r'\[.*?\]', '', text).strip()


def phrase_from_card_text(content: str) -> Optional[str]:
    """Extract the spoken phrase from the Front section of a card's text.

    Handles **Front**, **Front:**, Front:, etc.
    Strips GPT artefacts like '[Phrase with keyword highlighted:]'.
    """
    match = re.search(
        r'\*{0,2}Front:?\*{0,2}\s*(.*?)\s*\*{0,2}Back:?\*{0,2}',
        content,
        re.DOTALL | re.IGNORECASE,
    )
    if not match:
        return None
    phrase = match.group(1).strip()
    phrase = re.sub(r"🔊.*", "", phrase).strip()
    # Strip "[Phrase with ...]" or "[Phrase with ... :]" GPT artefacts
    phrase = re.sub(r'\[Phrase with[^\]]*\]\s*:?\s*', '', phrase, flags=re.IGNORECASE).strip()
    # Strip any remaining bracket metadata
    phrase = re.sub(r'\[.*?\]', '', phrase).strip()
    # Strip all markdown asterisks
    phrase = re.sub(r'\*+', '', phrase).strip()
    return phrase or None


def word_from_card_text(content: str) -> Optional[str]:
    """The word a card names on its own `Word:` line (the Russian levels with morphology: the model picks it in the phrase), without the
    stress mark; None for a card that does not name one (the word is then the keyword of its mining line)."""
    match = re.search(r"^[^\S\n]*\*{0,2}Word:\*{0,2}[^\S\n]*(.+)$", content, re.IGNORECASE | re.MULTILINE)
    return match.group(1).replace("\u0301", "").strip().strip("*").strip() or None if match else None


def voices(job: CardJob, card_text: Optional[str], config: dict) -> Tuple[Tuple[str, str, str], Tuple[str, str, str]]:
    """What a card says and how: ((word, lang, tld), (phrase, lang, tld)).

    The phrase is read from the card text so secondary keywords speak the AI-generated sentence, not the original
    mining.txt phrase; without it (`None`, or no Front in it) the original phrase is the fallback.
    """
    phrase_text = (phrase_from_card_text(card_text) if card_text is not None else None) or _clean_for_tts(job.phrase)
    word_text = _clean_for_tts((word_from_card_text(card_text) if card_text is not None else None) or job.keyword)
    word_profile = _pick_profile(word_text, config, "word")
    phrase_profile = _pick_profile(phrase_text, config, "phrase")
    return (
        (word_text, word_profile["lang"], word_profile["tld"]),
        (phrase_text, phrase_profile["lang"], phrase_profile["tld"]),
    )


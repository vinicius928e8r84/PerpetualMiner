"""
generate_audio.py — Generate pronunciation MP3 files via gTTS.

Language is read from config.json (tts.target_lang).
Texts containing Cyrillic script automatically switch to tts.cyrillic_lang.

For AI-generated secondary cards the phrase is read from the card .txt file
(produced by generate_cards.py) so the spoken audio matches the actual sentence
the Assistant created, not the original entry phrase.

Output filenames: {stem}_word.mp3  and  {stem}_phrase.mp3
"""

import re
from pathlib import Path
from typing import Callable, List, Optional

from gtts import gTTS

from config_loader import load_config
from parser import parse_mining_file, get_card_jobs, CardJob


# ── helpers ──────────────────────────────────────────────────────────────────

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


def _read_phrase_from_card(card_file: Path) -> Optional[str]:
    """Extract the spoken phrase from the Front section of a card .txt file.

    Handles **Front**, **Front:**, Front:, etc.
    Strips GPT artefacts like '[Phrase with keyword highlighted:]'.
    """
    if not card_file.exists():
        return None
    content = card_file.read_text(encoding="utf-8")
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


# ── public API ────────────────────────────────────────────────────────────────

def run(
    entries,
    config: dict,
    progress_callback: Optional[Callable[[int, int, str], None]] = None,
) -> List[str]:
    """Generate word + phrase MP3 for every CardJob.

    progress_callback(done, total, label) is called after each file is saved.
    Returns list of generated filenames.
    """
    output_dir = Path(config["paths"]["output_dir"])
    output_dir.mkdir(exist_ok=True)

    all_jobs: List[CardJob] = []
    for entry in entries:
        all_jobs.extend(get_card_jobs(entry))

    total = len(all_jobs) * 2   # word + phrase per card
    done = 0
    generated: List[str] = []

    for job in all_jobs:
        stem = job.filename_stem
        card_file = output_dir / f"{stem}.txt"

        # Always read the phrase from the card file so secondary keywords
        # speak the AI-generated sentence, not the original mining.txt phrase.
        phrase_text = _read_phrase_from_card(card_file)
        if not phrase_text:
            # Fallback: use original phrase (should only happen if card file is missing)
            phrase_text = _clean_for_tts(job.phrase)

        # Clean the keyword too (in case mining.txt had brackets)
        word_text = _clean_for_tts(job.keyword)

        word_profile = _pick_profile(word_text, config, "word")
        phrase_profile = _pick_profile(phrase_text, config, "phrase")

        # ── word audio ──
        word_file = output_dir / f"{stem}_word.mp3"
        gTTS(text=word_text, lang=word_profile["lang"], tld=word_profile["tld"]).save(str(word_file))
        generated.append(word_file.name)
        done += 1
        if progress_callback:
            progress_callback(done, total, f"[word] {job.keyword}")

        # ── phrase audio ──
        phrase_file = output_dir / f"{stem}_phrase.mp3"
        gTTS(text=phrase_text, lang=phrase_profile["lang"], tld=phrase_profile["tld"]).save(str(phrase_file))
        generated.append(phrase_file.name)
        done += 1
        if progress_callback:
            progress_callback(done, total, f"[phrase] {job.keyword}")

    return generated


if __name__ == "__main__":
    cfg = load_config()
    mining_entries = parse_mining_file(Path(cfg["paths"]["mining_file"]))
    result = run(mining_entries, cfg)
    print(f"✅ {len(result)} audio file(s) generated.")

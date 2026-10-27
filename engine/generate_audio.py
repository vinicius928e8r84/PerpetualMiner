"""
generate_audio.py — Generate pronunciation MP3 files via gTTS.

Language is read from config.json (tts.target_lang).
Texts containing Cyrillic script automatically switch to tts.cyrillic_lang.

For AI-generated secondary cards the phrase is read from the card .txt file
(produced by generate_cards.py) so the spoken audio matches the actual sentence
the Assistant created, not the original entry phrase.

Output filenames: {stem}_word.mp3  and  {stem}_phrase.mp3

`voices()` is what a card says and with which accent; the bridge speaks it with gTTS (`run`, imported only when it runs), the
Anki add-on asks Google for it with the standard library only (`complemento/voz.py`), so this module also imports as
`complemento.motor.generate_audio` without gTTS.
"""

import re
from pathlib import Path
from typing import Callable, List, Optional, Tuple

if __package__:  # inside the Anki add-on the engine is the package `complemento.motor`
    from .config_loader import load_config
    from .parser import parse_mining_file, get_card_jobs, CardJob
else:
    from config_loader import load_config
    from parser import parse_mining_file, get_card_jobs, CardJob


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


def voices(job: CardJob, card_text: Optional[str], config: dict) -> Tuple[Tuple[str, str, str], Tuple[str, str, str]]:
    """What a card says and how: ((word, lang, tld), (phrase, lang, tld)).

    The phrase is read from the card text so secondary keywords speak the AI-generated sentence, not the original
    mining.txt phrase; without it (`None`, or no Front in it) the original phrase is the fallback.
    """
    phrase_text = (phrase_from_card_text(card_text) if card_text is not None else None) or _clean_for_tts(job.phrase)
    word_text = _clean_for_tts(job.keyword)
    word_profile = _pick_profile(word_text, config, "word")
    phrase_profile = _pick_profile(phrase_text, config, "phrase")
    return (
        (word_text, word_profile["lang"], word_profile["tld"]),
        (phrase_text, phrase_profile["lang"], phrase_profile["tld"]),
    )


def run(
    entries,
    config: dict,
    progress_callback: Optional[Callable[[int, int, str], None]] = None,
) -> List[str]:
    """Generate word + phrase MP3 for every CardJob.

    progress_callback(done, total, label) is called after each file is saved.
    Returns list of generated filenames.
    """
    from gtts import gTTS  # the add-on has no gTTS: only the bridge speaks through it

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
        card_text = card_file.read_text(encoding="utf-8") if card_file.exists() else None
        (word_text, word_lang, word_tld), (phrase_text, phrase_lang, phrase_tld) = voices(job, card_text, config)

        word_file = output_dir / f"{stem}_word.mp3"
        gTTS(text=word_text, lang=word_lang, tld=word_tld).save(str(word_file))
        generated.append(word_file.name)
        done += 1
        if progress_callback:
            progress_callback(done, total, f"[word] {job.keyword}")

        phrase_file = output_dir / f"{stem}_phrase.mp3"
        gTTS(text=phrase_text, lang=phrase_lang, tld=phrase_tld).save(str(phrase_file))
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

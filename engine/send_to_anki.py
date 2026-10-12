"""
send_to_anki.py - Send generated cards to Anki via AnkiConnect HTTP API.

Outcome is tracked per card. run() returns {stem: status} where status is one
of ADDED / DUPLICATE / FAILED (see below), so callers can tell a freshly
injected note apart from one that already existed. cleanup_output() is exported
so start.py / the bridge can delete artifacts only for cards that are actually
in Anki (ADDED or DUPLICATE), never for FAILED ones (kept for retry).
"""

import base64
import re
from pathlib import Path
from typing import Dict, List, Optional

import requests

from config_loader import load_config
from parser import CardJob, get_card_jobs, normalize_ru_phrase, parse_mining_file

# Per-card outcomes returned by run(). A note that already existed in the deck
# is reported as DUPLICATE (not ADDED) so it is never silently counted as a
# freshly sent card. Both ADDED and DUPLICATE mean "the card is in Anki now";
# only FAILED means the card is absent and its artifacts must be kept.
ADDED = "added"
DUPLICATE = "duplicate"
FAILED = "failed"

# A card is "present in Anki" for either of these outcomes.
PRESENT_STATUSES = frozenset({ADDED, DUPLICATE})


def is_present(status: object) -> bool:
    """True if the given per-card status means the card is in Anki."""
    return status in PRESENT_STATUSES


def _store_media(path: Path, anki_url: str) -> bool:
    b64 = base64.b64encode(path.read_bytes()).decode("utf-8")
    payload = {
        "action": "storeMediaFile",
        "version": 6,
        "params": {"filename": path.name, "data": b64},
    }
    r = requests.post(anki_url, json=payload).json()
    return not r.get("error")


def _anki_invoke(action: str, anki_url: str, params: Optional[dict] = None):
    payload = {"action": action, "version": 6, "params": params or {}}
    r = requests.post(anki_url, json=payload, timeout=10).json()
    if r.get("error"):
        raise RuntimeError(r["error"])
    return r.get("result")


def _add_note(
    fields: Dict[str, str],
    deck_name: str,
    model_name: str,
    anki_url: str,
    extra_tags: Optional[List[str]] = None,
) -> bool:
    tags = list(extra_tags) if extra_tags else ["perpetual_miner"]
    payload = {
        "action": "addNote",
        "version": 6,
        "params": {
            "note": {
                "deckName": deck_name,
                "modelName": model_name,
                "fields": fields,
                "options": {"allowDuplicate": False},
                "tags": tags,
            }
        },
    }
    try:
        r = requests.post(anki_url, json=payload, timeout=10).json()
    except Exception as exc:
        print(f"[AnkiConnect] Connection failure: {exc}")
        return False

    if r.get("error"):
        print(f"[AnkiConnect ERROR] deck='{deck_name}' model='{model_name}' error={r['error']!r}")
        return False
    return r.get("result") is not None


def _strip_html(text: str) -> str:
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\[sound:[^\]]+\]", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _normalize_front_text(text: str, lang: str) -> str:
    plain = _strip_html(text)
    return normalize_ru_phrase(plain) if lang == "ru" else plain.casefold()


def _existing_fronts(deck_name: str, front_field: str, anki_url: str, lang: str) -> set[str]:
    query = f'deck:"{deck_name}"'
    note_ids = _anki_invoke("findNotes", anki_url, {"query": query}) or []
    if not note_ids:
        return set()

    info = _anki_invoke("notesInfo", anki_url, {"notes": note_ids}) or []
    found: set[str] = set()
    for note in info:
        fields = note.get("fields") or {}
        front = ((fields.get(front_field) or {}).get("value") or "").strip()
        if front:
            found.add(_normalize_front_text(front, lang))
    return found


def _extract_tags_from_card(content: str) -> List[str]:
    """Extract Anki tags from the 'Source Context:' line in a card .txt file."""
    tags: List[str] = ["perpetual_miner"]

    match = re.search(r"Source\s+Context:\s*(.+)", content, re.IGNORECASE)
    if not match:
        return tags

    raw = match.group(1).strip()
    for part in raw.split("-"):
        tag = part.strip().lower()
        tag = re.sub(r"\s+", "_", tag)
        tag = re.sub(r"[^\w\-]", "", tag)
        tag = tag.strip("_-")
        if tag:
            tags.append(tag)

    return tags


def _md_to_html(text: str) -> str:
    """Convert Markdown bold markers to <b> tags."""
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text, flags=re.DOTALL)
    text = re.sub(r"\*(.+?)\*", r"<b>\1</b>", text, flags=re.DOTALL)
    return text


# Field labels are anchored to the start of a line (re.MULTILINE). Without the
# ^ anchor, the word "Back" inside a phrase (e.g. "But *back* of that ad...")
# matches as the structural Front/Back delimiter and the sentence gets split on
# it. \b guards against "Background:" etc. The colon stays optional because the
# RU prompt puts "Front"/"Back" on their own lines with no colon.
_FRONT_RE = re.compile(
    r"^[^\S\n]*\*{0,2}Front\b\s*[:\-]?\*{0,2}[^\S\n]*(.*?)\s*(?=^[^\S\n]*\*{0,2}Back\b\s*[:\-]?|\Z)",
    re.DOTALL | re.IGNORECASE | re.MULTILINE,
)
_BACK_RE = re.compile(
    r"^[^\S\n]*\*{0,2}Back\b\s*[:\-]?\*{0,2}[^\S\n]*(.*)",
    re.DOTALL | re.IGNORECASE | re.MULTILINE,
)
_ALIGNMENT_LINE_RE = re.compile(r"^\s*\d+\s*\|\s*(.+?)\s*\|\s*(.+?)\s*$")
_COLOR_PALETTE = [
    "#ff8c42",
    "#a855f7",
    "#22c55e",
    "#ef4444",
    "#06b6d4",
    "#eab308",
]


def _log_raw(label: str, content: str) -> None:
    """Print the raw card content so we can see exactly what the AI wrote."""
    print(f"\n[DEBUG] {label} - raw .txt content:")
    print("-" * 60)
    print(content[:600])
    print("-" * 60)


def _extract_alignments(content: str) -> List[tuple[str, str]]:
    """Parse Alignment pairs from a generated card."""
    alignments: List[tuple[str, str]] = []
    in_alignment = False

    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line:
            if in_alignment:
                break
            continue

        if re.match(r"\*{0,2}Alignment:\*{0,2}\s*$", line, re.IGNORECASE):
            in_alignment = True
            continue

        if not in_alignment:
            continue

        match = _ALIGNMENT_LINE_RE.match(line)
        if not match:
            if alignments:
                break
            continue

        left = match.group(1).strip()
        right = match.group(2).strip()
        if left and right:
            alignments.append((left, right))

    return alignments


def _apply_chunk_colors(text: str, chunks: List[str], ignore_case: bool = False) -> str:
    """Wrap the first occurrence of each chunk in a colored span."""
    if not text or not chunks:
        return text

    rendered = text
    placeholders: Dict[str, str] = {}
    flags = re.IGNORECASE if ignore_case else 0

    for idx, chunk in enumerate(chunks):
        clean_chunk = chunk.strip()
        if not clean_chunk:
            continue

        color = _COLOR_PALETTE[idx % len(_COLOR_PALETTE)]
        pattern = re.escape(clean_chunk)

        def _repl(match):
            # Sentinel uses Private Use Area chars (/) so it cannot
            # contain any letter/digit a later chunk might match under
            # ignore_case (a plain "@@ALIGN_..@@" token leaks because chunk "I"
            # matches the I inside ALIGN and corrupts the token).
            token = f"{len(placeholders)}"
            placeholders[token] = f'<span style="color: {color};">{match.group(0)}</span>'
            return token

        rendered, _ = re.subn(pattern, _repl, rendered, count=1, flags=flags)

    for token, html in placeholders.items():
        rendered = rendered.replace(token, html)
    return rendered


def _reorder_english_back_lines(lines: List[str]) -> List[str]:
    first_line = next((line.strip() for line in lines if line.strip()), "")
    if not first_line:
        return []

    fields: Dict[str, str] = {}
    arrow_line = ""
    field_re = re.compile(
        r"^\*{0,2}(definition|simple meaning|gist|other example|trigger):\*{0,2}\s*",
        re.IGNORECASE,
    )

    for line in lines:
        stripped = line.strip()
        if not stripped or stripped == first_line:
            continue
        match = field_re.match(stripped)
        if match:
            fields[match.group(1).lower()] = stripped
            continue
        if stripped.startswith(("->", "→")) and not arrow_line:
            arrow_line = stripped

    ordered = [first_line]
    for key in ("definition", "simple meaning"):
        if fields.get(key):
            ordered.extend(["", fields[key]])
    if arrow_line:
        ordered.extend(["", arrow_line])
    if fields.get("gist"):
        ordered.extend(["", fields["gist"]])
    for key in ("other example", "trigger"):
        if fields.get(key):
            ordered.extend(["", fields[key]])
    return ordered


def _build_front(content: str, phrase_audio_name: str, lang: str = "en") -> str:
    match = _FRONT_RE.search(content)
    phrase = match.group(1).strip() if match else ""

    if not phrase:
        phrase = next((line.strip() for line in content.splitlines() if line.strip()), "")
        if phrase:
            print(f"[WARN] 'Front' not found - using first line: '{phrase[:60]}'")
        else:
            _log_raw("_build_front FAILED", content)

    phrase = re.sub(r"🔊.*", "", phrase).strip()
    if lang == "ru":
        alignments = _extract_alignments(content)
        phrase = _apply_chunk_colors(phrase, [ru for ru, _ in alignments])
    phrase = _md_to_html(phrase)
    phrase = phrase.replace("\n", "<br>")
    return f"{phrase}[sound:{phrase_audio_name}]"


def _build_back(
    content: str,
    word_audio_name: str,
    image_name: Optional[str] = None,
    lang: str = "en",
) -> str:
    match = _BACK_RE.search(content)
    text = match.group(1).strip() if match else ""

    if not text:
        lines = [line for line in content.splitlines() if line.strip()]
        text = "\n".join(lines[1:]) if len(lines) > 1 else ""
        if text:
            print("[WARN] 'Back' not found - using rest of file as back.")
        else:
            _log_raw("_build_back FAILED", content)

    text = re.sub(r"🔊.*", "", text).strip()
    alignments = _extract_alignments(content) if lang == "ru" else []
    in_alignment = False
    in_image_queries = False

    clean: List[str] = []
    for line in text.splitlines():
        stripped = line.strip()
        low = stripped.lower()

        if not stripped:
            if in_alignment:
                in_alignment = False
            if in_image_queries:
                in_image_queries = False
            clean.append("")
            continue

        if re.match(r"\*{0,2}alignment:\*{0,2}\s*$", stripped, re.IGNORECASE):
            in_alignment = True
            continue
        if in_alignment and _ALIGNMENT_LINE_RE.match(stripped):
            continue
        if in_alignment:
            in_alignment = False

        if re.match(
            r"\*{0,2}(google image search queries|image search queries):\*{0,2}\s*$",
            stripped,
            re.IGNORECASE,
        ):
            in_image_queries = True
            continue
        if in_image_queries and re.match(r"^(?:\d+[.)]|[-*])\s+.+$", stripped):
            continue
        if in_image_queries:
            in_image_queries = False

        if low.startswith("image search query:") or low.startswith("**image search query:"):
            continue
        if low.startswith("google image search:") or low.startswith("**google image search:"):
            continue
        if low.startswith("image:") or low.startswith("**image:"):
            continue
        if ".mp3" in low or ".png" in low or "[sound:" in low:
            continue

        if lang == "ru":
            literal_match = re.match(r"(\*{0,2}Literal:\*{0,2}\s*)(.+)$", stripped, re.IGNORECASE)
            if literal_match and alignments:
                prefix = literal_match.group(1)
                translated = literal_match.group(2).strip()
                translated = _apply_chunk_colors(
                    translated,
                    [en for _, en in alignments],
                    ignore_case=True,
                )
                clean.append(prefix + translated)
                continue

        clean.append(stripped)

    if lang == "en":
        clean = _reorder_english_back_lines(clean)

    text = _md_to_html("\n".join(clean))

    lines = text.splitlines()
    first_line = lines[0] if lines else ""
    rest = "\n".join(lines[1:])

    def _fmt_block(block: str) -> str:
        blines = block.strip().split("\n")
        if len(blines) > 1 and re.match(r"<b>[^<]+:</b>", blines[0]):
            return blines[0] + "<br>" + "<br>".join(blines[1:])
        return " ".join(blines)

    blocks = rest.split("\n\n")
    rest_html = "<br><br>".join(_fmt_block(block) for block in blocks)

    back = f"{first_line} [sound:{word_audio_name}]<br>{rest_html.lstrip('<br>').lstrip()}"
    if image_name:
        back += f'<br><br><img src="{image_name}">'

    back = back.replace("\n", "<br>")
    return back


def _ensure_deck(deck_name: str, anki_url: str) -> None:
    payload = {"action": "createDeck", "version": 6, "params": {"deck": deck_name}}
    try:
        requests.post(anki_url, json=payload, timeout=10)
    except Exception as exc:
        print(f"[WARN] Could not ensure deck '{deck_name}' exists: {exc}")


def run(entries, config: dict) -> Dict[str, str]:
    """Send every CardJob to Anki. Returns {stem: status}.

    status is one of ADDED (freshly injected), DUPLICATE (already existed in
    the deck, nothing sent) or FAILED (missing artifacts or AnkiConnect
    rejected). DUPLICATE is deliberately kept distinct from ADDED so a card
    that already existed is never reported as a newly sent card.
    """
    deck_name = config["anki"]["deck_name"]
    model_name = config["anki"]["note_type"]
    anki_url = config["anki"]["url"]
    folder = Path(config["paths"]["output_dir"])

    fields_cfg = config.get("anki", {}).get("fields", {})
    front_field = fields_cfg.get("front", "Frente")
    back_field = fields_cfg.get("back", "Verso")
    lang = config.get("lang", "en")
    print(f"[INFO] Anki model: '{model_name}' | Fields: '{front_field}' / '{back_field}'")

    _ensure_deck(deck_name, anki_url)

    all_jobs: List[CardJob] = []
    for entry in entries:
        all_jobs.extend(get_card_jobs(entry))

    results: Dict[str, str] = {}
    known_fronts = _existing_fronts(deck_name, front_field, anki_url, lang)

    for job in all_jobs:
        stem = job.filename_stem

        note_file = folder / f"{stem}.txt"
        phrase_mp3 = folder / f"{stem}_phrase.mp3"
        word_mp3 = folder / f"{stem}_word.mp3"
        image_png = folder / f"{stem}.png"

        missing = [f.name for f in [note_file, phrase_mp3, word_mp3] if not f.exists()]
        if missing:
            print(f"[WARN] Missing files for '{job.keyword}': {missing} - skipping.")
            results[stem] = FAILED
            continue

        content = note_file.read_text(encoding="utf-8").replace("## Anki Card", "").strip()
        img_name = image_png.name if image_png.exists() else None

        front = _build_front(content, phrase_mp3.name, lang=lang)
        back = _build_back(content, word_mp3.name, img_name, lang=lang)
        normalized_front = _normalize_front_text(front, lang)

        if normalized_front in known_fronts:
            print(f"[INFO] Card already exists in Anki for '{job.keyword}' - reporting as duplicate (nothing sent).")
            results[stem] = DUPLICATE
            continue

        _store_media(phrase_mp3, anki_url)
        _store_media(word_mp3, anki_url)
        if image_png.exists():
            _store_media(image_png, anki_url)

        card_tags = _extract_tags_from_card(content)

        ok = _add_note(
            {front_field: front, back_field: back},
            deck_name,
            model_name,
            anki_url,
            card_tags,
        )
        results[stem] = ADDED if ok else FAILED
        if ok:
            known_fronts.add(normalized_front)
        else:
            print(f"[WARN] AnkiConnect rejected note for '{job.keyword}'.")

    return results


def cleanup_output(folder: Path, results: Dict[str, str]) -> None:
    """Delete output files for cards that are in Anki (ADDED or DUPLICATE).

    FAILED cards keep their artifacts so a later retry can still send them -
    this is the safety net against silently discarding a card that never
    reached Anki.
    """
    for stem, status in results.items():
        if not is_present(status):
            continue
        for suffix in [".txt", "_word.mp3", "_phrase.mp3", ".png"]:
            f = folder / f"{stem}{suffix}"
            if f.exists():
                try:
                    f.unlink()
                except Exception:
                    pass

    if results and all(is_present(status) for status in results.values()):
        for leftover in folder.glob("*"):
            try:
                leftover.unlink()
            except Exception:
                pass


if __name__ == "__main__":
    cfg = load_config()
    entries = parse_mining_file(Path(cfg["paths"]["mining_file"]))
    results = run(entries, cfg)

    added = sum(1 for value in results.values() if value == ADDED)
    dup = sum(1 for value in results.values() if value == DUPLICATE)
    failed = sum(1 for value in results.values() if value == FAILED)
    print(f"Added {added}, duplicate {dup}, failed {failed} (of {len(results)} card(s)).")

    if results and all(is_present(value) for value in results.values()):
        cleanup_output(Path(cfg["paths"]["output_dir"]), results)
        print("Output cleaned.")
    else:
        print("Some cards failed - Output was NOT fully cleaned.")

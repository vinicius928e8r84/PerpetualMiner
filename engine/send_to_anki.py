"""
send_to_anki.py - The note a card text becomes: the Front and Back HTML, the tags and the Front the duplicate search compares.

The Anki add-on writes the notes through the collection (`complemento/no_anki.py`); this module only formats them.
"""

import logging
import re
from typing import Dict, List, Optional

if __package__:  # inside the Anki add-on the engine is the package `complemento.motor`
    from .parser import normalize_ru_phrase
else:
    from parser import normalize_ru_phrase

LOGGER = logging.getLogger("perpetualminer.motor")


def _strip_html(text: str) -> str:
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\[sound:[^\]]+\]", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _normalize_front_text(text: str, lang: str) -> str:
    plain = _strip_html(text)
    return normalize_ru_phrase(plain) if lang == "ru" else plain.casefold()


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
    """Log that a card text is unusable; its content is the person's mined phrase, so only the size goes to the log."""
    LOGGER.warning("%s - the card text has no usable content (%d characters)", label, len(content))


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


def _build_front(content: str, phrase_audio_name: Optional[str], lang: str = "en", cores: Optional[bool] = None) -> str:
    """The Front field's HTML; `phrase_audio_name` None makes a card without audio. `cores`: the style colours the Alignment pairs (None: Russian does)."""
    match = _FRONT_RE.search(content)
    phrase = match.group(1).strip() if match else ""

    if not phrase:
        phrase = next((line.strip() for line in content.splitlines() if line.strip()), "")
        if phrase:
            LOGGER.warning("'Front' not found - using the first line")
        else:
            _log_raw("_build_front FAILED", content)

    phrase = re.sub(r"🔊.*", "", phrase).strip()
    if lang == "ru" if cores is None else cores:
        phrase = _apply_chunk_colors(phrase, [alvo for alvo, _ in _extract_alignments(content)])
    phrase = _md_to_html(phrase)
    phrase = phrase.replace("\n", "<br>")
    return f"{phrase}[sound:{phrase_audio_name}]" if phrase_audio_name else phrase


def _build_back(
    content: str,
    word_audio_name: Optional[str],
    image_name: Optional[str] = None,
    lang: str = "en",
) -> str:
    match = _BACK_RE.search(content)
    text = match.group(1).strip() if match else ""

    if not text:
        lines = [line for line in content.splitlines() if line.strip()]
        text = "\n".join(lines[1:]) if len(lines) > 1 else ""
        if text:
            LOGGER.warning("'Back' not found - using rest of file as back.")
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

    audio = f" [sound:{word_audio_name}]" if word_audio_name else ""
    back = f"{first_line}{audio}<br>{rest_html.lstrip('<br>').lstrip()}"
    if image_name:
        back += f'<br><br><img src="{image_name}">'

    back = back.replace("\n", "<br>")
    return back


def card_fields(
    content: str,
    lang: str,
    phrase_audio_name: Optional[str] = None,
    word_audio_name: Optional[str] = None,
    image_name: Optional[str] = None,
) -> Dict[str, object]:
    """The note a card .txt becomes: `front` and `back` HTML, the `normalized_front` the duplicate search compares and
    the `tags`. Without audio or image names the card is text only (the Anki add-on's first card, #142)."""
    content = content.replace("## Anki Card", "").strip()
    front = _build_front(content, phrase_audio_name, lang=lang)
    return {
        "front": front,
        "back": _build_back(content, word_audio_name, image_name, lang=lang),
        "normalized_front": _normalize_front_text(front, lang),
        "tags": _extract_tags_from_card(content),
    }


def normalize_front(text: str, lang: str) -> str:
    """A Front field as the duplicate search compares it (HTML, sound tags and case gone; Russian ё → е)."""
    return _normalize_front_text(text, lang)

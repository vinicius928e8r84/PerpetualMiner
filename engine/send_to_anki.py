"""
send_to_anki.py - The note a card text becomes: the Front and Back HTML, the tags and the Front the duplicate search compares.

The Anki add-on writes the notes through the collection (`complemento/no_anki.py`); this module only formats them.
"""

import logging
import re
from typing import Dict, List, NamedTuple, Optional

if __package__:  # inside the Anki add-on the engine is the package `complemento.motor`
    from .parser import normalize_ru_phrase
else:
    from parser import normalize_ru_phrase

LOGGER = logging.getLogger("perpetualminer.motor")


def _strip_html(text: str) -> str:
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\[sound:[^\]]+\]", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"&nbsp;", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r" +([.,!?;:…»)])", r"\1", text)
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
_ALIGNMENT_HEADER_RE = re.compile(r"\*{0,2}alignment:\*{0,2}\s*$", re.IGNORECASE)
_IMAGE_QUERIES_HEADER_RE = re.compile(r"\*{0,2}(google image search queries|image search queries):\*{0,2}\s*$", re.IGNORECASE)
_LIST_ITEM_RE = re.compile(r"^(?:\d+[.)]|[-*])\s+.+$")
_IMAGE_PROMPT_PREFIXES = (
    "image search query:",
    "**image search query:",
    "google image search:",
    "**google image search:",
    "image:",
    "**image:",
)
_MEDIA_MARKERS = (".mp3", ".png", "[sound:")
_LITERAL_RE = re.compile(r"(\*{0,2}Literal:\*{0,2}\s*)(.+)$", re.IGNORECASE)
_ENGLISH_FIELD_RE = re.compile(r"^\*{0,2}(definition|simple meaning|gist|other example|trigger):\*{0,2}\s*", re.IGNORECASE)
_ARROWS = ("->", "→")
_ENGLISH_EXAMPLE = "arrow"
_ENGLISH_BACK_ORDER = ("definition", "simple meaning", _ENGLISH_EXAMPLE, "gist", "other example", "trigger")
_BOLD_LABEL_RE = re.compile(r"<b>[^<]+:</b>")
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


def _alignment_block(content: str) -> List[str]:
    """The stripped lines under the first `Alignment:` header, up to the next blank line; a repeated header is not one of
    them."""
    lines = [raw_line.strip() for raw_line in content.splitlines()]
    start = next((index + 1 for index, line in enumerate(lines) if _ALIGNMENT_HEADER_RE.match(line)), len(lines))
    block: List[str] = []
    for line in lines[start:]:
        if not line:
            break
        if not _ALIGNMENT_HEADER_RE.match(line):
            block.append(line)
    return block


def _extract_alignments(content: str) -> List[tuple[str, str]]:
    """The Alignment pairs of a generated card: the `n | target | English` lines of its block, from the first pair up to
    the first line that is not one (the lines before the first pair are skipped)."""
    alignments: List[tuple[str, str]] = []
    for line in _alignment_block(content):
        match = _ALIGNMENT_LINE_RE.match(line)
        if not match:
            if alignments:
                break
            continue
        left, right = match.group(1).strip(), match.group(2).strip()
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


def _english_back_parts(lines: List[str], first_line: str) -> Dict[str, str]:
    """The English Back's learning fields by name (the last one of a name wins) and its first `->` example line."""
    parts: Dict[str, str] = {}
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped == first_line:
            continue
        match = _ENGLISH_FIELD_RE.match(stripped)
        if match:
            parts[match.group(1).lower()] = stripped
        elif stripped.startswith(_ARROWS):
            parts.setdefault(_ENGLISH_EXAMPLE, stripped)
    return parts


def _reorder_english_back_lines(lines: List[str]) -> List[str]:
    """The English Back as the card shows it: the headword line, then each part in `_ENGLISH_BACK_ORDER`, a blank line before
    each; any other line is dropped."""
    first_line = next((line.strip() for line in lines if line.strip()), "")
    if not first_line:
        return []
    parts = _english_back_parts(lines, first_line)
    ordered = [first_line]
    for key in _ENGLISH_BACK_ORDER:
        if parts.get(key):
            ordered.extend(["", parts[key]])
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


class _HiddenBlock:
    """A block of the Back the card does not show: its header line and the items right under it."""

    def __init__(self, header: re.Pattern[str], item: re.Pattern[str]) -> None:
        self.header = header
        self.item = item
        self.inside = False

    def hides(self, line: str) -> bool:
        """Whether the card hides `line`: the header or an item right under it; a blank line or any other line ends the
        block."""
        if self.header.match(line):
            self.inside = True
        else:
            self.inside = self.inside and self.item.match(line) is not None
        return self.inside


def _is_image_prompt_or_media(line: str) -> bool:
    low = line.lower()
    return low.startswith(_IMAGE_PROMPT_PREFIXES) or any(marker in low for marker in _MEDIA_MARKERS)


def _colored_literal(line: str, alignments: List[tuple[str, str]]) -> str:
    """A Russian card's `Literal:` line with each English chunk of the Alignment in the colour of its pair."""
    match = _LITERAL_RE.match(line) if alignments else None
    if not match:
        return line
    return match.group(1) + _apply_chunk_colors(match.group(2).strip(), [en for _, en in alignments], ignore_case=True)


def _back_text(content: str) -> str:
    """The text under the `Back` label, or every line after the first one when the card has no such label."""
    match = _BACK_RE.search(content)
    text = match.group(1).strip() if match else ""
    if not text:
        lines = [line for line in content.splitlines() if line.strip()]
        text = "\n".join(lines[1:]) if len(lines) > 1 else ""
        if text:
            LOGGER.warning("'Back' not found - using rest of file as back.")
        else:
            _log_raw("_build_back FAILED", content)
    return re.sub(r"🔊.*", "", text).strip()


def _shown_back_lines(text: str, alignments: List[tuple[str, str]]) -> List[str]:
    """The stripped lines of the Back the card shows: without the Alignment, the image search queries, the image prompt and
    the media file names. The hidden parts are asked in this order, and the first that hides a line ends the asking."""
    hidden_parts = (
        _HiddenBlock(_ALIGNMENT_HEADER_RE, _ALIGNMENT_LINE_RE).hides,
        _HiddenBlock(_IMAGE_QUERIES_HEADER_RE, _LIST_ITEM_RE).hides,
        _is_image_prompt_or_media,
    )
    shown: List[str] = []
    for line in text.splitlines():
        stripped = line.strip()
        if any(hides(stripped) for hides in hidden_parts):
            continue
        shown.append(_colored_literal(stripped, alignments))
    return shown


def _back_block_html(block: str) -> str:
    """A paragraph of the Back: a bold `label:` line keeps its lines apart, any other paragraph becomes one line."""
    block_lines = block.strip().split("\n")
    if len(block_lines) > 1 and _BOLD_LABEL_RE.match(block_lines[0]):
        return block_lines[0] + "<br>" + "<br>".join(block_lines[1:])
    return " ".join(block_lines)


def _back_html(lines: List[str], word_audio_name: Optional[str], image_name: Optional[str]) -> str:
    """The Back field's HTML from its shown lines: the first line with the word audio, the paragraphs, the image last."""
    html_lines = _md_to_html("\n".join(lines)).splitlines()
    first_line = html_lines[0] if html_lines else ""
    rest_html = "<br><br>".join(_back_block_html(block) for block in "\n".join(html_lines[1:]).split("\n\n"))
    audio = f" [sound:{word_audio_name}]" if word_audio_name else ""
    back = f"{first_line}{audio}<br>{rest_html.lstrip('<br>').lstrip()}"
    if image_name:
        back += f'<br><br><img src="{image_name}">'
    return back.replace("\n", "<br>")


def _build_back(
    content: str,
    word_audio_name: Optional[str],
    image_name: Optional[str] = None,
    lang: str = "en",
) -> str:
    """The Back field's HTML; without `word_audio_name` or `image_name` the audio or the image is left out. Russian colours
    the Literal line with the Alignment pairs, English puts its parts in the card's order."""
    alignments = _extract_alignments(content) if lang == "ru" else []
    lines = _shown_back_lines(_back_text(content), alignments)
    if lang == "en":
        lines = _reorder_english_back_lines(lines)
    return _back_html(lines, word_audio_name, image_name)


class CardMedia(NamedTuple):
    """The media file names a note cites; one without a name is left out (the Anki add-on's first card is text only, #142)."""

    phrase_audio: Optional[str] = None
    word_audio: Optional[str] = None
    image: Optional[str] = None


def card_fields(content: str, lang: str, media: CardMedia = CardMedia()) -> Dict[str, object]:
    """The note a card .txt becomes: `front` and `back` HTML, the `normalized_front` the duplicate search compares and
    the `tags`."""
    content = content.replace("## Anki Card", "").strip()
    front = _build_front(content, media.phrase_audio, lang=lang)
    return {
        "front": front,
        "back": _build_back(content, media.word_audio, media.image, lang=lang),
        "normalized_front": _normalize_front_text(front, lang),
        "tags": _extract_tags_from_card(content),
    }


def normalize_front(text: str, lang: str) -> str:
    """A Front field as the duplicate search compares it (HTML, sound tags and case gone; Russian ё → е)."""
    return _normalize_front_text(text, lang)

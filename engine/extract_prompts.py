"""
extract_prompts.py - Extract image-generation prompts from card .txt files.

Reads Output/{stem}.txt for every expected CardJob and writes keyword:prompt
lines to prompts.txt. Skips files from previous runs (stem not in current jobs).

Real-image search queries are read directly from the card file later in the
pipeline because each card can now contain multiple search queries. This module
keeps prompts.txt focused on the fallback generated-image prompt, but still
emits a line for cards that only expose search queries so they stay in the
image pipeline.
"""

import re
from itertools import takewhile
from pathlib import Path
from typing import List, Optional

if __package__:  # inside the Anki add-on the engine is the package `complemento.motor`
    from .config_loader import load_config
    from .parser import get_card_jobs, parse_mining_file
else:
    from config_loader import load_config
    from parser import get_card_jobs, parse_mining_file


_QUERY_HEADING_RE = re.compile(
    r"^(google image search queries|image search queries)\s*:\s*$",
    re.IGNORECASE,
)
_NEXT_LABEL_RE = re.compile(r"^[A-Za-z][A-Za-z ]+:")
_LIST_MARKER_RE = re.compile(r"^(?:[-*]|\d+[.)]|[A-Da-d][.)])\s*(.+)$")
_IMAGE_LINE_RE = re.compile(r"\*{0,2}Image:\*{0,2}\s*(.+)", re.IGNORECASE)
_SINGLE_QUERY_LINE_RE = re.compile(
    r"\*{0,2}(?:Google Image Search|Image Search Query):\*{0,2}\s*(.+)",
    re.IGNORECASE,
)
_NO_VALUE = ("none", "none.", "n/a")


def _usable_value(raw: str) -> Optional[str]:
    value = raw.strip().rstrip("*").strip()
    if not value or value.lower() in _NO_VALUE:
        return None
    return value


def _value_of_line(pattern: re.Pattern, content: str) -> Optional[str]:
    match = pattern.search(content)
    return _usable_value(match.group(1)) if match else None


def _is_query_heading(line: str) -> bool:
    return bool(_QUERY_HEADING_RE.match(line.strip().strip("*").strip()))


def _query_of_list_line(raw: str) -> str:
    bare = raw.strip("*").strip()
    marker = _LIST_MARKER_RE.match(bare)
    return (marker.group(1) if marker else bare).strip()


def _continues_query_block(raw: str) -> bool:
    return bool(raw) and not _NEXT_LABEL_RE.match(raw)


def _first_query_after_heading(content: str) -> Optional[str]:
    lines = content.splitlines()
    heading = next((idx for idx, line in enumerate(lines) if _is_query_heading(line)), None)
    if heading is None:
        return None
    block = takewhile(_continues_query_block, (line.strip() for line in lines[heading + 1 :]))
    return next((query for query in map(_query_of_list_line, block) if query), None)


def _extract_image_prompt(content: str) -> Optional[str]:
    return _value_of_line(_IMAGE_LINE_RE, content)


def _extract_first_search_query(content: str) -> Optional[str]:
    return _first_query_after_heading(content) or _value_of_line(_SINGLE_QUERY_LINE_RE, content)


def card_prompt(content: str) -> str:
    """The image prompt of one card's text: its `Image:` line, else its first search query, else ''."""
    return _extract_image_prompt(content) or _extract_first_search_query(content) or ""


def _expected_stems(entries) -> set:
    return {job.filename_stem.lower() for entry in entries for job in get_card_jobs(entry)}


def _prompt_lines(output_dir: Path, expected_stems_lower: set) -> List[str]:
    return [
        f"{card_file.stem}:{card_prompt(card_file.read_text(encoding='utf-8'))}"
        for card_file in output_dir.glob("*.txt")
        if card_file.stem.lower() in expected_stems_lower
    ]


def run(entries, config: dict) -> int:
    """Return the number of prompts written to prompts.txt."""
    entries_out = _prompt_lines(Path(config["paths"]["output_dir"]), _expected_stems(entries))
    Path(config["paths"]["prompts_file"]).write_text("\n".join(entries_out), encoding="utf-8")
    return len(entries_out)


if __name__ == "__main__":
    cfg = load_config()
    mining_entries = parse_mining_file(Path(cfg["paths"]["mining_file"]))
    count = run(mining_entries, cfg)
    print(f"prompts.txt created with {count} entries.")

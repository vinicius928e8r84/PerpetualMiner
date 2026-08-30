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
from pathlib import Path
from typing import List, Optional

from config_loader import load_config
from parser import get_card_jobs, parse_mining_file


_QUERY_HEADING_RE = re.compile(
    r"^(google image search queries|image search queries)\s*:\s*$",
    re.IGNORECASE,
)


def _extract_image_prompt(content: str) -> Optional[str]:
    image_match = re.search(
        r"\*{0,2}Image:\*{0,2}\s*(.+)",
        content,
        re.IGNORECASE,
    )
    if not image_match:
        return None

    prompt = image_match.group(1).strip().rstrip("*").strip()
    if not prompt or prompt.lower() in ("none", "none.", "n/a"):
        return None
    return prompt


def _extract_first_search_query(content: str) -> Optional[str]:
    lines = [line.rstrip() for line in content.splitlines()]
    for idx, line in enumerate(lines):
        clean = line.strip().strip("*").strip()
        if not _QUERY_HEADING_RE.match(clean):
            continue

        for next_line in lines[idx + 1 :]:
            raw = next_line.strip()
            if not raw:
                break
            if re.match(r"^[A-Za-z][A-Za-z ]+:", raw):
                break
            raw = raw.strip("*").strip()
            match = re.match(r"^(?:[-*]|\d+[.)]|[A-Da-d][.)])\s*(.+)$", raw)
            query = (match.group(1) if match else raw).strip()
            if query:
                return query
        break

    single_line = re.search(
        r"\*{0,2}(?:Google Image Search|Image Search Query):\*{0,2}\s*(.+)",
        content,
        re.IGNORECASE,
    )
    if single_line:
        query = single_line.group(1).strip().rstrip("*").strip()
        if query and query.lower() not in ("none", "none.", "n/a"):
            return query
    return None


def run(entries, config: dict) -> int:
    """Return the number of prompts written to prompts.txt."""
    output_dir = Path(config["paths"]["output_dir"])
    prompts_file = Path(config["paths"]["prompts_file"])

    # Compare case-insensitively because generate_cards.py normalizes stems.
    all_jobs = []
    for entry in entries:
        all_jobs.extend(get_card_jobs(entry))
    expected_stems_lower = {job.filename_stem.lower() for job in all_jobs}

    entries_out: List[str] = []
    for card_file in output_dir.glob("*.txt"):
        stem = card_file.stem
        if stem.lower() not in expected_stems_lower:
            continue

        content = card_file.read_text(encoding="utf-8")
        prompt = _extract_image_prompt(content) or _extract_first_search_query(content) or ""
        entries_out.append(f"{stem}:{prompt}")

    prompts_file.write_text("\n".join(entries_out), encoding="utf-8")
    return len(entries_out)


if __name__ == "__main__":
    cfg = load_config()
    mining_entries = parse_mining_file(Path(cfg["paths"]["mining_file"]))
    count = run(mining_entries, cfg)
    print(f"prompts.txt created with {count} entries.")

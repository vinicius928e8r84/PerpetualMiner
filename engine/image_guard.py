"""
image_guard.py — Decide whether a keyword/prompt deserves an image.

Rules (in order):
  1. If the keyword is a known abstract pattern (phrasal verb, idiom marker,
     abstract noun suffix, etc.) → skip image entirely.
  2. Ask GPT-4o-mini to classify: concrete-visual (C) or abstract (A).
     One token answer, very cheap (~0.001 cents per call).
  3. Return True (generate image) only for C.

The GPT call is the safety net for edge cases the heuristics miss.
"""

import re
from typing import Optional

if __package__:  # inside the Anki add-on the engine is the package `complemento.motor`
    from . import cost_tracker, provedores
else:
    import cost_tracker
    import provedores

_ABSTRACT_PATTERNS = [
    r"\b(to|at|in|on|of|for|with|by|from|into|onto|out of|up to)\b.*\b(someone|sb|sth)\b",
    r"^(strike|hit|make|take|give|get|put|keep|break|bring|come|go|run|set|turn|fall|hold|pull|push|cut|let|lay|pay|play|stand|work)\b.+\b(a|an|the)?\b\w+$",
    r"\b(feeling|sense|notion|concept|idea|attitude|approach|tendency|tendency|principle|aspect|factor|issue|matter|thing|way|means|basis|purpose|reason|result|effect|impact|influence|role|part|case|point|question|problem|solution|process|method|system|pattern|relationship|connection|link|difference|similarity|contrast|comparison)\b",
]

_ABSTRACT_SUFFIXES = (
    "ness", "tion", "sion", "ment", "ity", "ance", "ence",
    "hood", "ship", "ism", "ology", "graphy",
)

_ABSTRACT_EXACT = {
    "plain", "blatant", "canvassers", "salesmanship", "over-influence",
    "attempt", "goods", "handicap", "strike a chord",
    "get away with", "make up for", "put up with", "come across",
    "turn out", "figure out", "give up", "bring up", "look into",
}


def _heuristic(keyword: str) -> Optional[bool]:
    """
    Returns True  → definitely concrete (fast-allow)
    Returns False → definitely abstract (fast-reject)
    Returns None  → uncertain, needs GPT
    """
    kw = keyword.lower().strip()

    if kw in _ABSTRACT_EXACT:
        return False

    if kw.endswith(_ABSTRACT_SUFFIXES):
        return False

    if _matches_an_abstract_pattern(kw):
        return False

    return None


def _matches_an_abstract_pattern(kw: str) -> bool:
    return any(re.search(pat, kw, re.IGNORECASE) for pat in _ABSTRACT_PATTERNS)


_SYSTEM = (
    "You are a classifier. Given a word or phrase, reply with exactly one letter:\n"
    "C — if it refers to something concrete and visually depictable in a photo "
    "(e.g. bicycle, knife, sunset, broken window)\n"
    "A — if it is abstract, idiomatic, emotional, or hard to show in a single image "
    "(e.g. strike a chord, resilience, put up with, salesmanship)\n"
    "Reply only C or A. No other text."
)


def should_generate_image(
    keyword: str,
    pela_chave,
    log_dir: str = "log",
    label: Optional[str] = None,
) -> bool:
    """`pela_chave` is the key bound to its provider (`provedores.PelaChave`). `label` is what the cost record says the call was for
    (the word by default; the add-on passes the card's id)."""
    fast = _heuristic(keyword)
    if fast is not None:
        return fast

    try:
        verdict, usage = pela_chave.texto(
            "gpt-4o-mini",
            _SYSTEM,
            keyword,
            temperatura=0,
            max_tokens=1,
            repeticoes=provedores.REPETICOES_DA_IMAGEM,
        )

        _record_the_check(log_dir, usage, label or keyword)

        return verdict.upper() == "C"
    except Exception:
        return True


def _record_the_check(log_dir: str, usage: dict, label: str) -> None:
    if usage:
        cost_tracker.record_tokens(
            log_dir,
            model="gpt-4o-mini",
            input_tokens=usage.get("entrada", 0),
            output_tokens=usage.get("saida", 0),
            keyword=f"[image_guard] {label}",
        )

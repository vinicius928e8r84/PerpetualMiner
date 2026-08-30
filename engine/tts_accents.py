from __future__ import annotations

from gtts.accents import accents as GTTS_TLDS


_FRIENDLY_LABELS = {
    "com": "Global / US-like",
    "co.uk": "United Kingdom",
    "com.au": "Australia",
    "ca": "Canada",
    "ie": "Ireland",
    "co.in": "India",
    "co.za": "South Africa",
    "ru": "Russia",
    "com.ua": "Ukraine",
    "kz": "Kazakhstan",
}


def supported_tlds() -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for tld in GTTS_TLDS:
        if tld not in seen:
            ordered.append(tld)
            seen.add(tld)
    return ordered


def friendly_label(tld: str) -> str:
    return _FRIENDLY_LABELS.get(tld, tld)


def default_recommended(lang: str) -> list[str]:
    if lang == "ru":
        preferred = ["ru", "com", "com.ua", "kz"]
    else:
        preferred = ["com", "co.uk", "com.au", "ca", "ie", "co.in", "co.za"]
    known = set(supported_tlds())
    return [tld for tld in preferred if tld in known]

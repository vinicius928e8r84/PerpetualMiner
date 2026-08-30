"""
google_images.py - Fetch real photo candidates from Openverse.

The old public API `fetch(query, dest) -> bool` is preserved, but the module now
also exposes candidate search/download helpers so the pipeline can judge several
real images before deciding whether to keep one or fall back to generation.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import requests

from image_utils import UnsupportedImageFormatError, normalize_image_bytes


_HEADERS = {
    "User-Agent": "PerpetualMiner/1.0 (Anki flashcard generator)"
}

_OPENVERSE_URL = "https://api.openverse.org/v1/images/"


def search_candidates(query: str, limit: int = 8) -> list[dict[str, Any]]:
    """Return Openverse image candidates with basic metadata."""
    try:
        r = requests.get(
            _OPENVERSE_URL,
            params={
                "q": query,
                "page_size": limit,
                "license_type": "all",
                "mature": "false",
            },
            headers=_HEADERS,
            timeout=20,
        )
        if r.status_code != 200:
            return []

        data = r.json()
        out: list[dict[str, Any]] = []
        for item in data.get("results", []):
            url = item.get("url") or item.get("thumbnail")
            thumb = item.get("thumbnail") or url
            if not url:
                continue
            out.append({
                "url": url,
                "thumbnail": thumb,
                "title": item.get("title") or "",
                "creator": item.get("creator") or "",
                "source": "openverse",
                "query": query,
                "width": item.get("width") or 0,
                "height": item.get("height") or 0,
                "license": item.get("license") or "",
            })
        return out
    except Exception:
        return []


def download_candidate(candidate: dict[str, Any], dest: Path) -> bool:
    """Download one candidate image to *dest* as normalized PNG bytes."""
    for key in ("url", "thumbnail"):
        url = candidate.get(key)
        if not url:
            continue
        try:
            r = requests.get(url, headers=_HEADERS, timeout=20)
            if r.status_code != 200 or len(r.content) < 32:
                continue
            try:
                data, _ = normalize_image_bytes(r.content, target_format="PNG")
            except UnsupportedImageFormatError:
                continue
            dest.write_bytes(data)
            return True
        except Exception:
            continue
    return False


def fetch(query: str, dest: Path) -> bool:
    """Download the first usable image for *query* to *dest*."""
    for candidate in search_candidates(query):
        if download_candidate(candidate, dest):
            return True
    return False

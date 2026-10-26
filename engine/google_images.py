"""
google_images.py - Fetch real photo candidates from Openverse.

The old public API `fetch(query, dest) -> bool` is preserved, but the module now
also exposes candidate search/download helpers so the pipeline can judge several
real images before deciding whether to keep one or fall back to generation.

Standard library only (urllib), so it also runs inside the Anki add-on (`complemento/motor`). The Openverse
address is passed by code (`openverse_base`), like OpenAI's; a download is read up to `LIMITE_DA_FOTO` bytes.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

if __package__:  # inside the Anki add-on the engine is the package `complemento.motor`
    from . import openai_http
    from .image_utils import UnsupportedImageFormatError, normalize_image_bytes
else:
    import openai_http
    from image_utils import UnsupportedImageFormatError, normalize_image_bytes


_HEADERS = {
    "User-Agent": "PerpetualMiner/1.0 (Anki flashcard generator)"
}

OPENVERSE_BASE = "https://api.openverse.org"
TEMPO_DO_PEDIDO = 20
LIMITE_DA_FOTO = 25 * 1024 * 1024  # bigger than this is not a card's picture; the thumbnail is tried instead


def _ler(url: str, limite: int) -> bytes | None:
    """GET `url`; the body (at most `limite` bytes) if the answer is 200, else None. Only http(s): urllib would also open `file:` and `ftp:`."""
    if urllib.parse.urlsplit(url).scheme not in ("http", "https"):
        return None
    pedido = urllib.request.Request(url, headers=_HEADERS)
    try:
        with urllib.request.urlopen(pedido, timeout=TEMPO_DO_PEDIDO, context=openai_http.contexto_tls()) as resposta:
            if resposta.status != 200:
                return None
            corpo = resposta.read(limite + 1)
    except urllib.error.HTTPError as erro:
        erro.close()
        return None
    return corpo if len(corpo) <= limite else None


def search_candidates(query: str, limit: int = 8, openverse_base: str = OPENVERSE_BASE) -> list[dict[str, Any]]:
    """Return Openverse image candidates with basic metadata."""
    try:
        busca = urllib.parse.urlencode({"q": query, "page_size": limit, "license_type": "all", "mature": "false"})
        corpo = _ler(openverse_base + "/v1/images/?" + busca, 5 * 1024 * 1024)
        if corpo is None:
            return []

        data = json.loads(corpo.decode("utf-8"))
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
            content = _ler(url, LIMITE_DA_FOTO)
            if content is None or len(content) < 32:
                continue
            try:
                data, _ = normalize_image_bytes(content, target_format="PNG")
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

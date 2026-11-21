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
    from .image_utils import normalize_image_bytes
else:
    import openai_http
    from image_utils import normalize_image_bytes


_HEADERS = {
    "User-Agent": "PerpetualMiner/1.0 (Anki flashcard generator)"
}

OPENVERSE_BASE = "https://api.openverse.org"
TEMPO_DO_PEDIDO = 20
LIMITE_DA_FOTO = 25 * 1024 * 1024
DADO_QUE_FALTA = {"title": "", "creator": "", "width": 0, "height": 0, "license": ""}


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
        resultados = json.loads(corpo.decode("utf-8")).get("results", [])
        return [candidata for candidata in (_candidata(item, query) for item in resultados) if candidata]
    except Exception:
        return []


def _candidata(item: dict[str, Any], query: str) -> dict[str, Any] | None:
    """The candidate one Openverse result makes, or None when it has neither an address nor a thumbnail."""
    url = item.get("url") or item.get("thumbnail")
    if not url:
        return None
    return {
        "url": url,
        "thumbnail": item.get("thumbnail") or url,
        "title": _dado(item, "title"),
        "creator": _dado(item, "creator"),
        "source": "openverse",
        "query": query,
        "width": _dado(item, "width"),
        "height": _dado(item, "height"),
        "license": _dado(item, "license"),
    }


def _dado(item: dict[str, Any], campo: str) -> Any:
    """The `campo` of an Openverse result, or what it is worth when Openverse leaves it out or empty (`DADO_QUE_FALTA`)."""
    return item.get(campo) or DADO_QUE_FALTA[campo]


def download_candidate(candidate: dict[str, Any], dest: Path) -> bool:
    """Download one candidate image to *dest* as normalized PNG bytes."""
    return any(_gravou_a_foto(url, dest) for url in map(candidate.get, ("url", "thumbnail")) if url)


def _gravou_a_foto(url: str, dest: Path) -> bool:
    """Whether the photo at `url` came, is a raster image of at least 32 bytes and was written to `dest` as PNG.
    Anything that fails on the way (the request, the conversion, the write) is a photo not had."""
    try:
        conteudo = _ler(url, LIMITE_DA_FOTO)
        if conteudo is None or len(conteudo) < 32:
            return False
        dest.write_bytes(normalize_image_bytes(conteudo, target_format="PNG")[0])
        return True
    except Exception:
        return False


def fetch(query: str, dest: Path) -> bool:
    """Download the first usable image for *query* to *dest*."""
    for candidate in search_candidates(query):
        if download_candidate(candidate, dest):
            return True
    return False

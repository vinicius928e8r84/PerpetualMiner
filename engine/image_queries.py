"""
image_queries.py - What to search for a card's picture: the queries, the visual subject and the card's phrase and context.

Pure text functions (standard library only), used by the image pipeline (`image_pipeline.py`) in the Anki add-on.
"""

import re


_IMAGE_QUERY_STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "with", "without", "for", "from",
    "into", "onto", "over", "under", "near", "beside", "behind", "inside",
    "outside", "through", "across", "against", "between", "among", "in",
    "on", "at", "of", "to", "by", "as", "is", "are", "was", "were", "be",
    "being", "been", "this", "that", "these", "those", "their", "them",
    "they", "he", "she", "his", "her", "its", "it", "someone", "person",
    "people", "man", "woman", "standing", "sitting", "looking", "wearing",
    "holding", "showing", "appearing", "scene", "setting", "simple",
    "room", "cartoon", "realistic", "photo", "image", "background", "text",
    "like", "if", "while", "as_if",
}


def _normalize_image_query(query: str) -> str:
    query = re.sub(r"^[\-\u2013\u2014]\s*", "", (query or "").strip())
    query = re.sub(r"[*_`]+", " ", query)
    query = re.sub(r"\s+", " ", query)
    return query.strip(" .,!?:;\"'()[]{}")


def _image_query_content_terms(query: str) -> list[str]:
    clean = _normalize_image_query(query)
    if not clean:
        return []
    words = re.sub(r"[^A-Za-z0-9\s]", " ", clean).lower()
    words = re.sub(r"\s+", " ", words).strip().split()
    terms = [w for w in words if len(w) > 2 and w not in _IMAGE_QUERY_STOPWORDS]
    deduped: list[str] = []
    seen: set[str] = set()
    for term in terms:
        if term not in seen:
            deduped.append(term)
            seen.add(term)
    return deduped


def _english_query_variants_from_text(query: str) -> list[str]:
    clean = _normalize_image_query(query)
    if not clean:
        return []

    variants = [clean]
    no_punct = re.sub(r"[^A-Za-z0-9\s]", " ", clean)
    no_punct = re.sub(r"\s+", " ", no_punct).strip()
    if no_punct and no_punct.casefold() != clean.casefold():
        variants.append(no_punct)

    words = [w for w in no_punct.split() if len(w) > 2]
    if len(words) >= 2:
        for size in (4, 3, 2):
            if len(words) >= size:
                for i in range(len(words) - size + 1):
                    variants.append(" ".join(words[i:i + size]))
    content_words = _image_query_content_terms(clean)
    if content_words:
        variants.append(" ".join(content_words[:2]))
        variants.append(" ".join(content_words[:3]))
        variants.append(" ".join(content_words[:4]))
        if len(content_words) >= 2:
            variants.append(f"{content_words[0]} {content_words[-1]}")
    if words:
        variants.append(" ".join(sorted(words, key=len, reverse=True)[:3]))
    if len(words) > 5:
        variants.append(" ".join(words[:5]))
    if len(words) > 6:
        variants.append(" ".join(words[:4]))
        variants.append(" ".join(words[-4:]))

    deduped: list[str] = []
    seen: set[str] = set()
    for variant in variants:
        key = variant.casefold()
        if variant and key not in seen:
            deduped.append(variant)
            seen.add(key)
    return deduped


def _extract_multiline_image_queries(content: str) -> list[str]:
    lines = [line.rstrip() for line in (content or "").splitlines()]
    headings = {
        "google image search queries:",
        "image search queries:",
    }
    queries: list[str] = []

    for idx, line in enumerate(lines):
        clean = line.strip().strip("*").strip()
        if clean.lower() not in headings:
            continue

        for next_line in lines[idx + 1:]:
            raw = next_line.strip()
            if not raw:
                break
            if re.match(r"^[A-Za-z][A-Za-z ]+:", raw):
                break
            raw = raw.strip("*").strip()
            match = re.match(r"^(?:[-*]|\d+[.)]|[A-Da-d][.)])\s*(.+)$", raw)
            query = (match.group(1) if match else raw).strip()
            query = _normalize_image_query(query)
            if query and query.lower() not in ("none", "none.", "n/a"):
                queries.append(query)
        break
    return queries


def _image_field_value(content: str, pattern: str) -> str:
    match = re.search(pattern, content or "", re.IGNORECASE)
    if not match:
        return ""
    return match.group(1).strip().rstrip("*").strip()


def _build_card_google_queries(
    card_text: str,
    stem: str = "",
    prompt: str = "",
    lang: str = "en",
    max_queries: int = 8,
) -> list[str]:
    is_ru = lang == "ru"
    queries: list[str] = []

    queries.extend(_extract_multiline_image_queries(card_text))

    for pattern in (
        r"\*{0,2}Google Image Search:\*{0,2}\s*(.+)",
        r"\*{0,2}Image Search Query:\*{0,2}\s*(.+)",
    ):
        value = _image_field_value(card_text, pattern)
        if value and value.lower() not in ("none", "none.", "n/a"):
            queries.append(value)

    if len(queries) < max_queries:
        image_prompt = _image_field_value(card_text, r"\*{0,2}Image:\*{0,2}\s*(.+)")
        if image_prompt and image_prompt.lower() not in ("none", "none.", "n/a"):
            queries.extend(_english_query_variants_from_text(image_prompt))

        for pattern in (
            r"Translation:\s*([^\n]+)",
            r"Literal:\s*([^\n]+)",
            r"Natural:\s*([^\n]+)",
            r"Gist:\s*([^\n]+)",
            r"Definition:\s*([^\n]+)",
            r"Simple meaning:\s*([^\n]+)",
        ):
            value = _image_field_value(card_text, pattern)
            if value:
                queries.extend(_english_query_variants_from_text(value))

        back_value = _image_field_value(card_text, r"Back:\s*\*{0,2}([^*\n/]+)")
        if back_value:
            queries.extend(_english_query_variants_from_text(back_value) if is_ru else [back_value])

        front_value = _image_field_value(card_text, r"Front:?\s*([^\n]+)")
        if front_value and not is_ru:
            queries.append(front_value)

        if stem and not is_ru:
            queries.append(stem.replace("_", " ").strip())

        if prompt:
            queries.extend(_english_query_variants_from_text(prompt))

    deduped: list[str] = []
    seen: set[str] = set()
    for query in queries:
        clean = _normalize_image_query(query.strip(" -*\t\r\n"))
        key = clean.casefold()
        if clean and key not in seen:
            deduped.append(clean)
            seen.add(key)
    return deduped[:max_queries] if deduped else []


def _visual_subject_for_card(card_text: str, stem: str, prompt: str) -> str:
    explicit_queries = _extract_multiline_image_queries(card_text)
    if explicit_queries:
        return explicit_queries[0]
    for pattern in (
        r"\*{0,2}Image Search Query:\*{0,2}\s*(.+)",
        r"\*{0,2}Google Image Search:\*{0,2}\s*(.+)",
        r"Back:\s*\*{0,2}([^*\n/]+)",
    ):
        value = _image_field_value(card_text, pattern)
        if value and value.lower() not in ("none", "none.", "n/a"):
            return value
    return prompt or stem.replace("_", " ")


def _card_phrase_and_context_from_text(content: str) -> tuple[str, str]:
    front_match = re.search(
        r"\*{0,2}Front:?\*{0,2}\s*(.*?)\s*(?=\*{0,2}Back:?\*{0,2}|\Z)",
        content or "",
        re.IGNORECASE | re.DOTALL,
    )
    phrase = front_match.group(1).strip() if front_match else ""
    phrase = re.sub(r"\*+", "", phrase)
    ctx_match = re.search(r"Source\s+Context:\s*(.+)", content or "", re.IGNORECASE)
    context = ctx_match.group(1).strip() if ctx_match else ""
    return phrase, context

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


_NO_QUERY = ("none", "none.", "n/a")
_QUERY_HEADINGS = {
    "google image search queries:",
    "image search queries:",
}
_WINDOW_SIZES = (4, 3, 2)
_SEARCH_FIELDS = (
    r"\*{0,2}Google Image Search:\*{0,2}\s*(.+)",
    r"\*{0,2}Image Search Query:\*{0,2}\s*(.+)",
)
_IMAGE_FIELD = r"\*{0,2}Image:\*{0,2}\s*(.+)"
_MEANING_FIELDS = (
    r"Translation:\s*([^\n]+)",
    r"Literal:\s*([^\n]+)",
    r"Natural:\s*([^\n]+)",
    r"Gist:\s*([^\n]+)",
    r"Definition:\s*([^\n]+)",
    r"Simple meaning:\s*([^\n]+)",
)
_BACK_FIELD = r"Back:\s*\*{0,2}([^*\n/]+)"
_FRONT_FIELD = r"Front:?\s*([^\n]+)"


def _is_a_query(value: str) -> bool:
    return bool(value) and value.lower() not in _NO_QUERY


def _without_punctuation(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^A-Za-z0-9\s]", " ", text)).strip()


def _unique_ignoring_case(texts: list[str]) -> list[str]:
    unique: list[str] = []
    seen: set[str] = set()
    for text in texts:
        key = text.casefold()
        if text and key not in seen:
            unique.append(text)
            seen.add(key)
    return unique


def _english_query_variants_from_text(query: str) -> list[str]:
    clean = _normalize_image_query(query)
    if not clean:
        return []
    no_punct = _without_punctuation(clean)
    words = [w for w in no_punct.split() if len(w) > 2]
    variants = [clean] + _punctuation_free_variant(clean, no_punct) + _word_windows(words)
    variants += _content_word_variants(_image_query_content_terms(clean)) + _longest_words(words) + _first_five_words(words)
    return _unique_ignoring_case(variants)


def _punctuation_free_variant(clean: str, no_punct: str) -> list[str]:
    differs = no_punct.casefold() != clean.casefold()
    return [no_punct] if no_punct and differs else []


def _word_windows(words: list[str]) -> list[str]:
    return [" ".join(words[i:i + size]) for size in _WINDOW_SIZES for i in range(len(words) - size + 1)]


def _content_word_variants(content_words: list[str]) -> list[str]:
    if not content_words:
        return []
    variants = [" ".join(content_words[:size]) for size in (2, 3, 4)]
    if len(content_words) >= 2:
        variants.append(f"{content_words[0]} {content_words[-1]}")
    return variants


def _longest_words(words: list[str]) -> list[str]:
    return [" ".join(sorted(words, key=len, reverse=True)[:3])] if words else []


def _first_five_words(words: list[str]) -> list[str]:
    return [" ".join(words[:5])] if len(words) > 5 else []


def _extract_multiline_image_queries(content: str) -> list[str]:
    lines = [line.rstrip() for line in (content or "").splitlines()]
    heading = next((idx for idx, line in enumerate(lines) if _is_a_query_heading(line)), None)
    if heading is None:
        return []
    return _queries_of_the_block(lines[heading + 1:])


def _is_a_query_heading(line: str) -> bool:
    return line.strip().strip("*").strip().lower() in _QUERY_HEADINGS


def _queries_of_the_block(lines: list[str]) -> list[str]:
    queries = [_query_of_the_line(raw) for raw in _lines_of_the_query_block(lines)]
    return [query for query in queries if _is_a_query(query)]


def _lines_of_the_query_block(lines: list[str]) -> list[str]:
    block = []
    for line in lines:
        raw = line.strip()
        if not raw or re.match(r"^[A-Za-z][A-Za-z ]+:", raw):
            break
        block.append(raw)
    return block


def _query_of_the_line(raw: str) -> str:
    raw = raw.strip("*").strip()
    match = re.match(r"^(?:[-*]|\d+[.)]|[A-Da-d][.)])\s*(.+)$", raw)
    return _normalize_image_query((match.group(1) if match else raw).strip())


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
    queries = _extract_multiline_image_queries(card_text) + _search_field_queries(card_text)
    if len(queries) < max_queries:
        queries += _queries_from_the_meaning(card_text, is_ru) + _queries_from_the_words(card_text, stem, is_ru)
        queries += _english_query_variants_from_text(prompt)
    return _unique_ignoring_case([_normalize_image_query(query.strip(" -*\t\r\n")) for query in queries])[:max_queries]


def _search_field_queries(card_text: str) -> list[str]:
    values = [_image_field_value(card_text, pattern) for pattern in _SEARCH_FIELDS]
    return [value for value in values if _is_a_query(value)]


def _queries_from_the_meaning(card_text: str, is_ru: bool) -> list[str]:
    image_prompt = _image_field_value(card_text, _IMAGE_FIELD)
    queries = _english_query_variants_from_text(image_prompt) if _is_a_query(image_prompt) else []
    for pattern in _MEANING_FIELDS:
        queries += _english_query_variants_from_text(_image_field_value(card_text, pattern))
    back_value = _image_field_value(card_text, _BACK_FIELD)
    return queries + (_english_query_variants_from_text(back_value) if is_ru else [back_value])


def _queries_from_the_words(card_text: str, stem: str, is_ru: bool) -> list[str]:
    if is_ru:
        return []
    return [_image_field_value(card_text, _FRONT_FIELD), stem.replace("_", " ").strip() if stem else ""]


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
        if _is_a_query(value):
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

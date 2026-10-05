"""A leitura do vocabulário e dos números de um Baralho: as funções puras, sem I/O e sem estado.

Vem de `bridge/card_normalization.py`, que a Conexão de hoje (Windows) segue usando até o complemento
a substituir; o comportamento é o mesmo, só a biblioteca padrão e o Python 3.9. Quando o motor entrar
no complemento, este é o único lugar. O normalizador da frase russa (que no motor é `parser.normalize_ru_phrase`)
vem embutido em `normalizar_frase_ru`. Só entra aqui o que as leituras usam (o resto de `card_normalization.py`
fica no bridge).
"""

from __future__ import annotations

import re
from typing import Any, Callable

NormalizeRu = Callable[[str], str]

EN_LEMMA_EXCEPTIONS = {
    "children": "child",
    "feet": "foot",
    "goods": "goods",
    "men": "man",
    "people": "person",
    "teeth": "tooth",
    "women": "woman",
}


def _apply_normalize_ru(normalize_ru: NormalizeRu | None, text: str) -> str:
    """Aplica o normalizador RU injetado; se ausente, sinaliza para o fallback.

    Espelha exatamente o `self.modules["parser"].normalize_ru_phrase(text)` do
    original, que ficava dentro de um try/except Exception. Sem normalizador,
    levanta para que o caller caia no ramo de fallback regex identico.
    """
    if normalize_ru is None:
        raise RuntimeError("normalize_ru_unavailable")
    return str(normalize_ru(text))


def strip_anki_field(value: str) -> str:
    text = re.sub(r"<br\s*/?>", "\n", value or "", flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\[sound:[^\]]+\]", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def extract_bold_texts(value: str) -> list[str]:
    return [
        strip_anki_field(match.group(1))
        for match in re.finditer(r"<b\b[^>]*>(.*?)</b>", value or "", flags=re.IGNORECASE | re.DOTALL)
        if strip_anki_field(match.group(1))
    ]


def normalize_en_word(value: str) -> str:
    word = re.sub(r"[^a-z'-]", "", value.casefold()).strip("-'")
    if not word:
        return ""
    if word in EN_LEMMA_EXCEPTIONS:
        return EN_LEMMA_EXCEPTIONS[word]
    if word.endswith("'s"):
        word = word[:-2]
    if len(word) > 4 and word.endswith("ies"):
        return word[:-3] + "y"
    if len(word) > 5 and word.endswith("ves"):
        return word[:-3] + "f"
    if len(word) > 5 and word.endswith("ing"):
        base = word[:-3]
        if len(base) > 2 and base[-1] == base[-2]:
            base = base[:-1]
        return base
    if len(word) > 4 and word.endswith("ed"):
        base = word[:-2]
        if len(base) > 2 and base[-1] == base[-2]:
            base = base[:-1]
        if base and not base.endswith("e"):
            return base
        return base
    if len(word) > 3 and word.endswith("s") and not word.endswith(("ss", "us", "is")):
        return word[:-1]
    return word


def normalize_target_item(value: str, lang: str, normalize_ru: NormalizeRu | None = None) -> str:
    if lang == "ru":
        return normalize_term_identity(value, lang, normalize_ru)
    text = strip_anki_field(value).casefold()
    text = re.sub(r"'s\b", "", text)
    words: list[str] = []
    for match in re.finditer(r"[a-z]+(?:[-'][a-z]+)*", text):
        normalized = normalize_en_word(match.group(0))
        if normalized:
            words.append(normalized)
    return " ".join(words)


def extract_target_term(front: str, back: str, lang: str, normalize_ru: NormalizeRu | None = None) -> str:
    if lang == "ru":
        return normalize_term_identity(front, lang, normalize_ru)

    bold_texts = extract_bold_texts(front)
    if bold_texts:
        normalized = normalize_target_item(bold_texts[0], lang, normalize_ru)
        if normalized:
            return normalized

    plain_back = strip_anki_field(back)
    if plain_back:
        first_segment = re.split(r"\n|Definition:|Simple meaning:|Other example:|Trigger:", plain_back, maxsplit=1)[0]
        if not re.search(r"/[^/]+/", first_segment):
            return ""
        first_line = re.split(r"\n|Definition:|Simple meaning:|→|Other example:|Trigger:", plain_back, maxsplit=1)[0]
        first_line = re.sub(r"\s*[–-]\s*/.*$", "", first_line).strip()
        first_line = re.sub(r"\s*/.*$", "", first_line).strip()
        normalized = normalize_target_item(first_line, lang, normalize_ru)
        if normalized:
            return normalized

    return ""


def literal_front_words(front: str, lang: str) -> set[str]:
    text = strip_anki_field(front).casefold()
    if lang == "ru":
        text = text.replace("ё", "е").replace("Ё", "е")
        return {
            match.group(0)
            for match in re.finditer(r"[а-я]+(?:-[а-я]+)?", text, flags=re.IGNORECASE)
        }
    words: set[str] = set()
    for match in re.finditer(r"[\w]+(?:[-'][\w]+)*", text):
        word = match.group(0).strip("-'")
        if word and any(char.isalpha() for char in word) and not any(char.isdigit() or char == "_" for char in word):
            words.add(word)
    return words


def literal_term_from_text(value: str, lang: str) -> str:
    text = strip_anki_field(value).casefold()
    if lang == "ru":
        text = text.replace("ё", "е").replace("Ё", "е")
        return " ".join(match.group(0) for match in re.finditer(r"[а-я]+(?:-[а-я]+)?", text, flags=re.IGNORECASE))

    words: list[str] = []
    for match in re.finditer(r"[\w]+(?:[-'][\w]+)*", text):
        word = match.group(0).strip("-'")
        if word and any(char.isalpha() for char in word) and not any(char.isdigit() or char == "_" for char in word):
            words.append(word)
    return " ".join(words)


def literal_target_terms(front: str, back: str, lang: str, normalize_ru: NormalizeRu | None = None) -> set[str]:
    if lang == "ru":
        term = literal_term_from_text(front, lang)
        return {term} if term else set()

    terms = {
        term
        for term in (literal_term_from_text(value, lang) for value in extract_bold_texts(front))
        if term
    }
    if terms:
        return terms

    fallback = extract_target_term(front, back, lang, normalize_ru)
    return {fallback} if fallback else set()


def is_expression_term(value: str) -> bool:
    return len([part for part in re.split(r"\s+", value.strip()) if part]) > 1


def vocabulary_word_status(counts: dict[str, int]) -> str:
    new = counts.get("new", 0)
    recent = counts.get("recent", 0)
    mature = counts.get("mature", 0)
    active = sum(1 for value in [new, recent, mature] if value > 0)
    if active > 1:
        return "mixed"
    if mature:
        return "mature"
    if recent:
        return "recent"
    if new:
        return "new"
    return "seen"


def add_vocabulary_row(rows: dict[tuple[str, str], dict[str, Any]], value: str, item_type: str, status_bucket: str) -> None:
    key = (item_type, value)
    item = rows.setdefault(key, {
        "word": value,
        "type": item_type,
        "cards": 0,
        "new": 0,
        "recent": 0,
        "mature": 0,
        "status": "seen",
    })
    item["cards"] += 1
    item[status_bucket] += 1


def front_vocabulary_rows_from_cards(cards: list[dict[str, Any]], lang: str, normalize_ru: NormalizeRu | None = None) -> list[dict[str, Any]]:
    rows: dict[tuple[str, str], dict[str, Any]] = {}
    for card in cards:
        bucket = str(card.get("bucket") or "new")
        status_bucket = "recent" if bucket in {"learning", "young"} else bucket
        if status_bucket not in {"new", "recent", "mature"}:
            status_bucket = "new"

        front = str(card.get("front") or "")
        back = str(card.get("back") or "")
        for word in literal_front_words(front, lang):
            add_vocabulary_row(rows, word, "word", status_bucket)
        for term in literal_target_terms(front, back, lang, normalize_ru):
            if is_expression_term(term):
                add_vocabulary_row(rows, term, "term", status_bucket)

    for item in rows.values():
        item["status"] = vocabulary_word_status(item)
    return sorted(rows.values(), key=lambda item: (str(item["type"]) != "term", -int(item["cards"]), item["word"]))


def empty_vocab_stats() -> dict[str, Any]:
    return {
        "targetTerms": 0,
        "phraseVocabulary": 0,
        "newPhraseVocabulary": 0,
        "avgNewPhraseVocabularyPerCard": 0.0,
        "singleNewVocabularyCards": 0,
        "zeroNewVocabularyCards": 0,
        "catalogedCards": 0,
        "targetMetric": "anki_target_terms",
        "phraseMetric": "front_literal_words",
        "usesAiCatalog": False,
    }


def catalog_stats_from_cards(cards: list[dict[str, Any]], lang: str, normalize_ru: NormalizeRu | None = None) -> dict[str, Any]:
    target_terms: set[str] = set()
    phrase_vocabulary: set[str] = set()
    seen_vocabulary: set[str] = set()
    new_phrase_vocabulary = 0
    single_new_cards = 0
    zero_new_cards = 0
    cataloged_cards = 0

    sorted_cards = sorted(cards, key=lambda item: (int(item.get("created") or 0), int(item.get("noteId") or 0)))
    for item in sorted_cards:
        front = str(item.get("front") or "")
        back = str(item.get("back") or "")
        target = extract_target_term(front, back, lang, normalize_ru)
        if target:
            target_terms.add(target)

        front_tokens = literal_front_words(front, lang)
        if front_tokens:
            cataloged_cards += 1
        new_tokens = front_tokens - seen_vocabulary
        if len(new_tokens) == 0:
            zero_new_cards += 1
        elif len(new_tokens) == 1:
            single_new_cards += 1
        new_phrase_vocabulary += len(new_tokens)
        phrase_vocabulary.update(front_tokens)
        seen_vocabulary.update(front_tokens)

    return {
        "targetTerms": len(target_terms),
        "phraseVocabulary": len(phrase_vocabulary),
        "newPhraseVocabulary": new_phrase_vocabulary,
        "avgNewPhraseVocabularyPerCard": round(new_phrase_vocabulary / cataloged_cards, 2) if cataloged_cards else 0.0,
        "singleNewVocabularyCards": single_new_cards,
        "zeroNewVocabularyCards": zero_new_cards,
        "catalogedCards": cataloged_cards,
        "targetMetric": "anki_target_terms",
        "phraseMetric": "front_literal_words",
        "usesAiCatalog": False,
    }


def normalize_term_identity(value: str, lang: str, normalize_ru: NormalizeRu | None = None) -> str:
    text = strip_anki_field(value)
    if lang == "ru":
        try:
            return _apply_normalize_ru(normalize_ru, text).casefold()
        except Exception:  # noqa: BLE001
            return re.sub(r"\s+", " ", text.replace("ё", "е").replace("Ё", "Е")).strip().casefold()
    return text.casefold()


def card_bucket_from_values(card_type: int, interval: int) -> str:
    if card_type == 0:
        return "new"
    if card_type in {1, 3}:
        return "learning"
    if interval >= 21:
        return "mature"
    return "young"


def empty_deck_stats(deck_name: str, lang: str, front_field: str = "Frente") -> dict[str, Any]:
    return {
        "deckName": deck_name,
        "lang": lang,
        "frontField": front_field,
        "missing": True,
        "notes": 0,
        "cards": 0,
        "uniqueTerms": 0,
        "uniqueFronts": 0,
        "uniqueTermTokens": 0,
        "vocabulary": empty_vocab_stats(),
        "termMetric": "anki_target_terms",
        "new": 0,
        "learning": 0,
        "young": 0,
        "mature": 0,
        "reviewed": 0,
        "maturePct": 0.0,
    }


def deck_stats_totals(rows: list[dict[str, Any]]) -> dict[str, Any]:
    vocab_rows = [row.get("vocabulary") or empty_vocab_stats() for row in rows]
    total_cataloged = sum(row.get("catalogedCards", 0) for row in vocab_rows)
    total_new_vocab = sum(row.get("newPhraseVocabulary", 0) for row in vocab_rows)
    vocabulary = {
        "targetTerms": sum(row.get("targetTerms", 0) for row in vocab_rows),
        "phraseVocabulary": sum(row.get("phraseVocabulary", 0) for row in vocab_rows),
        "newPhraseVocabulary": total_new_vocab,
        "avgNewPhraseVocabularyPerCard": round(total_new_vocab / total_cataloged, 2) if total_cataloged else 0.0,
        "singleNewVocabularyCards": sum(row.get("singleNewVocabularyCards", 0) for row in vocab_rows),
        "zeroNewVocabularyCards": sum(row.get("zeroNewVocabularyCards", 0) for row in vocab_rows),
        "catalogedCards": total_cataloged,
        "targetMetric": "anki_target_terms",
        "phraseMetric": "front_literal_words",
        "usesAiCatalog": any(row.get("usesAiCatalog") for row in vocab_rows),
    }
    totals = {
        "decks": len(rows),
        "notes": sum(row.get("notes", 0) for row in rows),
        "cards": sum(row.get("cards", 0) for row in rows),
        "uniqueTerms": vocabulary["targetTerms"],
        "uniqueFronts": sum(row.get("uniqueFronts", 0) for row in rows),
        "uniqueTermTokens": vocabulary["phraseVocabulary"],
        "vocabulary": vocabulary,
        "termMetric": "anki_target_terms",
        "new": sum(row.get("new", 0) for row in rows),
        "learning": sum(row.get("learning", 0) for row in rows),
        "young": sum(row.get("young", 0) for row in rows),
        "mature": sum(row.get("mature", 0) for row in rows),
    }
    totals["reviewed"] = totals["learning"] + totals["young"] + totals["mature"]
    totals["maturePct"] = round((totals["mature"] / totals["reviewed"]) * 100, 1) if totals["reviewed"] else 0.0
    return totals


def normalizar_frase_ru(text: str) -> str:
    """A identidade de uma frase russa: sem o contexto entre colchetes no fim, ё como е, espaços únicos."""
    text = re.sub(r"\s*\[(?:Context|Contexto):.*?\]\s*$", "", text, flags=re.IGNORECASE).strip()
    text = re.sub(r"\s*\[[^\]]+\]\s*$", "", text).strip()
    text = text.replace("ё", "е").replace("Ё", "Е")
    return re.sub(r"\s+", " ", text).strip()

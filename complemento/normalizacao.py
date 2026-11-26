from __future__ import annotations

import re
from typing import Any, Callable, NamedTuple

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


def _com_y_no_fim(raiz: str) -> str:
    return raiz + "y"


def _com_f_no_fim(raiz: str) -> str:
    return raiz + "f"


def _sem_a_letra_dobrada(raiz: str) -> str:
    return raiz[:-1] if len(raiz) > 2 and raiz[-1] == raiz[-2] else raiz


def _a_raiz(raiz: str) -> str:
    return raiz


class _FinalDoIngles(NamedTuple):
    mais_de_letras: int
    final: re.Pattern[str]
    troca: Callable[[str], str]

    def casa(self, word: str) -> bool:
        return len(word) > self.mais_de_letras and self.final.search(word) is not None

    def aplicar(self, word: str) -> str:
        return self.troca(self.final.sub("", word))


FINAIS_DO_INGLES = (
    _FinalDoIngles(4, re.compile(r"ies$"), _com_y_no_fim),
    _FinalDoIngles(5, re.compile(r"ves$"), _com_f_no_fim),
    _FinalDoIngles(5, re.compile(r"ing$"), _sem_a_letra_dobrada),
    _FinalDoIngles(4, re.compile(r"ed$"), _sem_a_letra_dobrada),
    _FinalDoIngles(3, re.compile(r"(?<![isu])s$"), _a_raiz),
)


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


def _sem_o_s_de_posse(word: str) -> str:
    return word[:-2] if word.endswith("'s") else word


def normalize_en_word(value: str) -> str:
    word = re.sub(r"[^a-z'-]", "", value.casefold()).strip("-'")
    if word in EN_LEMMA_EXCEPTIONS:
        return EN_LEMMA_EXCEPTIONS[word]
    word = _sem_o_s_de_posse(word)
    final = next((final for final in FINAIS_DO_INGLES if final.casa(word)), None)
    return final.aplicar(word) if final else word


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


def _termo_do_negrito(front: str, lang: str, normalize_ru: NormalizeRu | None) -> str:
    bold_texts = extract_bold_texts(front)
    return normalize_target_item(bold_texts[0], lang, normalize_ru) if bold_texts else ""


def _termo_da_linha_com_pronuncia(back: str, lang: str, normalize_ru: NormalizeRu | None) -> str:
    plain_back = strip_anki_field(back)
    first_segment = re.split(r"\n|Definition:|Simple meaning:|Other example:|Trigger:", plain_back, maxsplit=1)[0]
    if not re.search(r"/[^/]+/", first_segment):
        return ""
    first_line = re.split(r"\n|Definition:|Simple meaning:|→|Other example:|Trigger:", plain_back, maxsplit=1)[0]
    first_line = re.sub(r"\s*[–-]\s*/.*$", "", first_line).strip()
    first_line = re.sub(r"\s*/.*$", "", first_line).strip()
    return normalize_target_item(first_line, lang, normalize_ru)


def extract_target_term(front: str, back: str, lang: str, normalize_ru: NormalizeRu | None = None) -> str:
    if lang == "ru":
        return normalize_term_identity(front, lang, normalize_ru)
    return _termo_do_negrito(front, lang, normalize_ru) or _termo_da_linha_com_pronuncia(back, lang, normalize_ru)


def _e_palavra_de_letras(word: str) -> bool:
    return any(char.isalpha() for char in word) and not any(char.isdigit() or char == "_" for char in word)


def _palavras_literais(value: str, lang: str) -> list[str]:
    text = strip_anki_field(value).casefold()
    if lang == "ru":
        return re.findall(r"[а-я]+(?:-[а-я]+)?", text.replace("ё", "е").replace("Ё", "е"), flags=re.IGNORECASE)
    words = (match.group(0).strip("-'") for match in re.finditer(r"[\w]+(?:[-'][\w]+)*", text))
    return [word for word in words if _e_palavra_de_letras(word)]


def literal_front_words(front: str, lang: str) -> set[str]:
    return set(_palavras_literais(front, lang))


def literal_term_from_text(value: str, lang: str) -> str:
    return " ".join(_palavras_literais(value, lang))


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


def _frente_e_verso(card: dict[str, Any]) -> tuple[str, str]:
    return str(card.get("front") or ""), str(card.get("back") or "")


COLUNA_DO_VOCABULARIO_POR_ETAPA = {"new": "new", "learning": "recent", "young": "recent", "recent": "recent", "mature": "mature"}


def _coluna_do_vocabulario(card: dict[str, Any]) -> str:
    return COLUNA_DO_VOCABULARIO_POR_ETAPA.get(str(card.get("bucket") or "new"), "new")


def _ordem_no_vocabulario(item: dict[str, Any]) -> tuple[bool, int, str]:
    return (str(item["type"]) != "term", -int(item["cards"]), item["word"])


class _VocabularioDasFrentes:
    def __init__(self, lang: str, normalize_ru: NormalizeRu | None) -> None:
        self.lang = lang
        self.normalize_ru = normalize_ru
        self.rows: dict[tuple[str, str], dict[str, Any]] = {}

    def contar(self, card: dict[str, Any]) -> None:
        status_bucket = _coluna_do_vocabulario(card)
        front, back = _frente_e_verso(card)
        for word in literal_front_words(front, self.lang):
            add_vocabulary_row(self.rows, word, "word", status_bucket)
        for term in filter(is_expression_term, literal_target_terms(front, back, self.lang, self.normalize_ru)):
            add_vocabulary_row(self.rows, term, "term", status_bucket)

    def linhas(self) -> list[dict[str, Any]]:
        for item in self.rows.values():
            item["status"] = vocabulary_word_status(item)
        return sorted(self.rows.values(), key=_ordem_no_vocabulario)


def front_vocabulary_rows_from_cards(cards: list[dict[str, Any]], lang: str, normalize_ru: NormalizeRu | None = None) -> list[dict[str, Any]]:
    vocabulario = _VocabularioDasFrentes(lang, normalize_ru)
    for card in cards:
        vocabulario.contar(card)
    return vocabulario.linhas()


CHAVES_DA_CONTAGEM_DO_VOCABULARIO = (
    "targetTerms",
    "phraseVocabulary",
    "newPhraseVocabulary",
    "singleNewVocabularyCards",
    "zeroNewVocabularyCards",
    "catalogedCards",
)


def _soma(rows: list[dict[str, Any]], key: str) -> int:
    return sum(row.get(key, 0) for row in rows)


class _ContagemDoVocabulario(NamedTuple):
    target_terms: int = 0
    phrase_vocabulary: int = 0
    new_phrase_vocabulary: int = 0
    single_new_cards: int = 0
    zero_new_cards: int = 0
    cataloged_cards: int = 0

    @classmethod
    def somada(cls, vocab_rows: list[dict[str, Any]]) -> _ContagemDoVocabulario:
        return cls(*(_soma(vocab_rows, key) for key in CHAVES_DA_CONTAGEM_DO_VOCABULARIO))

    def media_de_palavras_novas(self) -> float:
        return round(self.new_phrase_vocabulary / self.cataloged_cards, 2) if self.cataloged_cards else 0.0

    def como_json(self, uses_ai_catalog: bool = False) -> dict[str, Any]:
        return {
            "targetTerms": self.target_terms,
            "phraseVocabulary": self.phrase_vocabulary,
            "newPhraseVocabulary": self.new_phrase_vocabulary,
            "avgNewPhraseVocabularyPerCard": self.media_de_palavras_novas(),
            "singleNewVocabularyCards": self.single_new_cards,
            "zeroNewVocabularyCards": self.zero_new_cards,
            "catalogedCards": self.cataloged_cards,
            "targetMetric": "anki_target_terms",
            "phraseMetric": "front_literal_words",
            "usesAiCatalog": uses_ai_catalog,
        }


def empty_vocab_stats() -> dict[str, Any]:
    return _ContagemDoVocabulario().como_json()


def _ordem_de_criacao(item: dict[str, Any]) -> tuple[int, int]:
    return (int(item.get("created") or 0), int(item.get("noteId") or 0))


class _CatalogoDasFrentes:
    def __init__(self, lang: str, normalize_ru: NormalizeRu | None) -> None:
        self.lang = lang
        self.normalize_ru = normalize_ru
        self.target_terms: set[str] = set()
        self.seen_vocabulary: set[str] = set()
        self.new_phrase_vocabulary = 0
        self.single_new_cards = 0
        self.zero_new_cards = 0
        self.cataloged_cards = 0

    def catalogar(self, item: dict[str, Any]) -> None:
        front, back = _frente_e_verso(item)
        target = extract_target_term(front, back, self.lang, self.normalize_ru)
        if target:
            self.target_terms.add(target)
        self._contar_as_palavras_novas(literal_front_words(front, self.lang))

    def _contar_as_palavras_novas(self, front_tokens: set[str]) -> None:
        if front_tokens:
            self.cataloged_cards += 1
        new_tokens = front_tokens - self.seen_vocabulary
        if len(new_tokens) == 0:
            self.zero_new_cards += 1
        elif len(new_tokens) == 1:
            self.single_new_cards += 1
        self.new_phrase_vocabulary += len(new_tokens)
        self.seen_vocabulary.update(front_tokens)

    def contagem(self) -> _ContagemDoVocabulario:
        return _ContagemDoVocabulario(
            target_terms=len(self.target_terms),
            phrase_vocabulary=len(self.seen_vocabulary),
            new_phrase_vocabulary=self.new_phrase_vocabulary,
            single_new_cards=self.single_new_cards,
            zero_new_cards=self.zero_new_cards,
            cataloged_cards=self.cataloged_cards,
        )


def catalog_stats_from_cards(cards: list[dict[str, Any]], lang: str, normalize_ru: NormalizeRu | None = None) -> dict[str, Any]:
    catalogo = _CatalogoDasFrentes(lang, normalize_ru)
    for item in sorted(cards, key=_ordem_de_criacao):
        catalogo.catalogar(item)
    return catalogo.contagem().como_json()


def _identidade_do_russo_sem_normalizador(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("ё", "е").replace("Ё", "Е")).strip().casefold()


def normalize_term_identity(value: str, lang: str, normalize_ru: NormalizeRu | None = None) -> str:
    text = strip_anki_field(value)
    if lang != "ru":
        return text.casefold()
    if normalize_ru is None:
        return _identidade_do_russo_sem_normalizador(text)
    try:
        return str(normalize_ru(text)).casefold()
    except Exception:  # noqa: BLE001
        return _identidade_do_russo_sem_normalizador(text)


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


def _cartoes_por_etapa(rows: list[dict[str, Any]]) -> dict[str, Any]:
    por_etapa = {etapa: _soma(rows, etapa) for etapa in ("new", "learning", "young", "mature")}
    reviewed = por_etapa["learning"] + por_etapa["young"] + por_etapa["mature"]
    mature_pct = round((por_etapa["mature"] / reviewed) * 100, 1) if reviewed else 0.0
    return {**por_etapa, "reviewed": reviewed, "maturePct": mature_pct}


def deck_stats_totals(rows: list[dict[str, Any]]) -> dict[str, Any]:
    vocab_rows = [row.get("vocabulary") or empty_vocab_stats() for row in rows]
    uses_ai_catalog = any(row.get("usesAiCatalog") for row in vocab_rows)
    vocabulary = _ContagemDoVocabulario.somada(vocab_rows).como_json(uses_ai_catalog)
    return {
        "decks": len(rows),
        "notes": _soma(rows, "notes"),
        "cards": _soma(rows, "cards"),
        "uniqueTerms": vocabulary["targetTerms"],
        "uniqueFronts": _soma(rows, "uniqueFronts"),
        "uniqueTermTokens": vocabulary["phraseVocabulary"],
        "vocabulary": vocabulary,
        "termMetric": "anki_target_terms",
        **_cartoes_por_etapa(rows),
    }


def normalizar_frase_ru(text: str) -> str:
    text = re.sub(r"\s*\[(?:Context|Contexto):.*?\]\s*$", "", text, flags=re.IGNORECASE).strip()
    text = re.sub(r"\s*\[[^\]]+\]\s*$", "", text).strip()
    text = text.replace("ё", "е").replace("Ё", "Е")
    return re.sub(r"\s+", " ", text).strip()

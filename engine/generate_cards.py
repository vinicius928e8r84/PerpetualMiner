"""
generate_cards.py - Generate Anki card content via local prompts and the `pedir` its caller gives (who pays and the cost record are the caller's).

`escrever` writes one card per call, one keyword of a mining line (a request per keyword, never batched, prevents keyword hallucination):
  - keywords[0] -> uses the original phrase from the input
  - keywords[1..N] -> explicit instruction to invent a new sentence

The model is asked through `pedir` (in the Anki add-on, the Conexão's IA dos cartões, `complemento/ia_dos_cartoes.py`), and progress goes to
the `perpetualminer.motor` logger, never to stdout: the module runs inside the Anki add-on (`complemento/motor`).
"""

import logging
import os
import re
from pathlib import Path
from typing import Callable, Dict, List, Optional, Set

if __package__:  # inside the Anki add-on the engine is the package `complemento.motor`
    from . import provedores
    from .parser import CardJob
    from .prompt_loader import load_prompt
else:
    import provedores
    from parser import CardJob
    from prompt_loader import load_prompt

LOGGER = logging.getLogger("perpetualminer.motor")

_IRREGULAR_FORMS = """
be am is are was were been being|have has had having|do does did done doing|go goes went gone going
get gets got gotten getting|give gives gave given giving|take takes took taken taking|make makes made making
come comes came coming|break breaks broke broken breaking|bring brings brought bringing|catch catches caught catching
run runs ran running|put puts putting|let lets letting|set sets setting|cut cuts cutting|hit hits hitting
see sees saw seen seeing|know knows knew known knowing|think thinks thought thinking|say says said saying
tell tells told telling|find finds found finding|keep keeps kept keeping|leave leaves left leaving
hold holds held holding|stand stands stood standing|understand understands understood understanding
speak speaks spoke spoken speaking|write writes wrote written writing|read reads reading
sit sits sat sitting|lie lies lay lain lying|lay lays laid laying|rise rises rose risen rising
fall falls fell fallen falling|draw draws drew drawn drawing|grow grows grew grown growing
throw throws threw thrown throwing|blow blows blew blown blowing|show shows showed shown showing
wear wears wore worn wearing|tear tears tore torn tearing|swear swears swore sworn swearing
choose chooses chose chosen choosing|freeze freezes froze frozen freezing|steal steals stole stolen stealing
wake wakes woke woken waking|drive drives drove driven driving|ride rides rode ridden riding
eat eats ate eaten eating|drink drinks drank drunk drinking|sing sings sang sung singing
begin begins began begun beginning|swim swims swam swum swimming|ring rings rang rung ringing
sell sells sold selling|buy buys bought buying|pay pays paid paying|send sends sent sending
spend spends spent spending|lend lends lent lending|build builds built building|lose loses lost losing
meet meets met meeting|feed feeds fed feeding|lead leads led leading|bleed bleeds bled bleeding
win wins won winning|hang hangs hung hanging|stick sticks stuck sticking|strike strikes struck striking
shake shakes shook shaken shaking|hide hides hid hidden hiding|bite bites bit bitten biting
forget forgets forgot forgotten forgetting|forgive forgives forgave forgiven forgiving
fight fights fought fighting|seek seeks sought seeking|teach teaches taught teaching
sleep sleeps slept sleeping|sweep sweeps swept sweeping|bend bends bent bending|burst bursts bursting
shut shuts shutting|split splits splitting|spread spreads spreading|quit quits quitting
cost costs costing|hurt hurts hurting|shoot shoots shot shooting|deal deals dealt dealing
mean means meant meaning|dig digs dug digging|spin spins spun spinning|slide slides slid sliding
light lights lit lighting|lean leans leaned leant leaning|learn learns learned learnt learning
undo undoes undid undone undoing|overcome overcomes overcame overcoming|withdraw withdraws withdrew withdrawn withdrawing
foresee foresees foresaw foreseen foreseeing|upset upsets upsetting|rid rids ridding
"""

_FORMS_BY_LEMMA = {
    group.split()[0]: frozenset(group.split()[1:])
    for group in _IRREGULAR_FORMS.replace("\n", "|").split("|")
    if group.strip()
}
_VOWELS = "aeiou"


_TONE_HINTS = {
    "shameless": (
        "Use South Side Chicago vocabulary - be raw, direct, and street-level. "
        "Don't sanitize the language."
    ),
    "naval": (
        "Use a stoic, entrepreneurial tone - be pithy, philosophical, "
        "aphorism-style."
    ),
}


def _tone_hint(entry) -> str:
    source = (entry.context_source or "").lower()
    for key, hint in _TONE_HINTS.items():
        if key in source:
            return f"Tone: {hint}"
    return ""


def _strip_inline_context(text: str) -> str:
    return re.sub(r"\s*\[(?:Context|Contexto):.*?\]\s*$", "", text or "", flags=re.IGNORECASE).strip()


def _format_context_block(job: CardJob) -> str:
    if not job.entry.has_context:
        return ""
    return f" [Contexto: {job.entry.context_str}]"


def _build_message(job: CardJob) -> str:
    clean_phrase = _strip_inline_context(job.entry.phrase)
    input_line = f"{job.keyword} : {clean_phrase}{_format_context_block(job)}"

    if not job.is_generated:
        return input_line

    rules = [
        "This run is for a SECONDARY keyword.",
        f"Target keyword for this card: {job.keyword}",
        f"Original full phrase: {clean_phrase}",
        "Treat the supplied line as coming from a multi-keyword entry where this keyword was NOT the first one.",
        "You MUST follow the Secondary Keywords rule from the system prompt.",
        "Create a brand-new short natural sentence for the Front using the target keyword.",
        "Preserve the same sense, domain, tone, and universe implied by the original phrase and context.",
        "Do not repeat the original phrase.",
    ]
    tone = _tone_hint(job.entry)
    if tone:
        rules.append(tone)
    return "\n".join(rules) + f"\n\nInput Format:\n{input_line}"


def _build_message_ru(job: CardJob) -> str:
    phrase = job.phrase.strip()
    if job.entry.has_context:
        return f"{phrase}\n[Context: {job.entry.context_str}]"
    return phrase


def _strip_card_header(text: str) -> str:
    segments = re.split(r"##\s*Anki\s*Card", text or "")
    return next((c.strip() for c in segments if len(c.strip()) > 50), (text or "").strip())


def _looks_like_ru_refusal(text: str) -> bool:
    low = (text or "").strip().lower()
    if not low:
        return True

    refusal_markers = (
        "i cannot assist",
        "cannot assist",
        "can't assist",
        "please provide a russian phrase",
        "beginer",
        "beginner",
        "too complex",
        "so complex",
        "complex for beginner",
        "for beginner level",
    )
    return any(marker in low for marker in refusal_markers)


def _has_ru_translation(card_text: str) -> bool:
    match = re.search(
        r"^\s*\*{0,2}(?:Literal|Natural|Translation|Definition):\*{0,2}\s*(.+)$",
        card_text,
        re.IGNORECASE | re.MULTILINE,
    )
    return bool(match and match.group(1).strip())


def _forms_of(word: str) -> Set[str]:
    word = word.casefold()
    forms = {word}
    if word in _FORMS_BY_LEMMA:
        return forms | _FORMS_BY_LEMMA[word]
    if len(word) < 2 or not word.isalpha():
        return forms
    if word.endswith(("s", "x", "z", "ch", "sh", "o")):
        forms.add(word + "es")
    if word.endswith("y") and word[-2] not in _VOWELS:
        forms |= {word[:-1] + "ies", word[:-1] + "ied"}
    else:
        forms.add(word + "s")
    if word.endswith("e"):
        forms |= {word + "d", word[:-1] + "ing"}
        if word.endswith("ie"):
            forms.add(word[:-2] + "ying")
    else:
        forms |= {word + "ed", word + "ing"}
    if len(word) >= 3 and word[-1] not in _VOWELS + "wxy" and word[-2] in _VOWELS and word[-3] not in _VOWELS:
        forms |= {word + word[-1] + "ed", word + word[-1] + "ing"}
    return forms


def _words_are_forms_of(words: List[str], lemma_words: List[str]) -> bool:
    return len(words) == len(lemma_words) and all(
        word == lemma or word in _forms_of(lemma) for word, lemma in zip(words, lemma_words)
    )


def _is_form_of_expression(text: str, expected: str) -> bool:
    return _words_are_forms_of(
        _normalize_keyword_for_validation(text).split(), _normalize_keyword_for_validation(expected).split()
    )


def _phrase_has_form_of_expression(phrase: str, expected: str) -> bool:
    lemma_words = _normalize_keyword_for_validation(expected).split()
    words = re.findall(r"\w+(?:['’]\w+)*", phrase.casefold())
    return bool(lemma_words) and any(
        _words_are_forms_of(words[start:start + len(lemma_words)], lemma_words)
        for start in range(len(words) - len(lemma_words) + 1)
    )


def _back_headword_matches(found: str, exp: str) -> bool:
    return found.startswith(exp) or _is_form_of_expression(" ".join(found.split()[:len(exp.split())]), exp)


def _validate_keyword(card_text: str, expected: str) -> bool:
    match = re.search(r"Back:\s*\*{0,2}([^\n/]+)", card_text, re.IGNORECASE)
    if not match:
        return False
    found = _normalize_keyword_for_validation(_strip_back_headword_separator(match.group(1)))
    exp = _normalize_keyword_for_validation(expected)
    if not _back_headword_matches(found, exp):
        return False

    front = _extract_front_text(card_text)
    if _front_has_content_after_the_phrase(front):
        return False

    if len(exp.split()) < 2:
        return True

    if not front:
        return False
    highlighted = [
        _normalize_keyword_for_validation(item)
        for item in re.findall(r"\*([^*\n]+)\*", front)
    ]
    return exp in highlighted or any(_is_form_of_expression(item, exp) for item in highlighted)


def _front_has_content_after_the_phrase(front: str) -> bool:
    return bool(re.search(r"<br\s*/?>|^\s*(?:target|express[ãa]o[- ]alvo)\s*:", front, re.IGNORECASE | re.MULTILINE))


def _front_keeps_the_phrase(card_text: str, phrase: str) -> bool:
    """The Front of an original phrase has all its words, in order (the marks and the case may change)."""
    def words(text: str) -> List[str]:
        return re.findall(r"\w+(?:['’]\w+)*", text.replace("*", "").casefold())

    front = _extract_front_text(card_text)
    return bool(front) and words(front) == words(phrase)


def _normalize_keyword_for_validation(text: str) -> str:
    text = re.sub(r"\s+", " ", text)
    return text.strip(" \t\r\n:;,.\"'()[]{}*").casefold()


def _strip_back_headword_separator(text: str) -> str:
    return re.split(r"\s+(?:-|–|—)\s+", text or "", maxsplit=1)[0]


def _extract_front_text(card_text: str) -> str:
    match = re.search(
        r"^\s*\*{0,2}Front:\*{0,2}\s*(.*?)\s*(?=^\s*\*{0,2}Back:\*{0,2}|\Z)",
        card_text or "",
        re.IGNORECASE | re.MULTILINE | re.DOTALL,
    )
    return match.group(1).strip() if match else ""


def _build_keyword_retry_message(user_message: str, keyword: str) -> str:
    return (
        f"{user_message}\n\n"
        "Regenerate the card because the previous response focused on only part of the target keyword.\n"
        f"Exact target keyword/expression: {keyword}\n"
        f'The Back field MUST start with exactly "{keyword}" before the IPA.\n'
        f'The Front field MUST highlight the full expression as "*{keyword}*", or in the form of its words exactly as it is written in the phrase '
        "(for example *turned down* when the phrase says turned down), not a subword inside it.\n"
        "Never rewrite the phrase to make the expression fit.\n"
        "Do not create a card for a subword inside the target expression."
    )


def _build_phrase_retry_message(user_message: str, phrase: str) -> str:
    return (
        f"{user_message}\n\n"
        "Regenerate the card because the previous Front dropped or changed words of the original phrase.\n"
        f"The Front field MUST be exactly this phrase, every word, with only the keyword between asterisks: {phrase}"
    )


def _prepare_card(response: str) -> str:
    card = _strip_card_header(response)
    return re.sub(r"\[Phrase with[^\]]*\]\s*:?\s*", "", card, flags=re.IGNORECASE)


def _write_card(dest: Path, card: str) -> None:
    """Whole file or nothing: a half-written card must never look ready to a later retry."""
    provisorio = dest.with_name(dest.name + ".novo")
    provisorio.write_text("## Anki Card\n\n" + card, encoding="utf-8")
    os.replace(provisorio, dest)


def escrever(job: CardJob, config: dict, pedir: Callable[[str, str, str], Optional[str]], nome: str) -> Optional[str]:
    """Write one card's text, `<output_dir>/<nome>.txt`, asked through `pedir`; returns None when it is on disk, else the failure code.

    `pedir(system_prompt, message, label)` asks the model for the card's text and returns it (or None); a refusal is an
    `ErroDoProvedor`. Who pays it and its cost record are the caller's: the engine never sees a credential.

    A card whose .txt is already there was paid for and is never asked again. `nome` (the Anki add-on's `<phraseId>-<n>`) is
    what the file, the log and the request's label say, never the keyword or the phrase (what the person mined is not written
    outside the Envio's own files); an error that is not the provider's is logged by its type alone, since its message may
    quote the request. The failure codes: one of the provider layer, or `empty_response`, `invalid_card`, `keyword_mismatch`,
    `generation_error`.
    """
    output_dir = Path(config["paths"]["output_dir"])
    output_dir.mkdir(parents=True, exist_ok=True)
    dest = output_dir / f"{nome}.txt"
    if dest.exists() and dest.stat().st_size > 0:
        return None

    estilo = config.get("estilo")
    whole_phrase = estilo["entrada"] == "frase" if estilo else config.get("lang", "en") == "ru"
    system_prompt = (
        Path(estilo["prompt"]).read_text(encoding="utf-8").strip() if estilo else load_prompt(config, "ru_card" if whole_phrase else "en_card"))
    failure: Dict[str, str] = {}

    def call(message: str) -> Optional[str]:
        try:
            response = pedir(system_prompt, message, nome) or None
        except provedores.ErroDoProvedor as exc:
            LOGGER.error("Modelo falhou para '%s': %s", nome, exc)
            failure["code"] = exc.codigo
            return None
        except Exception as exc:
            LOGGER.error("Modelo falhou para '%s': %s", nome, type(exc).__name__)
            failure["code"] = "generation_error"
            return None
        if not response:
            LOGGER.error("Resposta vazia para '%s' - pulando.", nome)
            failure["code"] = "empty_response"
        return response

    LOGGER.info("Gerando card para: '%s'", nome)
    user_message = _build_message_ru(job) if whole_phrase else _build_message(job)
    response = call(user_message)
    if not response:
        return failure["code"]

    card = _prepare_card(response)

    if whole_phrase and (_looks_like_ru_refusal(card) or not _has_ru_translation(card)):
        reason = "recusa/erro do modelo" if _looks_like_ru_refusal(card) else "campo Translation/Definition ausente"
        LOGGER.error("Card russo para '%s' invalido (%s) - skipping.", nome, reason)
        return "invalid_card"

    clean_phrase = _strip_inline_context(job.entry.phrase)
    keeps_phrase = whole_phrase or job.is_generated or not (
        job.keyword.casefold() in clean_phrase.casefold() or _phrase_has_form_of_expression(clean_phrase, job.keyword))

    def card_ok(text: str) -> bool:
        return _validate_keyword(text, job.keyword) and (keeps_phrase or _front_keeps_the_phrase(text, clean_phrase))

    if not whole_phrase and not card_ok(card):
        LOGGER.warning("Keyword mismatch para '%s' - tentando regenerar uma vez.", nome)
        retry_message = (
            _build_keyword_retry_message(user_message, job.keyword)
            if not _validate_keyword(card, job.keyword)
            else _build_phrase_retry_message(user_message, clean_phrase))
        retry_response = call(retry_message)
        if not retry_response:
            return failure["code"]
        card = _prepare_card(retry_response)
        if not card_ok(card):
            LOGGER.error("Keyword mismatch persistente para '%s' - card nao sera salvo.", nome)
            return "keyword_mismatch"

    _write_card(dest, card)
    LOGGER.info("Card salvo: '%s.txt'", nome)
    return None

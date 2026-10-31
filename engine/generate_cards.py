"""
generate_cards.py - Generate Anki card content via local prompts + chat completions (or the ChatGPT plan's Responses API).

One request per keyword (not batched) to prevent keyword hallucination.
  - keywords[0] -> uses the original phrase from the input
  - keywords[1..N] -> explicit instruction to invent a new sentence

OpenAI is called over plain HTTP (`openai_http`), and progress goes to the `perpetualminer.motor` logger,
never to stdout: the same module runs in the bridge and inside the Anki add-on (`complemento/motor`).
"""

import logging
import os
import re
from pathlib import Path
from typing import Callable, Dict, List, Optional, Set

if __package__:  # inside the Anki add-on the engine is the package `complemento.motor`
    from . import cost_tracker, openai_http
    from .parser import CardJob, get_card_jobs, parse_mining_file
    from .prompt_loader import load_prompt
else:
    import cost_tracker
    import openai_http
    from parser import CardJob, get_card_jobs, parse_mining_file
    from prompt_loader import load_prompt

LOGGER = logging.getLogger("perpetualminer.motor")


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
        r"^\s*\*{0,2}(?:Literal|Natural|Translation):\*{0,2}\s*(.+)$",
        card_text,
        re.IGNORECASE | re.MULTILINE,
    )
    return bool(match and match.group(1).strip())


def _record_chat_cost(log_dir: str, model: str, usage: dict, keyword: str) -> None:
    if not usage:
        return
    cost_tracker.record_tokens(
        log_dir,
        model=model,
        input_tokens=usage.get("prompt_tokens", 0) or 0,
        output_tokens=usage.get("completion_tokens", 0) or 0,
        keyword=keyword,
    )


def _call_model(
    openai_base: str,
    api_key: str,
    system_prompt: str,
    user_message: str,
    model: str,
    log_dir: str,
    keyword: str,
) -> Optional[str]:
    text, usage = openai_http.completar(
        openai_base,
        api_key,
        model,
        [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        temperatura=0.2,
    )
    _record_chat_cost(log_dir, model, usage, keyword)
    return text or None


def _validate_keyword(card_text: str, expected: str) -> bool:
    match = re.search(r"Back:\s*\*{0,2}([^\n/]+)", card_text, re.IGNORECASE)
    if not match:
        return False
    found = _normalize_keyword_for_validation(_strip_back_headword_separator(match.group(1)))
    exp = _normalize_keyword_for_validation(expected)
    if not found.startswith(exp):
        return False

    if len(exp.split()) < 2:
        return True

    front = _extract_front_text(card_text)
    if not front:
        return False
    highlighted = [
        _normalize_keyword_for_validation(item)
        for item in re.findall(r"\*([^*\n]+)\*", front)
    ]
    return exp in highlighted


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
        f'The Front field MUST highlight the full expression as "*{keyword}*", not a subword inside it.\n'
        "Do not create a card for a subword inside the target expression."
    )


def _prepare_card(response: str) -> str:
    card = _strip_card_header(response)
    return re.sub(r"\[Phrase with[^\]]*\]\s*:?\s*", "", card, flags=re.IGNORECASE)


def _write_card(dest: Path, card: str) -> None:
    """Whole file or nothing: a half-written card must never look ready to a later retry."""
    provisorio = dest.with_name(dest.name + ".novo")
    provisorio.write_text("## Anki Card\n\n" + card, encoding="utf-8")
    os.replace(provisorio, dest)


def run(
    entries,
    config: dict,
    *,
    openai_base: str = openai_http.OPENAI_BASE,
    skip_existing: bool = False,
    failures: Optional[Dict[str, str]] = None,
    card_stem: Optional[Callable[[CardJob, int], str]] = None,
    only_stems: Optional[Set[str]] = None,
) -> List[str]:
    """Generate one card .txt per CardJob via local prompts + chat completions.

    `skip_existing`: a card whose .txt is already there is not asked again (it was paid for).
    `failures`: when given, gets `{stem: code}` for each card that was not saved (an `openai_http` code,
    or `empty_response`, `invalid_card`, `keyword_mismatch`, `generation_error`).
    `card_stem(job, index)`: names each card (`index` is the keyword's position in its entry) instead of the
    keyword-and-phrase stem; the Anki add-on uses `<phraseId>-<n>`. A named card is also what the log and the cost
    records say, never the keyword or the phrase (what the person mined is not written outside the Envio's own files).
    `only_stems`: generate just these cards (after the naming above).
    """
    output_dir = Path(config["paths"]["output_dir"])
    output_dir.mkdir(parents=True, exist_ok=True)

    api_key = config["openai_api_key"]
    plan = config.get("plano_do_chatgpt")  # {token, modelo}: the text goes through the ChatGPT plan instead of the key
    log_dir = config["paths"]["log_dir"]
    lang = config.get("lang", "en")
    model = config.get("modelo_do_texto") or config["openai"].get("chat_model", "gpt-4o")  # the Conexão's choice (#157), else the engine's
    failures = failures if failures is not None else {}

    all_jobs: List[tuple] = []
    for entry in entries:
        for index, job in enumerate(get_card_jobs(entry)):
            named = card_stem(job, index) if card_stem else None
            if only_stems is None or (named or job.filename_stem) in only_stems:
                all_jobs.append((job, named))

    estilo = config.get("estilo")  # the add-on's style (`estilos.estilo`, with the path of its prompt): how a line reads and which prompt writes the card
    whole_phrase = estilo["entrada"] == "frase" if estilo else lang == "ru"
    system_prompt = (
        Path(estilo["prompt"]).read_text(encoding="utf-8").strip() if estilo else load_prompt(config, "ru_card" if whole_phrase else "en_card"))

    saved: List[str] = []

    def call(message: str, label: str, stem: str) -> Optional[str]:
        try:
            if plan:
                # The ChatGPT plan (#155): the Responses API with the plan's model and token. No USD cost per card; the usage is logged
                # with what the key would have charged (#159).
                text, usage = openai_http.responder(openai_base, plan["token"], plan["modelo"], system_prompt, message)
                cost_tracker.record_plan_tokens(
                    log_dir, plan["modelo"], model, usage.get("input_tokens", 0) or 0, usage.get("output_tokens", 0) or 0, label)
                return text or None
            return _call_model(openai_base, api_key, system_prompt, message, model, log_dir, label)
        except openai_http.ErroDaOpenAI as exc:
            LOGGER.error("Modelo falhou para '%s': %s", label, exc)
            failures[stem] = exc.codigo
        except Exception as exc:
            # Without the traceback when the card is named: the message of a library error may quote the request.
            LOGGER.error("Modelo falhou para '%s': %s", label, type(exc).__name__, exc_info=not card_stem)
            failures[stem] = "generation_error"
        return None

    for job, named in all_jobs:
        stem = named or job.filename_stem or f"card_{len(saved) + 1}"
        label = named or job.keyword
        dest = output_dir / f"{stem}.txt"
        if skip_existing and dest.exists() and dest.stat().st_size > 0:
            saved.append(stem)
            continue

        LOGGER.info("Gerando card para: '%s'", label)
        user_message = _build_message_ru(job) if whole_phrase else _build_message(job)

        response = call(user_message, label, stem)
        if not response:
            if stem not in failures:
                LOGGER.error("Resposta vazia para '%s' - pulando.", label)
                failures[stem] = "empty_response"
            continue

        card = _prepare_card(response)

        if whole_phrase and (_looks_like_ru_refusal(card) or not _has_ru_translation(card)):
            reason = "recusa/erro do modelo" if _looks_like_ru_refusal(card) else "campo Translation ausente"
            LOGGER.error("Card russo para '%s' invalido (%s) - skipping.", label, reason)
            failures[stem] = "invalid_card"
            continue

        if not whole_phrase and not _validate_keyword(card, job.keyword):
            LOGGER.warning("Keyword mismatch para '%s' - tentando regenerar uma vez.", label)
            retry_response = call(_build_keyword_retry_message(user_message, job.keyword), label, stem)
            if not retry_response:
                if stem not in failures:
                    LOGGER.error("Retry retornou resposta vazia para '%s' - pulando.", label)
                    failures[stem] = "empty_response"
                continue

            card = _prepare_card(retry_response)
            if not _validate_keyword(card, job.keyword):
                LOGGER.error("Keyword mismatch persistente para '%s' - card nao sera salvo.", label)
                failures[stem] = "keyword_mismatch"
                continue

        _write_card(dest, card)
        failures.pop(stem, None)
        saved.append(stem)

        LOGGER.info("Raw Keyword: '%s' -> Final Filename: '%s.txt'", label, stem)
        if len(stem) < 3:
            LOGGER.warning("Filename '%s.txt' e muito curto - verifique o card.", stem)

    if not saved:
        LOGGER.warning("Nenhum card salvo.")

    return saved


if __name__ == "__main__":
    from config_loader import load_config

    cfg = load_config()
    mining_entries = parse_mining_file(Path(cfg["paths"]["mining_file"]))
    result = run(mining_entries, cfg)
    print(f"OK {len(result)} card(s) generated.")

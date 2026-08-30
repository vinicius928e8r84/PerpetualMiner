"""
generate_cards.py - Generate Anki card content via local prompts + chat completions.

One request per keyword (not batched) to prevent keyword hallucination.
  - keywords[0] -> uses the original phrase from the input
  - keywords[1..N] -> explicit instruction to invent a new sentence
"""

import warnings
warnings.filterwarnings("ignore", category=DeprecationWarning)

import re
from pathlib import Path
from typing import List, Optional

import openai

import cost_tracker
from config_loader import load_config
from parser import CardJob, get_card_jobs, parse_mining_file
from prompt_loader import load_prompt


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


def _record_chat_cost(log_dir: str, model: str, usage, keyword: str) -> None:
    if not usage:
        return
    cost_tracker.record_tokens(
        log_dir,
        model=model,
        input_tokens=getattr(usage, "prompt_tokens", 0) or 0,
        output_tokens=getattr(usage, "completion_tokens", 0) or 0,
        keyword=keyword,
    )


def _call_model(
    client: openai.OpenAI,
    system_prompt: str,
    user_message: str,
    model: str,
    log_dir: str,
    keyword: str,
) -> Optional[str]:
    resp = client.chat.completions.create(
        model=model,
        temperature=0.2,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
    )

    _record_chat_cost(log_dir, model, getattr(resp, "usage", None), keyword)

    choice = (resp.choices or [None])[0]
    if not choice or not getattr(choice, "message", None):
        return None
    return (choice.message.content or "").strip() or None


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


def run(entries, config: dict) -> List[str]:
    """Generate one card .txt per CardJob via local prompts + chat completions."""
    output_dir = Path(config["paths"]["output_dir"])
    output_dir.mkdir(exist_ok=True)

    client = openai.OpenAI(api_key=config["openai_api_key"])
    log_dir = config["paths"]["log_dir"]
    lang = config.get("lang", "en")
    model = config["openai"].get("chat_model", "gpt-4o")

    all_jobs: List[CardJob] = []
    for entry in entries:
        all_jobs.extend(get_card_jobs(entry))

    en_main_prompt = load_prompt(config, "en_main_card") if lang != "ru" else ""
    en_additional_prompt = load_prompt(config, "en_additional_card") if lang != "ru" else ""
    ru_prompt = load_prompt(config, "ru_card") if lang == "ru" else ""

    saved: List[str] = []

    for job in all_jobs:
        print(f"[INFO] Gerando card para: '{job.keyword}'")
        if lang == "ru":
            user_message = _build_message_ru(job)
            system_prompt = ru_prompt
        else:
            user_message = _build_message(job)
            system_prompt = en_additional_prompt if job.is_generated else en_main_prompt

        try:
            response = _call_model(client, system_prompt, user_message, model, log_dir, job.keyword)
        except Exception as exc:
            print(f"[ERROR] Modelo falhou para '{job.keyword}': {exc}")
            continue

        if not response:
            print(f"[ERROR] Resposta vazia para '{job.keyword}' - pulando.")
            continue

        card = _prepare_card(response)

        if lang == "ru" and (_looks_like_ru_refusal(card) or not _has_ru_translation(card)):
            reason = "recusa/erro do modelo" if _looks_like_ru_refusal(card) else "campo Translation ausente"
            print(f"[ERROR] Card russo para '{job.keyword}' invalido ({reason}) - skipping.")
            continue

        if lang != "ru" and not _validate_keyword(card, job.keyword):
            print(f"[WARN] Keyword mismatch para '{job.keyword}' - tentando regenerar uma vez.")
            retry_message = _build_keyword_retry_message(user_message, job.keyword)
            try:
                retry_response = _call_model(
                    client,
                    system_prompt,
                    retry_message,
                    model,
                    log_dir,
                    job.keyword,
                )
            except Exception as exc:
                print(f"[ERROR] Retry do modelo falhou para '{job.keyword}': {exc}")
                continue

            if not retry_response:
                print(f"[ERROR] Retry retornou resposta vazia para '{job.keyword}' - pulando.")
                continue

            card = _prepare_card(retry_response)
            if not _validate_keyword(card, job.keyword):
                print(
                    f"[ERROR] Keyword mismatch persistente para '{job.keyword}' - "
                    "card nao sera salvo."
                )
                continue

        stem = job.filename_stem or f"card_{len(saved) + 1}"
        dest = output_dir / f"{stem}.txt"
        dest.write_text("## Anki Card\n\n" + card, encoding="utf-8")
        saved.append(stem)

        print(f"[DEBUG] Raw Keyword: '{job.keyword}' -> Final Filename: '{stem}.txt'")
        if len(stem) < 3:
            print(f"[WARN] Filename '{stem}.txt' e muito curto - verifique o card.")

    if not saved:
        print("[WARN] Nenhum card salvo.")

    return saved


if __name__ == "__main__":
    cfg = load_config()
    mining_entries = parse_mining_file(Path(cfg["paths"]["mining_file"]))
    result = run(mining_entries, cfg)
    print(f"OK {len(result)} card(s) generated.")

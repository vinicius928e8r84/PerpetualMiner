"""
start.py — PerpetualMiner orchestrator with rich terminal UI.
"""

import re
import time
import tempfile
import warnings
warnings.filterwarnings("ignore")

from pathlib import Path

from rich.console import Console
from rich.panel import Panel
from rich.progress import BarColumn, Progress, SpinnerColumn, TextColumn, TimeElapsedColumn
from rich.prompt import Prompt
from rich.table import Table
from rich.text import Text
from rich.rule import Rule
from rich import box

from config_loader import load_config
from parser import parse_mining_file, parse_mining_file_ru, get_card_jobs

import generate_cards
import extract_prompts
import generate_audio
import generate_images
import google_images
import send_to_anki
import cost_tracker
import image_guard
import image_judge
import tts_accents

console = Console()


def _strip_context_block(text: str) -> str:
    return re.sub(r"\s*\[(?:Context|Contexto):.*?\]\s*$", "", text or "", flags=re.IGNORECASE).strip()


def _has_context_block(text: str) -> bool:
    return bool(re.search(r"\[(?:Context|Contexto):\s*.+?\]", text or "", re.IGNORECASE))


def _normalize_keyword_match_text(text: str) -> str:
    text = _strip_context_block(text)
    text = re.sub(r"[^a-z0-9']+", " ", text.casefold())
    return re.sub(r"\s+", " ", text).strip()


def _validate_english_input_line(line: str) -> tuple[bool, str]:
    line = (line or "").strip()
    if ":" not in line:
        return False, "Use o formato palavra : frase (falta o dois-pontos)."

    keywords_raw, phrase_raw = line.split(":", 1)
    keywords = [kw.strip() for kw in keywords_raw.split("|") if kw.strip()]
    phrase = _strip_context_block(phrase_raw)

    if not keywords:
        return False, "Falta a keyword antes do dois-pontos."
    if not phrase:
        return False, "Falta a frase depois do dois-pontos."

    primary = _normalize_keyword_match_text(keywords[0])
    phrase_norm = _normalize_keyword_match_text(phrase)
    if primary and f" {primary} " not in f" {phrase_norm} ":
        return False, "A keyword principal precisa aparecer na frase original."

    if len(keywords) > 1 and not _has_context_block(line):
        phrase_words = phrase_norm.split()
        if len(phrase_words) < 7:
            return False, (
                "Para multiplas keywords, adicione mais contexto na frase ou use "
                "[Context: Fonte - Titulo - Detalhe]."
            )

    return True, ""


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

_PRESET_DECKS = {"1": "CIMV", "2": "RUSSIAN", "3": "teste"}
_LANG_LABELS  = {"en": "Inglês", "ru": "Russo"}
_IMG_SOURCE_LABELS = {
    "1": "Google Images  (gratuito, recomendado)",
    "2": "DALL-E  (pago, geração de IA)",
}


def _header():
    console.clear()
    console.print()
    console.print(Panel(
        "[bold magenta]  PerpetualMiner  [/bold magenta]\n"
        "[dim]Transforma palavras em flashcards Anki completos\n"
        "com áudio, imagem e definição — automaticamente.[/dim]",
        expand=False,
        border_style="magenta",
    ))
    console.print()


def _section(title: str):
    console.print()
    console.print(Rule(f"[bold cyan]{title}[/bold cyan]", style="dim cyan"))
    console.print()


def _ok(b: bool) -> str:
    return "[green]✓[/green]" if b else "[red]✗[/red]"


def _make_progress(*columns) -> Progress:
    return Progress(
        *columns,
        TimeElapsedColumn(),
        console=console,
        transient=False,
    )


def _tip(msg: str):
    console.print(f"[dim]  ℹ  {msg}[/dim]")


def _success(msg: str):
    console.print(f"[bold green]  ✓  {msg}[/bold green]")


def _warn(msg: str):
    console.print(f"[bold yellow]  ⚠  {msg}[/bold yellow]")


def _error(msg: str):
    console.print(f"[bold red]  ✗  {msg}[/bold red]")


def _run_stage(label: str, fn, *args, **kwargs):
    with console.status(f"[bold green]{label}…[/bold green]", spinner="dots"):
        t0 = time.time()
        result = fn(*args, **kwargs)
        elapsed = time.time() - t0
    return result, elapsed


def _tts_profile(config: dict, lang: str, field: str) -> dict:
    profile = (
        config.get("tts", {})
        .get("profiles", {})
        .get(lang, {})
        .get(field, {})
    ) or {}
    return {
        "lang": profile.get("lang", lang),
        "tld": profile.get("tld", "ru" if lang == "ru" else "com"),
    }


def _select_tts_profiles(config: dict, lang: str) -> None:
    _section("3 de 4 - Sotaque / variante do audio")
    current_word = _tts_profile(config, lang, "word")
    current_phrase = _tts_profile(config, lang, "phrase")
    recommended = tts_accents.default_recommended(lang)
    supported = tts_accents.supported_tlds()

    console.print(
        "  Defina sotaques diferentes para o audio da palavra e da frase.\n"
        "  O padrao vem do config.json, mas voce pode sobrescrever so nesta execucao.\n"
    )

    sample = ", ".join(f"{tld} ({tts_accents.friendly_label(tld)})" for tld in recommended[:8])
    console.print(Panel(
        f"[bold]Atual[/bold]\n"
        f"  Palavra:  {current_word['lang']} + {current_word['tld']}\n"
        f"  Frase:    {current_phrase['lang']} + {current_phrase['tld']}\n\n"
        f"[bold]Sugestoes[/bold]\n  {sample}\n\n"
        f"[bold]Suportados[/bold]\n  {', '.join(supported)}",
        title="[bold cyan]Perfis de TTS[/bold cyan]",
        expand=False,
        border_style="cyan",
    ))

    if Prompt.ask(
        "  [bold yellow]Usar padrao do config?[/bold yellow]",
        choices=["s", "n"],
        default="s",
    ) == "s":
        return

    for field, label in (("word", "palavra"), ("phrase", "frase")):
        current = _tts_profile(config, lang, field)
        while True:
            tld = Prompt.ask(
                f"  TLD para audio de {label} ({current['lang']})",
                default=current["tld"],
            ).strip()
            if tld in supported:
                config["tts"]["profiles"][lang][field] = {"lang": current["lang"], "tld": tld}
                break
            _warn("TLD nao suportado pela engine atual. Escolha um da lista mostrada acima.")


def _select_session(config: dict) -> str:
    _header()

    _section("1 de 4 - Escolha o deck do Anki")
    console.print(
        "  O deck é a pasta dentro do Anki onde os cards serão adicionados.\n"
        "  Se não existir, o Anki cria automaticamente.\n"
    )

    deck_table = Table(box=box.SIMPLE, show_header=False, padding=(0, 4))
    deck_table.add_column("Opt", style="bold cyan", justify="right")
    deck_table.add_column("Deck", style="white")
    for k, v in _PRESET_DECKS.items():
        deck_table.add_row(f"[{k}]", v)
    deck_table.add_row("[4]", "Outro  (você digita o nome)")
    console.print(deck_table)

    deck_choice = Prompt.ask(
        "  [bold yellow]Deck[/bold yellow]",
        choices=["1", "2", "3", "4"],
        default="3",
    )
    deck_name = (
        Prompt.ask("  Nome do deck").strip() or "teste"
        if deck_choice == "4"
        else _PRESET_DECKS[deck_choice]
    )

    _section("2 de 4 - Idioma das palavras")
    console.print(
        "  Escolha o idioma das palavras que você vai estudar.\n"
        "  Isso afeta o áudio gerado e o assistente de IA usado.\n"
    )

    lang_table = Table(box=box.SIMPLE, show_header=False, padding=(0, 4))
    lang_table.add_column("Opt", style="bold cyan", justify="right")
    lang_table.add_column("Idioma", style="white")
    lang_table.add_row("[1]", "Inglês  (en)")
    lang_table.add_row("[2]", "Russo   (ru)")
    console.print(lang_table)

    lang_choice = Prompt.ask(
        "  [bold yellow]Idioma[/bold yellow]",
        choices=["1", "2"],
        default="1",
    )
    lang = "en" if lang_choice == "1" else "ru"

    config["lang"] = lang
    config["anki"]["deck_name"] = deck_name

    lang_cfg = config.get("languages", {}).get(lang, {})
    if lang_cfg.get("note_type"):
        config["anki"]["note_type"] = lang_cfg["note_type"]
    if lang_cfg.get("fields"):
        config["anki"]["fields"] = lang_cfg["fields"]

    _select_tts_profiles(config, lang)

    model = config["openai"].get("chat_model", "gpt-4o")

    console.print()
    console.print(Panel(
        f"  [dim]Deck:[/dim]     [bold]{deck_name}[/bold]\n"
        f"  [dim]Idioma:[/dim]   [bold]{_LANG_LABELS[lang]}[/bold]\n"
        f"  [dim]Modelo IA:[/dim] [bold]{model}[/bold]",
        title="[bold]Configuração selecionada[/bold]",
        expand=False,
        border_style="green",
    ))

    return lang


def _select_image_source(lang: str = "en") -> str:
    _section("4 de 4 - Fonte das imagens dos cards")
    console.print(
        "  Cada card pode ter uma imagem para ajudar a memorizar.\n"
        "  Google Images busca varias fotos reais e aceita a melhor se houver link mental claro.\n"
        "  A geracao por IA fica como fallback quando nenhuma imagem real serve.\n"
        "  Isso economiza custo porque a busca gratis e o juiz rodam antes de gerar.\n"
    )

    img_table = Table(box=box.SIMPLE, show_header=False, padding=(0, 4))
    img_table.add_column("Opt", style="bold cyan", justify="right")
    img_table.add_column("Fonte", style="white")
    for k, v in _IMG_SOURCE_LABELS.items():
        img_table.add_row(f"[{k}]", v)
    console.print(img_table)

    choice = Prompt.ask(
        "  [bold yellow]Fonte de imagens[/bold yellow]",
        choices=["1", "2"],
        default="1",
    )
    console.print(f"  [dim]Usando: [bold]{_IMG_SOURCE_LABELS[choice]}[/bold][/dim]")
    return choice


def _get_user_input(mining_path: Path, lang: str) -> tuple[int, str]:
    console.print()

    if lang == "ru":
        console.print(Panel(
            "[bold]Como inserir:[/bold]\n\n"
            "  Digite uma frase em Russo por linha.\n"
            "  Não precisa separar keyword e frase — use a frase inteira.\n\n"
            "  [green]Пример:[/green]  Он не сдался, несмотря на трудности.\n\n"
            "  Quando terminar de digitar todas as frases,\n"
            "  digite  [bold red]done[/bold red]  e pressione Enter para iniciar.",
            title="[bold cyan]  Suas frases em Russo  [/bold cyan]",
            expand=False,
            border_style="cyan",
        ))
        lines = []
        while True:
            line = console.input("  [bold yellow]→ [/bold yellow]").strip()
            if line.lower() == "done":
                break
            if line:
                lines.append(line)
    else:
        console.print(Panel(
            "[bold]Como inserir:[/bold]\n\n"
            "  [green]palavra : frase onde a palavra aparece[/green]\n"
            "  [green]pal1 | pal2 | pal3 : frase [Context: Série - Título - Ep][/green]\n\n"
            "  Cada palavra extra após  [bold]|[/bold]  gera um card adicional\n"
            "  com uma frase nova criada pela IA.\n\n"
            "  O  [bold][Context: ...][/bold]  é opcional — ajuda a IA a gerar\n"
            "  exemplos com o tom certo (ex: Shameless, Naval, etc).\n\n"
            "  Quando terminar, digite  [bold red]done[/bold red]  e pressione Enter.",
            title="[bold cyan]  Suas palavras  [/bold cyan]",
            expand=False,
            border_style="cyan",
        ))
        lines = []
        while True:
            line = console.input("  [bold yellow]→ [/bold yellow]").strip()
            if line.lower() == "done":
                break
            if not line:
                continue
            ok, reason = _validate_english_input_line(line)
            if not ok:
                _warn(f"{reason} Corrija e digite a linha de novo.")
                continue
            lines.append(line)

    if not lines:
        _error("Nenhuma entrada válida. Encerrando.")
        raise SystemExit(0)

    mining_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    _success(f"{len(lines)} entrada(s) registrada(s)")

    img_source = _select_image_source(lang)
    return len(lines), img_source


def _run_images(config, prompt_lines, output_dir, img_source, api_key, log_dir):
    total_images = len(prompt_lines)
    img_files: list[str] = []
    img_sources: dict[str, str] = {}
    n_skipped = 0
    stopwords = {
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
    judge_cfg = config.get("image_judge", {})
    judge_enabled = bool(judge_cfg.get("enabled", True) and img_source == "1")
    image_model = config["openai"]["image_model"]
    generated_image_cost = float(cost_tracker.PRICES.get(image_model, 0.040))
    real_candidate_limit = int(judge_cfg.get("real_candidate_limit", 8) or 8)
    real_total_candidate_limit = int(judge_cfg.get("real_total_candidate_limit", 24) or 24)
    max_queries = int(judge_cfg.get("max_queries", 8) or 8)

    def _normalize_query(query: str) -> str:
        query = re.sub(r"^[\-\u2013\u2014]\s*", "", query.strip())
        query = re.sub(r"[*_`]+", " ", query)
        query = re.sub(r"\s+", " ", query)
        return query.strip(" .,!?:;\"'()[]{}")

    def _content_terms(query: str) -> list[str]:
        clean = _normalize_query(query)
        if not clean:
            return []
        words = re.sub(r"[^A-Za-z0-9\s]", " ", clean).lower()
        words = re.sub(r"\s+", " ", words).strip().split()
        terms = [w for w in words if len(w) > 2 and w not in stopwords]
        deduped: list[str] = []
        seen: set[str] = set()
        for term in terms:
            if term not in seen:
                deduped.append(term)
                seen.add(term)
        return deduped

    def _english_query_variants(query: str) -> list[str]:
        clean = _normalize_query(query)
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
        content_words = _content_terms(clean)
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

    def _card_content(stem: str) -> str:
        card_path = output_dir / f"{stem}.txt"
        if not card_path.exists():
            return ""
        try:
            return card_path.read_text(encoding="utf-8")
        except Exception:
            return ""

    def _field_value(content: str, pattern: str) -> str:
        match = re.search(pattern, content, re.IGNORECASE)
        if not match:
            return ""
        return match.group(1).strip().rstrip("*").strip()

    def _card_google_queries(stem: str, prompt: str) -> list[str]:
        content = _card_content(stem)
        return _build_card_google_queries(
            content,
            stem=stem,
            prompt=prompt,
            lang=config.get("lang", "en"),
            max_queries=max_queries,
        )

    def _visual_subject(stem: str, prompt: str) -> str:
        content = _card_content(stem)
        return _visual_subject_for_card(content, stem, prompt)

    def _card_phrase_and_context(content: str) -> tuple[str, str]:
        return _card_phrase_and_context_from_text(content)

    def _record_pipeline(stem: str, **fields) -> None:
        fields.setdefault("generation_policy", "normal")
        fields.setdefault("paid_generation_blocked_by_guard", False)
        cost_tracker.record_image_pipeline(log_dir, keyword=stem, **fields)

    def _policy_fields(generation_policy: str, paid_generation_blocked_by_guard: bool) -> dict:
        return {
            "generation_policy": generation_policy,
            "paid_generation_blocked_by_guard": paid_generation_blocked_by_guard,
        }

    guard_enabled = config.get("lang") != "ru"

    def _wants_image(stem: str, prompt: str) -> bool:
        if not guard_enabled:
            return True
        return image_guard.should_generate_image(_visual_subject(stem, prompt), api_key, log_dir)

    def _save_real(best_path: str, stem: str, dest: Path) -> bool:
        dest.write_bytes(Path(best_path).read_bytes())
        cost_tracker.record_image(log_dir, model="google_images", source="google", keyword=stem)
        img_sources[stem.lower()] = "real"
        return True

    def _save_generated(gen_path: Path, stem: str, dest: Path) -> bool:
        dest.write_bytes(gen_path.read_bytes())
        cost_tracker.record_image(log_dir, model=image_model, source="dalle", keyword=stem)
        img_sources[stem.lower()] = "gerada"
        return True

    def _generate_without_real(
        stem: str,
        prompt: str,
        dest: Path,
        queries: list[str],
        reason: str,
        query_stats: list[dict],
        generation_policy: str = "normal",
        paid_generation_blocked_by_guard: bool = False,
        openverse_candidate_count: int = 0,
        best_real_score: int = 0,
        best_real_query: str = "",
    ) -> bool:
        policy_fields = _policy_fields(generation_policy, paid_generation_blocked_by_guard)
        if generation_policy == "free_only":
            _record_pipeline(
                stem,
                strategy="multi_query_visual",
                query_count=len(queries),
                queries=queries,
                query_stats=query_stats,
                openverse_candidate_count=openverse_candidate_count,
                unique_real_candidates=0,
                best_real_query=best_real_query,
                best_real_score=best_real_score,
                final_source="skipped",
                result="skipped_real_not_found",
                skip_reason=reason,
                generated_attempted=False,
                actual_cost_usd=0.0,
                cost_saved_vs_generated_usd=generated_image_cost if prompt else 0.0,
                **policy_fields,
            )
            return False

        if not prompt:
            _record_pipeline(
                stem,
                strategy="multi_query_visual",
                query_count=len(queries),
                queries=queries,
                query_stats=query_stats,
                openverse_candidate_count=openverse_candidate_count,
                unique_real_candidates=0,
                final_source="none",
                result=reason,
                generated_attempted=False,
                actual_cost_usd=0.0,
                cost_saved_vs_generated_usd=0.0,
                **policy_fields,
            )
            return False

        if not generate_images.generate_one(config, stem, prompt, dest=dest):
            _record_pipeline(
                stem,
                strategy="multi_query_visual",
                query_count=len(queries),
                queries=queries,
                query_stats=query_stats,
                openverse_candidate_count=openverse_candidate_count,
                unique_real_candidates=0,
                final_source="none",
                result=f"{reason}_generation_failed",
                generated_attempted=True,
                actual_cost_usd=0.0,
                cost_saved_vs_generated_usd=0.0,
                **policy_fields,
            )
            return False

        cost_tracker.record_image(log_dir, model=image_model, source="dalle", keyword=stem)
        img_sources[stem.lower()] = "gerada"
        _record_pipeline(
            stem,
            strategy="multi_query_visual",
            query_count=len(queries),
            queries=queries,
            query_stats=query_stats,
            openverse_candidate_count=openverse_candidate_count,
            unique_real_candidates=0,
            final_source="gerada",
            result=reason,
            generated_attempted=True,
            actual_cost_usd=generated_image_cost,
            cost_saved_vs_generated_usd=0.0,
            **policy_fields,
        )
        return True

    def _score_real_candidates(
        stem: str,
        prompt: str,
        dest: Path,
        generation_policy: str = "normal",
        paid_generation_blocked_by_guard: bool = False,
    ) -> bool:
        policy_fields = _policy_fields(generation_policy, paid_generation_blocked_by_guard)
        card_text = _card_content(stem)
        phrase, context = _card_phrase_and_context(card_text)
        keyword = _visual_subject(stem, prompt)
        queries = _card_google_queries(stem, prompt)
        if not queries:
            queries = _english_query_variants(prompt)[:max_queries] if prompt else []
        if generation_policy == "free_only" and not queries:
            _record_pipeline(
                stem,
                strategy="multi_query_visual",
                query_count=0,
                queries=[],
                query_stats=[],
                openverse_candidate_count=0,
                unique_real_candidates=0,
                best_real_score=0,
                final_source="skipped",
                result="skipped_no_real_queries",
                generated_attempted=False,
                actual_cost_usd=0.0,
                cost_saved_vs_generated_usd=generated_image_cost if prompt else 0.0,
                **policy_fields,
            )
            return False

        collected: list[dict] = []
        seen_urls: set[str] = set()
        query_stats: list[dict] = []

        for query in queries:
            raw_candidates = google_images.search_candidates(query, limit=real_candidate_limit)
            unique_for_query = 0
            for meta in raw_candidates:
                if len(collected) >= real_total_candidate_limit:
                    break
                url = meta.get("url") or meta.get("thumbnail")
                if not url or url in seen_urls:
                    continue
                seen_urls.add(url)
                collected.append(meta)
                unique_for_query += 1
            query_stats.append({
                "query": query,
                "raw_candidates": len(raw_candidates),
                "unique_candidates": unique_for_query,
            })
            if len(collected) >= real_total_candidate_limit:
                break

        if not collected:
            return _generate_without_real(
                stem,
                prompt,
                dest,
                queries,
                "no_real_candidates",
                query_stats,
                generation_policy,
                paid_generation_blocked_by_guard,
                openverse_candidate_count=0,
            )

        with tempfile.TemporaryDirectory(prefix="anki_imgjudge_") as tmpdir:
            real_candidates: list[dict] = []
            for idx, meta in enumerate(collected):
                tmp_path = Path(tmpdir) / f"real_{idx}.png"
                if not google_images.download_candidate(meta, tmp_path):
                    continue
                real_candidates.append({"path": str(tmp_path), "meta": {**meta, "kind": "real"}})

            if not real_candidates:
                return _generate_without_real(
                    stem,
                    prompt,
                    dest,
                    queries,
                    "real_download_failed",
                    query_stats,
                    generation_policy,
                    paid_generation_blocked_by_guard,
                    openverse_candidate_count=len(collected),
                )

            if not judge_enabled:
                ok = _save_real(real_candidates[0]["path"], stem, dest)
                if ok:
                    _record_pipeline(
                        stem,
                        strategy="multi_query_visual",
                        query_count=len(queries),
                        queries=queries,
                        query_stats=query_stats,
                        openverse_candidate_count=len(collected),
                        unique_real_candidates=len(real_candidates),
                        final_source="real",
                        result="judge_disabled",
                        generated_attempted=False,
                        actual_cost_usd=0.0,
                        cost_saved_vs_generated_usd=generated_image_cost,
                        **policy_fields,
                    )
                return ok

            real_rank = image_judge.rank_candidates(
                api_key=api_key,
                model=config["openai"].get("image_judge_model", "gpt-4.1-mini"),
                log_dir=log_dir,
                keyword=keyword,
                phrase=phrase,
                context=context,
                card_text=card_text,
                candidates=real_candidates,
                mode="real_only",
            )
            best_real_idx = max(0, min(int(real_rank.get("best_index", 0)), len(real_candidates) - 1))
            best_real_score = int(real_rank.get("best_score", 0) or 0)
            best_real = real_candidates[best_real_idx]
            best_real_query = best_real["meta"].get("query", "")
            real_judge_fields = {"judge_error": real_rank["error"]} if real_rank.get("error") else {}
            skip_generate_score = int(judge_cfg.get("real_skip_generate_score", 88))
            min_real_score = int(judge_cfg.get("real_min_score", 74))

            if best_real_score >= skip_generate_score:
                ok = _save_real(best_real["path"], stem, dest)
                if ok:
                    _record_pipeline(
                        stem,
                        strategy="multi_query_visual",
                        query_count=len(queries),
                        queries=queries,
                        query_stats=query_stats,
                        openverse_candidate_count=len(collected),
                        unique_real_candidates=len(real_candidates),
                        best_real_query=best_real_query,
                        best_real_score=best_real_score,
                        final_source="real",
                        result="real_won_before_generation",
                        generated_attempted=False,
                        actual_cost_usd=0.0,
                        cost_saved_vs_generated_usd=generated_image_cost,
                        **real_judge_fields,
                        **policy_fields,
                    )
                return ok

            if best_real_score >= min_real_score:
                ok = _save_real(best_real["path"], stem, dest)
                if ok:
                    _record_pipeline(
                        stem,
                        strategy="aggressive_real_first",
                        query_count=len(queries),
                        queries=queries,
                        query_stats=query_stats,
                        openverse_candidate_count=len(collected),
                        unique_real_candidates=len(real_candidates),
                        best_real_query=best_real_query,
                        best_real_score=best_real_score,
                        final_source="real",
                        result="real_accepted_before_generation",
                        generated_attempted=False,
                        actual_cost_usd=0.0,
                        cost_saved_vs_generated_usd=generated_image_cost,
                        **real_judge_fields,
                        **policy_fields,
                    )
                return ok

            if generation_policy == "free_only":
                _record_pipeline(
                    stem,
                    strategy="multi_query_visual",
                    query_count=len(queries),
                    queries=queries,
                    query_stats=query_stats,
                    openverse_candidate_count=len(collected),
                    unique_real_candidates=len(real_candidates),
                    best_real_query=best_real_query,
                    best_real_score=best_real_score,
                    final_source="skipped",
                    result="skipped_real_not_found",
                    skip_reason="real_too_weak",
                    generated_attempted=False,
                    actual_cost_usd=0.0,
                    cost_saved_vs_generated_usd=generated_image_cost if prompt else 0.0,
                    **real_judge_fields,
                    **policy_fields,
                )
                return False

            if not prompt:
                _record_pipeline(
                    stem,
                    strategy="multi_query_visual",
                    query_count=len(queries),
                    queries=queries,
                    query_stats=query_stats,
                    openverse_candidate_count=len(collected),
                    unique_real_candidates=len(real_candidates),
                    best_real_query=best_real_query,
                    best_real_score=best_real_score,
                    final_source="none",
                    result="no_generation_prompt_and_real_too_weak",
                    generated_attempted=False,
                    actual_cost_usd=0.0,
                    cost_saved_vs_generated_usd=0.0,
                    **real_judge_fields,
                    **policy_fields,
                )
                return False

            gen_path = Path(tmpdir) / "generated.png"
            if not generate_images.generate_one(config, stem, prompt, dest=gen_path):
                if best_real_score >= min_real_score:
                    ok = _save_real(best_real["path"], stem, dest)
                    if ok:
                        _record_pipeline(
                            stem,
                            strategy="multi_query_visual",
                            query_count=len(queries),
                            queries=queries,
                            query_stats=query_stats,
                            openverse_candidate_count=len(collected),
                            unique_real_candidates=len(real_candidates),
                            best_real_query=best_real_query,
                            best_real_score=best_real_score,
                            final_source="real",
                            result="generation_failed_real_kept",
                            generated_attempted=True,
                            actual_cost_usd=0.0,
                            cost_saved_vs_generated_usd=generated_image_cost,
                            **real_judge_fields,
                            **policy_fields,
                        )
                    return ok
                _record_pipeline(
                    stem,
                    strategy="multi_query_visual",
                    query_count=len(queries),
                    queries=queries,
                    query_stats=query_stats,
                    openverse_candidate_count=len(collected),
                    unique_real_candidates=len(real_candidates),
                    best_real_query=best_real_query,
                    best_real_score=best_real_score,
                    final_source="none",
                    result="generation_failed_real_too_weak",
                    generated_attempted=True,
                    actual_cost_usd=0.0,
                    cost_saved_vs_generated_usd=0.0,
                    **real_judge_fields,
                    **policy_fields,
                )
                return False

            compare = image_judge.rank_candidates(
                api_key=api_key,
                model=config["openai"].get("image_judge_model", "gpt-4.1-mini"),
                log_dir=log_dir,
                keyword=keyword,
                phrase=phrase,
                context=context,
                card_text=card_text,
                candidates=[
                    {"path": best_real["path"], "meta": {**best_real["meta"], "kind": "real-final"}},
                    {"path": str(gen_path), "meta": {"source": "openai", "query": prompt, "kind": "generated"}},
                ],
                mode="real_vs_generated",
            )
            compare_judge_fields = {"compare_judge_error": compare["error"]} if compare.get("error") else {}
            winner = int(compare.get("best_index", 0) or 0)
            scores = {item.get("index"): int(item.get("score", 0) or 0) for item in compare.get("candidates", [])}
            gen_score = scores.get(1, 0)
            real_score = scores.get(0, best_real_score)
            judge_fields = {**real_judge_fields, **compare_judge_fields}
            margin = int(judge_cfg.get("generated_win_margin", 4))

            if winner == 1 and gen_score >= real_score + margin:
                ok = _save_generated(gen_path, stem, dest)
                if ok:
                    _record_pipeline(
                        stem,
                        strategy="multi_query_visual",
                        query_count=len(queries),
                        queries=queries,
                        query_stats=query_stats,
                        openverse_candidate_count=len(collected),
                        unique_real_candidates=len(real_candidates),
                        best_real_query=best_real_query,
                        best_real_score=best_real_score,
                        generated_score=gen_score,
                        final_source="gerada",
                        result="generated_won",
                        generated_attempted=True,
                        actual_cost_usd=generated_image_cost,
                        cost_saved_vs_generated_usd=0.0,
                        **judge_fields,
                        **policy_fields,
                    )
                return ok

            if real_score >= min_real_score:
                ok = _save_real(best_real["path"], stem, dest)
                if ok:
                    _record_pipeline(
                        stem,
                        strategy="multi_query_visual",
                        query_count=len(queries),
                        queries=queries,
                        query_stats=query_stats,
                        openverse_candidate_count=len(collected),
                        unique_real_candidates=len(real_candidates),
                        best_real_query=best_real_query,
                        best_real_score=real_score,
                        generated_score=gen_score,
                        final_source="real",
                        result="real_won_after_compare",
                        generated_attempted=True,
                        actual_cost_usd=0.0,
                        cost_saved_vs_generated_usd=generated_image_cost,
                        **judge_fields,
                        **policy_fields,
                    )
                return ok

            ok = _save_generated(gen_path, stem, dest)
            if ok:
                _record_pipeline(
                    stem,
                    strategy="multi_query_visual",
                    query_count=len(queries),
                    queries=queries,
                    query_stats=query_stats,
                    openverse_candidate_count=len(collected),
                    unique_real_candidates=len(real_candidates),
                    best_real_query=best_real_query,
                    best_real_score=real_score,
                    generated_score=gen_score,
                    final_source="gerada",
                    result="generated_defaulted",
                    generated_attempted=True,
                    actual_cost_usd=generated_image_cost,
                    cost_saved_vs_generated_usd=0.0,
                    **judge_fields,
                    **policy_fields,
                )
            return ok

    if img_source == "1":
        with _make_progress(
            SpinnerColumn(),
            TextColumn("[bold blue]Buscando e julgando imagens[/bold blue]"),
            BarColumn(bar_width=28),
            TextColumn("{task.completed}/{task.total}"),
        ) as prog:
            task = prog.add_task("img", total=max(total_images, 1))
            for line in prompt_lines:
                if ":" not in line:
                    prog.update(task, advance=1)
                    continue
                stem, prompt = line.split(":", 1)
                stem, prompt = stem.strip(), prompt.strip()
                dest = output_dir / f"{stem}.png"

                if dest.exists() and dest.stat().st_size > 0:
                    img_files.append(dest.name)
                    description = f"[dim]{stem} (cached)[/dim]"
                    prog.update(task, advance=1, description=description)
                    continue

                generation_policy = "normal"
                paid_generation_blocked_by_guard = False

                ok = _score_real_candidates(
                    stem,
                    prompt,
                    dest,
                    generation_policy=generation_policy,
                    paid_generation_blocked_by_guard=paid_generation_blocked_by_guard,
                )
                if ok:
                    img_files.append(dest.name)
                    description = f"[dim]{stem}[/dim]"
                elif generation_policy == "free_only":
                    n_skipped += 1
                    description = f"[dim]{stem} - sem foto real[/dim]"
                else:
                    description = f"[dim]{stem}[/dim]"
                prog.update(task, advance=1, description=description)
    else:
        with _make_progress(
            SpinnerColumn(),
            TextColumn("[bold blue]Gerando imagens com DALL-E[/bold blue]"),
            BarColumn(bar_width=28),
            TextColumn("{task.completed}/{task.total}"),
        ) as prog:
            task = prog.add_task("dalle", total=max(total_images, 1))
            for line in prompt_lines:
                if ":" not in line:
                    prog.update(task, advance=1)
                    continue
                stem, prompt = line.split(":", 1)
                stem, prompt = stem.strip(), prompt.strip()
                dest_dalle = output_dir / f"{stem}.png"
                if dest_dalle.exists() and dest_dalle.stat().st_size > 0:
                    img_files.append(dest_dalle.name)
                    prog.update(task, advance=1, description=f"[dim]{stem} (cached)[/dim]")
                    continue
                if not _wants_image(stem, prompt):
                    n_skipped += 1
                    _record_pipeline(
                        stem,
                        strategy="direct_generation",
                        final_source="skipped",
                        result="abstract_guard",
                        generated_attempted=False,
                        actual_cost_usd=0.0,
                        cost_saved_vs_generated_usd=0.0,
                    )
                    prog.update(task, advance=1, description=f"[dim]{stem} - abstrato, sem imagem[/dim]")
                    continue
                if generate_images.generate_one(config, stem, prompt):
                    img_files.append(f"{stem}.png")
                    cost_tracker.record_image(log_dir, model=image_model, source="dalle", keyword=stem)
                    img_sources[stem.lower()] = "gerada"
                    _record_pipeline(
                        stem,
                        strategy="direct_generation",
                        final_source="gerada",
                        result="generated_direct",
                        generated_attempted=True,
                        actual_cost_usd=generated_image_cost,
                        cost_saved_vs_generated_usd=0.0,
                    )
                else:
                    _record_pipeline(
                        stem,
                        strategy="direct_generation",
                        final_source="none",
                        result="generation_failed",
                        generated_attempted=True,
                        actual_cost_usd=0.0,
                        cost_saved_vs_generated_usd=0.0,
                    )
                prog.update(task, advance=1, description=f"[dim]{stem}[/dim]")

    return img_files, n_skipped, img_sources


def _print_costs(log_dir: str):
    costs = cost_tracker.summary(log_dir)

    t = Table(box=box.SIMPLE, show_header=True, header_style="bold dim", padding=(0, 2))
    t.add_column("Período")
    t.add_column("Custo total")
    t.add_column("Detalhes")
    for label, key in [("Hoje", "today"), ("Semana", "week"), ("Mês", "month"), ("Total geral", "alltime")]:
        d = costs[key]
        details_parts = []
        if d["n_images_dalle"]:
            details_parts.append(f"{d['n_images_dalle']} img DALL-E")
        if d["n_images_google"]:
            details_parts.append(f"{d['n_images_google']} img Google (grátis)")
        if d["n_cards"]:
            details_parts.append(f"{d['n_cards']} cards")
        t.add_row(label, f"[bold green]${d['total_usd']:.4f}[/bold green]", "  ".join(details_parts) or "—")

    console.print(Panel(t, title="[bold cyan]💰  Custos de API[/bold cyan]", expand=False))


def _post_run_menu(config: dict) -> bool:
    """Show end-of-run options. Returns True to run again, False to exit."""
    console.print()
    console.print(Panel(
        "  [bold][R][/bold]  Criar mais cards  (voltar ao início)\n"
        "  [bold][C][/bold]  Ver histórico de custos\n"
        "  [bold][Q][/bold]  Sair",
        title="[bold]O que deseja fazer agora?[/bold]",
        expand=False,
        border_style="dim",
    ))

    while True:
        choice = console.input("  [bold yellow]→ [/bold yellow]").strip().upper()
        if choice == "R":
            return True
        if choice == "C":
            _print_costs(config["paths"]["log_dir"])
        elif choice == "Q" or choice == "":
            console.print("\n[dim]  Até logo! Pressione Enter para fechar.[/dim]")
            input()
            return False
        else:
            _tip("Digite R, C ou Q")


def _pipeline(config: dict, lang: str, img_source: str):
    mining_path = Path(config["paths"]["mining_file"])
    deck_name   = config["anki"]["deck_name"]
    lang_label  = _LANG_LABELS[lang]
    log_dir     = config["paths"]["log_dir"]
    api_key     = config["openai_api_key"]
    model       = config["openai"].get("chat_model", "gpt-4o")

    if lang == "ru":
        entries = parse_mining_file_ru(mining_path)
    else:
        entries = parse_mining_file(mining_path)

    all_jobs  = [job for entry in entries for job in get_card_jobs(entry)]
    n_entries = len(entries)
    n_cards   = len(all_jobs)

    _section("Gerando cards")
    _tip(f"{n_entries} linha(s) → {n_cards} card(s) a criar  |  modelo: {model}")
    console.print()

    with _make_progress(
        SpinnerColumn(),
        TextColumn("[bold green]Criando conteúdo dos cards com IA[/bold green]"),
        BarColumn(bar_width=28),
        TextColumn("{task.completed}/{task.total} cards"),
    ) as prog:
        task = prog.add_task("cards", total=max(n_cards, 1))

        saved, t1 = _run_stage(
            "Criando conteúdo dos cards com IA",
            generate_cards.run, entries, config,
        )

    _success(f"{len(saved)} card(s) criado(s) em {t1:.1f}s")

    n_prompts, _ = _run_stage("Extraindo prompts de imagem", extract_prompts.run, entries, config)

    _section("Gerando áudio")
    _tip("Pronunciacao via Google TTS com sotaques separados para palavra e frase")
    console.print()

    total_audio = n_cards * 2
    with _make_progress(
        SpinnerColumn(),
        TextColumn(f"[bold green]Áudio ({lang_label})[/bold green]"),
        BarColumn(bar_width=28),
        TextColumn("{task.completed}/{task.total} arquivos"),
    ) as prog:
        task = prog.add_task("audio", total=total_audio)
        def _audio_cb(done, total, label):
            prog.update(task, completed=done, description=f"[dim]{label}[/dim]")
        audio_files = generate_audio.run(entries, config, progress_callback=_audio_cb)

    _success(f"{len(audio_files)} arquivo(s) de áudio")

    _section("Buscando / gerando imagens")
    src_label = _IMG_SOURCE_LABELS[img_source].split("(")[0].strip()
    _tip(f"Fonte: {src_label}  |  Fotos reais passam por um juiz antes do fallback gerado")
    console.print()

    prompts_file = Path(config["paths"]["prompts_file"])
    prompt_lines = [l for l in prompts_file.read_text(encoding="utf-8").splitlines() if l.strip()]
    output_dir   = Path(config["paths"]["output_dir"])

    img_files, n_skipped, img_sources = _run_images(config, prompt_lines, output_dir, img_source, api_key, log_dir)

    _success(f"{len(img_files)} imagem(ns) obtida(s)")
    if n_skipped:
        _tip(f"{n_skipped} keyword(s) abstrata(s) pulada(s) pelo filtro inteligente")

    _section("Enviando para o Anki")
    _tip("O Anki precisa estar aberto com o plugin AnkiConnect instalado")
    console.print()

    try:
        results, _ = _run_stage(f"Enviando cards para o deck '{deck_name}'", send_to_anki.run, entries, config)
    except Exception as exc:
        _error(f"Não foi possível conectar ao Anki: {exc}")
        _tip("Verifique se o Anki está aberto e se o AnkiConnect está instalado (código 2055492159)")
        results = {}

    added_count = sum(1 for v in results.values() if v == send_to_anki.ADDED)
    dup_count   = sum(1 for v in results.values() if v == send_to_anki.DUPLICATE)
    ok_count   = added_count + dup_count
    fail_count = len(results) - ok_count
    output_folder = Path(config["paths"]["output_dir"])

    _section("Resultado")

    saved_lower = {s.lower() for s in saved}
    audio_lower = {f.lower() for f in audio_files}
    img_lower   = {f.lower() for f in img_files}

    status_table = Table(
        title="",
        show_header=True,
        header_style="bold cyan",
        box=box.SIMPLE,
        padding=(0, 2),
    )
    status_table.add_column("Palavra",  style="bold", min_width=20)
    status_table.add_column("Texto",    justify="center")
    status_table.add_column("Audio",    justify="center")
    status_table.add_column("Imagem",   justify="center")
    status_table.add_column("Origem Img", justify="center")
    status_table.add_column("No Anki",  justify="center")

    for job in all_jobs:
        sl = job.filename_stem.lower()
        has_image = f"{sl}.png" in img_lower
        status_table.add_row(
            job.keyword,
            _ok(sl in saved_lower),
            _ok(f"{sl}_word.mp3" in audio_lower),
            _ok(has_image),
            img_sources.get(sl, "-") if has_image else "-",
            _ok(send_to_anki.is_present(results.get(job.filename_stem, results.get(sl)))),
        )

    console.print(status_table)

    send_to_anki.cleanup_output(output_folder, results)

    cost_tracker.record_session(log_dir, n_cards=ok_count, total_cost_usd=0.0,
                                deck=deck_name, lang=lang)

    console.print()
    console.print(Panel(
        f"  [dim]Palavras processadas:[/dim]  [bold]{n_entries}[/bold]\n"
        f"  [dim]Cards criados:[/dim]         [bold]{n_cards}[/bold]\n"
        f"  [dim]Enviados ao Anki:[/dim]       [bold green]{added_count}[/bold green]"
        + (f"\n  [dim]Já existiam (duplicados):[/dim] [bold yellow]{dup_count}[/bold yellow]" if dup_count else "")
        + (f"\n  [dim]Falhas:[/dim]               [bold red]{fail_count}[/bold red]" if fail_count else "") +
        f"\n  [dim]Deck:[/dim]                  [bold]{deck_name}[/bold]",
        title="[bold green]  Concluído  [/bold green]",
        expand=False,
        border_style="green",
    ))

    _print_costs(log_dir)


def start() -> None:
    config = load_config()

    while True:
        lang = _select_session(config)
        mining_path = Path(config["paths"]["mining_file"])

        _, img_source = _get_user_input(mining_path, lang)

        try:
            _pipeline(config, lang, img_source)
        except KeyboardInterrupt:
            console.print("\n[dim]  Interrompido pelo usuário.[/dim]")
        except Exception as exc:
            console.print()
            _error(f"Erro inesperado: {exc}")
            _tip("Verifique sua conexão, chave de API e se o Anki está aberto.")

        again = _post_run_menu(config)
        if not again:
            break

        # Reload config so a fresh session starts cleanly
        config = load_config()


if __name__ == "__main__":
    start()

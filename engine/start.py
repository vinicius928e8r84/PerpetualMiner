"""
start.py — PerpetualMiner orchestrator with rich terminal UI.
"""

import re
import time
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
import send_to_anki
import cost_tracker
import image_pipeline
import tts_accents
from image_queries import (  # noqa: F401 - the tests (and the bridge) reach them through `start`
    _build_card_google_queries, _card_phrase_and_context_from_text, _visual_subject_for_card,
)

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
    n_skipped = 0
    pipeline = image_pipeline.build(config, output_dir, img_source, api_key, log_dir)
    img_sources = pipeline.img_sources

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

                ok = pipeline.real_first(
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
                outcome = pipeline.generate_direct(stem, prompt, dest_dalle)
                if outcome == "skipped":
                    n_skipped += 1
                    prog.update(task, advance=1, description=f"[dim]{stem} - abstrato, sem imagem[/dim]")
                    continue
                if outcome == "ok":
                    img_files.append(f"{stem}.png")
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

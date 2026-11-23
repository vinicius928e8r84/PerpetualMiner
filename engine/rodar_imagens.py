"""Os testes de imagem do motor rodam isto: o que o Envio faz com cada linha `stem:prompt`, visto de fora."""

import image_pipeline
from image_queries import _build_card_google_queries  # noqa: F401 - os testes de imagem a pedem daqui


MADE, SKIPPED, NONE = "made", "skipped", "none"
DIRECT_RESULTS = {"ok": MADE, "skipped": SKIPPED}


def _split_line(line: str):
    if ":" not in line:
        return None
    stem, prompt = (parte.strip() for parte in line.split(":", 1))
    return stem, prompt


def _already_made(dest) -> bool:
    return dest.exists() and dest.stat().st_size > 0


def _picture_for(pipeline, stem: str, prompt: str, dest) -> str:
    if _already_made(dest):
        return MADE
    if pipeline.img_source == "1":
        return MADE if pipeline.real_first(stem, prompt, dest, generation_policy="normal") else NONE
    return DIRECT_RESULTS.get(pipeline.generate_direct(stem, prompt, dest), NONE)


def _run_images(pipeline, prompt_lines):
    """What the Envio does with each `stem:prompt` line, seen from outside: the files made, the lines skipped and where each
    picture came from. "1" is the real photo first; any other value generates the picture."""
    img_files: list[str] = []
    n_skipped = 0
    for line in prompt_lines:
        parsed = _split_line(line)
        if parsed is None:
            continue
        stem, prompt = parsed
        dest = pipeline.output_dir / f"{stem}.png"
        result = _picture_for(pipeline, stem, prompt, dest)
        if result == MADE:
            img_files.append(dest.name)
        n_skipped += result == SKIPPED
    return img_files, n_skipped, pipeline.img_sources

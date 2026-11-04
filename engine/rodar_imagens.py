"""Os testes de imagem do motor rodam isto: o que o Envio faz com cada linha `stem:prompt`, visto de fora."""

import image_pipeline
from image_queries import _build_card_google_queries  # noqa: F401 - os testes de imagem a pedem daqui


def _run_images(config, prompt_lines, output_dir, img_source, api_key, log_dir):
    """What the Envio does with each `stem:prompt` line, seen from outside: the files made, the lines skipped and where each
    picture came from. "1" is the real photo first; any other value generates the picture."""
    img_files: list[str] = []
    n_skipped = 0
    pipeline = image_pipeline.build(config, output_dir, img_source, api_key, log_dir)
    for line in prompt_lines:
        if ":" not in line:
            continue
        stem, prompt = (parte.strip() for parte in line.split(":", 1))
        dest = output_dir / f"{stem}.png"
        if dest.exists() and dest.stat().st_size > 0:
            img_files.append(dest.name)
        elif img_source == "1":
            if pipeline.real_first(stem, prompt, dest, generation_policy="normal", paid_generation_blocked_by_guard=False):
                img_files.append(dest.name)
        else:
            outcome = pipeline.generate_direct(stem, prompt, dest)
            if outcome == "skipped":
                n_skipped += 1
            elif outcome == "ok":
                img_files.append(dest.name)
    return img_files, n_skipped, pipeline.img_sources

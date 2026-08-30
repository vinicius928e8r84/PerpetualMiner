"""
generate_images.py — Generate images via OpenAI Images API and save to Output/.

Reads keyword:prompt pairs from prompts.txt (written by extract_prompts.py).
Output filenames: {stem}.png  (stem matches the keyword's safe filename).

Model is read from config (openai.image_model). gpt-image-1 returns base64
(b64_json); dall-e-* historically returned a URL. Both are handled.
"""

import base64
import requests
import openai
from pathlib import Path
from typing import Callable, List, Optional

from config_loader import load_config


# ── helpers ───────────────────────────────────────────────────────────────────

def _save_from_response(item, dest: Path) -> bool:
    """Persist one image result to *dest*, handling both b64 and URL payloads."""
    # gpt-image-1 (and gpt-image-* family) return base64-encoded bytes directly.
    b64 = getattr(item, "b64_json", None)
    if b64:
        try:
            dest.write_bytes(base64.b64decode(b64))
            return True
        except Exception:
            return False

    # Legacy dall-e path: download from the returned URL.
    url = getattr(item, "url", None)
    if url:
        try:
            r = requests.get(url, timeout=60)
            if r.status_code == 200:
                dest.write_bytes(r.content)
                return True
        except Exception:
            pass
    return False


def generate_one(config: dict, stem: str, prompt: str, dest: Optional[Path] = None) -> bool:
    """Generate a single image for one prompt and save it to Output/{stem}.png."""
    openai.api_key = config["openai_api_key"]
    output_dir = Path(config["paths"]["output_dir"])
    output_dir.mkdir(exist_ok=True)

    resp = openai.images.generate(
        model=config["openai"]["image_model"],
        prompt=prompt,
        n=1,
        size=config["openai"]["image_size"],
    )
    item = resp.data[0]
    dest = dest or (output_dir / f"{stem}.png")
    return _save_from_response(item, dest)


# ── public API ────────────────────────────────────────────────────────────────

def run(
    config: dict,
    progress_callback: Optional[Callable[[int, int, str], None]] = None,
) -> List[str]:
    """Generate and download one image per prompt in prompts.txt.

    progress_callback(done, total, stem) is called after each image attempt.
    Returns list of successfully downloaded filenames.
    """
    openai.api_key = config["openai_api_key"]
    output_dir  = Path(config["paths"]["output_dir"])
    log_dir     = Path(config["paths"]["log_dir"])
    prompts_file = Path(config["paths"]["prompts_file"])

    output_dir.mkdir(exist_ok=True)
    log_dir.mkdir(exist_ok=True)

    lines = [l.strip() for l in prompts_file.read_text(encoding="utf-8").splitlines() if l.strip()]
    total = len(lines)
    generated: List[str] = []
    log_lines: List[str] = []

    for i, line in enumerate(lines):
        if ":" not in line:
            continue
        stem, prompt = line.split(":", 1)
        stem   = stem.strip()
        prompt = prompt.strip()

        try:
            resp = openai.images.generate(
                model=config["openai"]["image_model"],
                prompt=prompt,
                n=1,
                size=config["openai"]["image_size"],
            )
            item = resp.data[0]
            dest = output_dir / f"{stem}.png"
            ok   = _save_from_response(item, dest)
            log_lines.append(f"{stem}: {prompt}\n{dest.name if ok else 'SAVE_FAILED'}\n")
            if ok:
                generated.append(dest.name)
                print(f"[DEBUG] Imagem salva em {dest.resolve()}")
            else:
                print(f"[ERROR] Não foi possível salvar imagem para '{stem}'")
        except Exception as exc:
            log_lines.append(f"{stem}: ERROR — {exc}\n")
            print(f"[ERROR] Geração de imagem falhou para '{stem}': {exc}")

        if progress_callback:
            progress_callback(i + 1, total, stem)

    (log_dir / "generated_images.txt").write_text("\n".join(log_lines), encoding="utf-8")
    return generated


if __name__ == "__main__":
    cfg = load_config()
    result = run(cfg)
    print(f"✅ {len(result)} image(s) generated.")

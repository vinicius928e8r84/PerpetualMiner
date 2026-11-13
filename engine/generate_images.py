"""
generate_images.py — Generate images via OpenAI Images API and save to Output/.

Reads keyword:prompt pairs from prompts.txt (written by extract_prompts.py).
Output filenames: {stem}.png  (stem matches the keyword's safe filename).

Model is read from config (openai.image_model). gpt-image-* models return
base64 (b64_json); dall-e-* historically returned a URL. Both are handled.

A failed generation (model retired or unavailable, rate limit, network, ...) never
raises out of this module: the card just goes on without a generated image and the
reason is printed and appended to log/image_generation_failures.jsonl.
"""

import base64
import json
import logging
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Callable, List, Optional

if __package__:  # inside the Anki add-on the engine is the package `complemento.motor`
    from . import openai_http, provedores
    from .config_loader import load_config
else:
    import openai_http
    import provedores
    from config_loader import load_config

LOGGER = logging.getLogger("perpetualminer.motor")  # inside the Anki add-on nothing goes to stdout

FAILURES_LOG = "image_generation_failures.jsonl"


def _failure_reason(exc: Exception) -> str:
    """Short label for why a generation failed: model_unavailable or generation_error."""
    if isinstance(exc, provedores.ErroDoProvedor) and exc.status == 404:
        return "model_unavailable"
    return "generation_error"


def _log_failure(config: dict, stem: str, exc: Exception) -> str:
    """Log the failure and append it to the log dir. Returns the reason label."""
    reason = _failure_reason(exc)
    model = config["openai"]["image_model"]
    LOGGER.warning("Geração de imagem falhou para '%s' (%s, modelo %s): %s", stem, reason, model, exc)
    try:
        log_dir = Path(config["paths"]["log_dir"])
        log_dir.mkdir(exist_ok=True)
        entry = {
            "time": datetime.now().isoformat(timespec="seconds"),
            "keyword": stem,
            "model": model,
            "reason": reason,
            "error": f"{type(exc).__name__}: {exc}",  # an ErroDaOpenAI says only its code and status, never OpenAI's text
        }
        with (log_dir / FAILURES_LOG).open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception:
        pass
    return reason


def _save_from_response(item: dict, dest: Path) -> bool:
    """Persist one image result to *dest*, handling both b64 and URL payloads."""
    # gpt-image-1 (and gpt-image-* family) return base64-encoded bytes directly.
    b64 = item.get("b64_json")
    if b64:
        try:
            dest.write_bytes(base64.b64decode(b64))
            return True
        except Exception:
            return False

    # Legacy dall-e path: download from the returned URL.
    url = item.get("url")
    if url and url.startswith(("http://", "https://")):
        try:
            with urllib.request.urlopen(urllib.request.Request(url), timeout=60, context=openai_http.contexto_tls()) as r:
                if r.status == 200:
                    dest.write_bytes(r.read())
                    return True
        except Exception:
            pass
    return False


def _generate(config: dict, prompt: str) -> dict:
    """Ask the Images API for one image: the answer's first item (`{}` if none)."""
    cred = {"provedor": provedores.OPENAI, "segredo": config["openai_api_key"], "modelo": config["openai"]["image_model"], "base": config.get("openai_base")}
    return provedores.imagem(cred, prompt, config["openai"]["image_size"])


def generate_one(config: dict, stem: str, prompt: str, dest: Optional[Path] = None) -> bool:
    """Generate a single image for one prompt and save it to Output/{stem}.png.

    Returns False (never raises) when the generation fails, so the caller keeps the
    card without a generated image.
    """
    try:
        output_dir = Path(config["paths"]["output_dir"])
        output_dir.mkdir(exist_ok=True)

        item = _generate(config, prompt)
        dest = dest or (output_dir / f"{stem}.png")
        return _save_from_response(item, dest)
    except Exception as exc:
        _log_failure(config, stem, exc)
        return False


def run(
    config: dict,
    progress_callback: Optional[Callable[[int, int, str], None]] = None,
) -> List[str]:
    """Generate and download one image per prompt in prompts.txt.

    progress_callback(done, total, stem) is called after each image attempt.
    Returns list of successfully downloaded filenames.
    """
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
            item = _generate(config, prompt)
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
            _log_failure(config, stem, exc)

        if progress_callback:
            progress_callback(i + 1, total, stem)

    (log_dir / "generated_images.txt").write_text("\n".join(log_lines), encoding="utf-8")
    return generated


if __name__ == "__main__":
    cfg = load_config()
    result = run(cfg)
    print(f"✅ {len(result)} image(s) generated.")

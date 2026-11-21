from pathlib import Path


PROMPT_KEYS = ("en_card", "ru_card")


def _configured_prompt_path(config: dict, prompt_key: str) -> str:
    if prompt_key not in PROMPT_KEYS:
        raise KeyError(f"Unknown prompt key: {prompt_key}")

    prompt_paths = config.get("paths", {}).get("prompts", {})
    prompt_path = prompt_paths.get(prompt_key)
    if not prompt_path:
        raise KeyError(f"Prompt path not configured for '{prompt_key}'")
    return prompt_path


def load_prompt(config: dict, prompt_key: str) -> str:
    prompt_path = _configured_prompt_path(config, prompt_key)
    text = Path(prompt_path).read_text(encoding="utf-8").strip()
    if not text:
        raise ValueError(f"Prompt file is empty: {prompt_path}")
    return text

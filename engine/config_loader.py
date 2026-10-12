"""
config_loader.py — Load config.yaml and inject secrets from .env.
"""

import os
import yaml
from pathlib import Path
from dotenv import load_dotenv


def load_config() -> dict:
    """Return merged config dict with API keys injected from environment."""
    load_dotenv()

    config_path = Path(__file__).parent / "config.yaml"
    with open(config_path, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)

    api_key = os.getenv("OPENAI_API_KEY", "")
    if not api_key or api_key == "your-openai-api-key-here":
        raise EnvironmentError(
            "OPENAI_API_KEY is not set. Add it to your .env file."
        )
    config["openai_api_key"] = api_key

    return config

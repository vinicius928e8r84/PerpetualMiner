"""
cost_tracker.py — Log API costs per session and expose daily/weekly/monthly summaries.

Costs are appended to log/costs.jsonl (one JSON object per line).
Pricing constants reflect OpenAI list prices as of 2025-05 — update as needed.
"""

from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path
from typing import Optional


PRICES = {
    # Assistant API uses gpt-4o under the hood by default
    "gpt-4o": {"input": 0.0025, "output": 0.01},
    "gpt-4o-mini": {"input": 0.00015, "output": 0.0006},
    "gpt-4.1": {"input": 0.002, "output": 0.008},
    "gpt-4.1-mini": {"input": 0.0004, "output": 0.0016},
    # Images — flat per-image price
    "dall-e-3-1024": 0.040,
    "dall-e-3-512":  0.020,
    "gpt-image-1":   0.040,
}


def _log_path(log_dir: str | Path) -> Path:
    return Path(log_dir) / "costs.jsonl"


def record_tokens(
    log_dir: str | Path,
    model: str,
    input_tokens: int,
    output_tokens: int,
    keyword: str = "",
) -> float:
    """Append a token-usage record. Returns USD cost."""
    price = PRICES.get(model, PRICES["gpt-4o"])
    cost = (input_tokens * price["input"] + output_tokens * price["output"]) / 1000
    _append(log_dir, {
        "date": date.today().isoformat(),
        "type": "tokens",
        "model": model,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cost_usd": round(cost, 6),
        "keyword": keyword,
    })
    return cost


def record_plan_tokens(
    log_dir: str | Path,
    plan_model: str,
    key_model: str,
    input_tokens: int,
    output_tokens: int,
    keyword: str = "",
) -> float:
    """Append the usage of a card made through the ChatGPT plan. Returns what the key would have charged (USD):
    the plan costs nothing per card, so `cost_usd` stays 0 and `would_cost_usd` is priced as `key_model`."""
    price = PRICES.get(key_model, PRICES["gpt-4o"])
    would = (input_tokens * price["input"] + output_tokens * price["output"]) / 1000
    _append(log_dir, {
        "date": date.today().isoformat(),
        "type": "plan_tokens",
        "model": plan_model,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cost_usd": 0.0,
        "would_cost_usd": round(would, 6),
        "keyword": keyword,
    })
    return would


def record_image(
    log_dir: str | Path,
    model: str = "dall-e-3-1024",
    keyword: str = "",
    source: str = "dalle",
) -> float:
    """Append an image-generation record. Returns USD cost (0 for Google)."""
    cost = PRICES.get(model, 0.040) if source == "dalle" else 0.0
    _append(log_dir, {
        "date": date.today().isoformat(),
        "type": "image",
        "model": model,
        "source": source,
        "cost_usd": round(cost, 6),
        "keyword": keyword,
    })
    return cost


def record_image_pipeline(
    log_dir: str | Path,
    keyword: str,
    **fields,
) -> None:
    """Append image-pipeline metrics for later analysis."""
    record = {
        "date": date.today().isoformat(),
        "type": "image_pipeline",
        "keyword": keyword,
    }
    record.update(fields)
    _append(log_dir, record)


def record_session(
    log_dir: str | Path,
    n_cards: int,
    total_cost_usd: float,
    deck: str = "",
    lang: str = "",
) -> None:
    """Append a session-level summary record."""
    _append(log_dir, {
        "date": date.today().isoformat(),
        "type": "session",
        "n_cards": n_cards,
        "cost_usd": round(total_cost_usd, 6),
        "deck": deck,
        "lang": lang,
    })


def _append(log_dir: str | Path, record: dict) -> None:
    p = _log_path(log_dir)
    p.parent.mkdir(exist_ok=True)
    with p.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def _load(log_dir: str | Path) -> list[dict]:
    p = _log_path(log_dir)
    if not p.exists():
        return []
    records = []
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return records


def _sum_period(records: list[dict], since: date) -> dict:
    total = 0.0
    by_model: dict[str, float] = {}
    n_cards = 0
    n_images_dalle = 0
    n_images_google = 0
    for r in records:
        if date.fromisoformat(r["date"]) < since:
            continue
        cost = r.get("cost_usd", 0.0)
        total += cost
        if r["type"] == "tokens":
            by_model[r["model"]] = by_model.get(r["model"], 0.0) + cost
        elif r["type"] == "image":
            if r.get("source") == "google":
                n_images_google += 1
            else:
                n_images_dalle += 1
                by_model[r["model"]] = by_model.get(r["model"], 0.0) + cost
        elif r["type"] == "session":
            n_cards += r.get("n_cards", 0)
    return {
        "total_usd": round(total, 4),
        "by_model": {k: round(v, 4) for k, v in by_model.items()},
        "n_cards": n_cards,
        "n_images_dalle": n_images_dalle,
        "n_images_google": n_images_google,
    }


def summary(log_dir: str | Path) -> dict:
    """Return cost summaries for today, this week, and this month."""
    records = _load(log_dir)
    today = date.today()
    return {
        "today":   _sum_period(records, today),
        "week":    _sum_period(records, today - timedelta(days=today.weekday())),
        "month":   _sum_period(records, today.replace(day=1)),
        "alltime": _sum_period(records, date(2000, 1, 1)),
    }

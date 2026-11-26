from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path
from typing import NamedTuple, Optional


PRICES = {
    "gpt-4o": {"input": 0.0025, "output": 0.01},
    "gpt-4o-mini": {"input": 0.00015, "output": 0.0006},
    "gpt-4.1": {"input": 0.002, "output": 0.008},
    "gpt-4.1-mini": {"input": 0.0004, "output": 0.0016},
    "dall-e-3-1024": 0.040,
    "dall-e-3-512":  0.020,
    "gpt-image-1":   0.040,
}


def _log_path(log_dir: str | Path) -> Path:
    return Path(log_dir) / "costs.jsonl"


class TokenUsage(NamedTuple):
    model: str
    input_tokens: int
    output_tokens: int

    def priced_as(self, model: str) -> float:
        price = PRICES.get(model, PRICES["gpt-4o"])
        return (self.input_tokens * price["input"] + self.output_tokens * price["output"]) / 1000


def _token_record(kind: str, usage: TokenUsage, cost: float) -> dict:
    return {
        "date": date.today().isoformat(),
        "type": kind,
        "model": usage.model,
        "input_tokens": usage.input_tokens,
        "output_tokens": usage.output_tokens,
        "cost_usd": round(cost, 6),
    }


def record_tokens(log_dir: str | Path, usage: TokenUsage, keyword: str = "") -> float:
    cost = usage.priced_as(usage.model)
    _append(log_dir, dict(_token_record("tokens", usage, cost), keyword=keyword))
    return cost


def record_plan_tokens(log_dir: str | Path, usage: TokenUsage, key_model: str, keyword: str = "") -> float:
    would = usage.priced_as(key_model)
    _append(log_dir, dict(_token_record("plan_tokens", usage, 0.0), would_cost_usd=round(would, 6), keyword=keyword))
    return would


def record_correction(log_dir: str | Path, usage: TokenUsage, paid: bool = True) -> float:
    cost = usage.priced_as(usage.model) if paid else 0.0
    _append(log_dir, _token_record("correction_tokens", usage, cost))
    return cost


def record_image(
    log_dir: str | Path,
    model: str = "dall-e-3-1024",
    keyword: str = "",
    source: str = "dalle",
) -> float:
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
    record = {
        "date": date.today().isoformat(),
        "type": "image_pipeline",
        "keyword": keyword,
    }
    record.update(fields)
    _append(log_dir, record)


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


class _Contribution(NamedTuple):
    cost: float
    model: Optional[str] = None
    n_cards: int = 0
    n_images_dalle: int = 0
    n_images_google: int = 0


def _read_tokens(r: dict) -> _Contribution:
    return _Contribution(r.get("cost_usd", 0.0), model=r["model"])


def _read_image(r: dict) -> _Contribution:
    cost = r.get("cost_usd", 0.0)
    if r.get("source") == "google":
        return _Contribution(cost, n_images_google=1)
    return _Contribution(cost, model=r["model"], n_images_dalle=1)


def _read_session(r: dict) -> _Contribution:
    return _Contribution(r.get("cost_usd", 0.0), n_cards=r.get("n_cards", 0))


def _read_other(r: dict) -> _Contribution:
    return _Contribution(r.get("cost_usd", 0.0))


_READERS = {"tokens": _read_tokens, "image": _read_image, "session": _read_session}


def _read_record(r: dict) -> _Contribution:
    return _READERS.get(r["type"], _read_other)(r)


class _Period:
    def __init__(self) -> None:
        self.total = 0.0
        self.by_model: dict[str, float] = {}
        self.n_cards = 0
        self.n_images_dalle = 0
        self.n_images_google = 0

    def add(self, read: _Contribution) -> None:
        self.total += read.cost
        if read.model is not None:
            self.by_model[read.model] = self.by_model.get(read.model, 0.0) + read.cost
        self.n_cards += read.n_cards
        self.n_images_dalle += read.n_images_dalle
        self.n_images_google += read.n_images_google

    def summary(self) -> dict:
        return {
            "total_usd": round(self.total, 4),
            "by_model": {k: round(v, 4) for k, v in self.by_model.items()},
            "n_cards": self.n_cards,
            "n_images_dalle": self.n_images_dalle,
            "n_images_google": self.n_images_google,
        }


def _sum_period(records: list[dict], since: date) -> dict:
    period = _Period()
    for r in records:
        if date.fromisoformat(r["date"]) >= since:
            period.add(_read_record(r))
    return period.summary()


def summary(log_dir: str | Path) -> dict:
    records = _load(log_dir)
    today = date.today()
    return {
        "today":   _sum_period(records, today),
        "week":    _sum_period(records, today - timedelta(days=today.weekday())),
        "month":   _sum_period(records, today.replace(day=1)),
        "alltime": _sum_period(records, date(2000, 1, 1)),
    }

"""Analytics de jobs do PerpetualMiner (candidato C do refactor de deep modules).

Extraido de bridge/server.py: le snapshots de jobs do disco (queue.json +
jobs_root/<id>/{job.json,state.json,log/costs.jsonl}) e agrega custos/imagens/
cartoes em summaries e linhas por job. Flask fica FORA deste seam: as rotas
/analytics/summary e /analytics/jobs seguem no BridgeApp e chamam JobAnalytics.

Dependencias externas injetadas no construtor:
  - jobs_root, queue_file: unicos I/O paths.
  - unique_phrase_ids/job_phrase_ids: helpers de contagem de cartao que o
    worker do BridgeApp tambem usa; injetados como callables (mesmo padrao do
    seam normalize_ru do candidato B) para manter fonte unica no BridgeApp.

Modulo com LOGGER proprio; NAO importa server (sem ciclo).
"""

from __future__ import annotations

import copy
import json
import logging
from datetime import date, datetime
from pathlib import Path
from typing import Any, Callable

LOGGER = logging.getLogger("anki_bridge.analytics")


def _now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def _read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return copy.deepcopy(default)
    try:
        text = path.read_text(encoding="utf-8").strip()
        if not text:
            LOGGER.warning("_read_json: arquivo vazio (corrompido?), usando default: %s", path)
            return copy.deepcopy(default)
        return json.loads(text)
    except (json.JSONDecodeError, OSError) as exc:
        LOGGER.warning("_read_json: falha ao ler %s (%s), usando default", path, exc)
        return copy.deepcopy(default)


class JobAnalytics:
    """Agrega analytics de jobs a partir de jobs_root/queue_file no disco."""

    def __init__(
        self,
        jobs_root: Path,
        queue_file: Path,
        *,
        unique_phrase_ids: Callable[[list[Any]], list[int]],
        job_phrase_ids: Callable[[list[dict[str, Any]]], list[int]],
    ) -> None:
        self.jobs_root = jobs_root
        self.queue_file = queue_file
        self._unique_phrase_ids = unique_phrase_ids
        self._job_phrase_ids = job_phrase_ids

    def _job_dir(self, job_id: str) -> Path:
        return self.jobs_root / job_id

    def _safe_read_json(self, path: Path, default: Any) -> Any:
        try:
            return _read_json(path, default)
        except Exception as exc:  # noqa: BLE001
            LOGGER.warning("Failed to read JSON %s: %s", path, exc)
            return copy.deepcopy(default)

    def _read_jsonl(self, path: Path) -> list[dict[str, Any]]:
        if not path.exists():
            return []
        records: list[dict[str, Any]] = []
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except Exception as exc:  # noqa: BLE001
            LOGGER.warning("Failed to read JSONL %s: %s", path, exc)
            return []
        for line in lines:
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(record, dict):
                records.append(record)
        return records

    def parse_date(self, raw: Any) -> date | None:
        if not raw:
            return None
        text = str(raw).strip()
        if not text:
            return None
        try:
            return date.fromisoformat(text[:10])
        except ValueError:
            return None

    def _date_in_range(self, value: date | None, from_date: date | None, to_date: date | None) -> bool:
        if value is None:
            return from_date is None and to_date is None
        if from_date and value < from_date:
            return False
        if to_date and value > to_date:
            return False
        return True

    def _record_date(self, record: dict[str, Any], fallback: date | None) -> date | None:
        return self.parse_date(record.get("date") or record.get("createdAt")) or fallback

    def _cost_value(self, record: dict[str, Any], field: str = "cost_usd") -> float:
        try:
            return float(record.get(field) or 0.0)
        except (TypeError, ValueError):
            return 0.0

    def _cost_bucket(self) -> dict[str, float]:
        return {
            "cardUsd": 0.0,
            "imageJudgeUsd": 0.0,
            "imageGuardUsd": 0.0,
            "imageGenerationUsd": 0.0,
            "otherUsd": 0.0,
            "totalUsd": 0.0,
        }

    def _image_bucket(self) -> dict[str, float]:
        return {
            "total": 0,
            "real": 0,
            "generated": 0,
            "skipped": 0,
            "failed": 0,
            "generatedAttempted": 0,
            "savingsUsd": 0.0,
        }

    def _classify_image_source(self, raw: Any) -> str:
        source = str(raw or "").strip().lower()
        if source in {"real", "google", "openverse"}:
            return "real"
        if source in {"gerada", "generated", "dalle", "dall-e", "gpt-image"}:
            return "generated"
        if source == "skipped":
            return "skipped"
        return "failed"

    def _iter_job_snapshots(self) -> list[dict[str, Any]]:
        queue = self._safe_read_json(self.queue_file, {"jobs": []})
        queue_items = {
            item.get("jobId"): item
            for item in queue.get("jobs", [])
            if isinstance(item, dict) and item.get("jobId")
        }
        job_ids = set(queue_items)
        if self.jobs_root.exists():
            for child in self.jobs_root.iterdir():
                if child.is_dir() and (child / "job.json").exists():
                    job_ids.add(child.name)

        snapshots: list[dict[str, Any]] = []
        for job_id in job_ids:
            job_dir = self._job_dir(job_id)
            job_data = self._safe_read_json(job_dir / "job.json", {})
            state = self._safe_read_json(job_dir / "state.json", {})
            queue_item = queue_items.get(job_id, {})
            created_at = job_data.get("createdAt") or queue_item.get("createdAt") or state.get("updatedAt")
            updated_at = state.get("updatedAt") or queue_item.get("updatedAt") or created_at
            lang = job_data.get("lang") or queue_item.get("lang") or "unknown"
            status = state.get("status") or queue_item.get("status") or job_data.get("status") or "unknown"
            records = self._read_jsonl(job_dir / "log" / "costs.jsonl")
            snapshots.append({
                "jobId": job_id,
                "job": job_data,
                "state": state,
                "queueItem": queue_item,
                "createdAt": created_at,
                "createdDate": self.parse_date(created_at),
                "updatedAt": updated_at,
                "lang": lang,
                "status": status,
                "stage": state.get("stage") or status,
                "records": records,
            })

        return sorted(snapshots, key=lambda item: item.get("createdAt") or "", reverse=True)

    def _job_matches_filters(
        self,
        snapshot: dict[str, Any],
        from_date: date | None,
        to_date: date | None,
        lang: str,
    ) -> bool:
        if lang != "all" and snapshot.get("lang") != lang:
            return False
        if self._date_in_range(snapshot.get("createdDate"), from_date, to_date):
            return True
        fallback = snapshot.get("createdDate")
        return any(self._date_in_range(self._record_date(record, fallback), from_date, to_date) for record in snapshot["records"])

    def summarize_records(
        self,
        records: list[dict[str, Any]],
        fallback_date: date | None,
        from_date: date | None,
        to_date: date | None,
    ) -> dict[str, Any]:
        costs = self._cost_bucket()
        images = self._image_bucket()
        generated_image_cost_records = 0.0
        generated_image_cost_pipeline = 0.0
        image_record_counts = self._image_bucket()
        pipeline_count = 0
        matched_records = 0

        for record in records:
            record_date = self._record_date(record, fallback_date)
            if not self._date_in_range(record_date, from_date, to_date):
                continue
            matched_records += 1
            record_type = record.get("type")
            cost = self._cost_value(record)

            if record_type == "tokens":
                keyword = str(record.get("keyword") or "")
                if keyword.startswith("[image_judge]"):
                    costs["imageJudgeUsd"] += cost
                elif keyword.startswith("[image_guard]"):
                    costs["imageGuardUsd"] += cost
                else:
                    costs["cardUsd"] += cost
            elif record_type == "image":
                source = self._classify_image_source(record.get("source"))
                if source == "generated":
                    generated_image_cost_records += cost
                image_record_counts["total"] += 1
                image_record_counts[source] += 1
            elif record_type == "image_pipeline":
                source = self._classify_image_source(record.get("final_source"))
                pipeline_count += 1
                images["total"] += 1
                images[source] += 1
                if record.get("generated_attempted"):
                    images["generatedAttempted"] += 1
                images["savingsUsd"] += self._cost_value(record, "cost_saved_vs_generated_usd")
                if source == "generated":
                    generated_image_cost_pipeline += self._cost_value(record, "actual_cost_usd")
            elif record_type == "session":
                continue
            elif cost:
                costs["otherUsd"] += cost

        if pipeline_count == 0 and image_record_counts["total"]:
            images.update(image_record_counts)

        costs["imageGenerationUsd"] = max(generated_image_cost_records, generated_image_cost_pipeline)
        costs["totalUsd"] = (
            costs["cardUsd"]
            + costs["imageJudgeUsd"]
            + costs["imageGuardUsd"]
            + costs["imageGenerationUsd"]
            + costs["otherUsd"]
        )

        total_images = images["total"] or 0
        percentages = {
            "realPct": round((images["real"] / total_images) * 100, 1) if total_images else 0.0,
            "generatedPct": round((images["generated"] / total_images) * 100, 1) if total_images else 0.0,
            "skippedPct": round((images["skipped"] / total_images) * 100, 1) if total_images else 0.0,
            "failedPct": round((images["failed"] / total_images) * 100, 1) if total_images else 0.0,
            "generatedAttemptPct": round((images["generatedAttempted"] / total_images) * 100, 1) if total_images else 0.0,
        }

        return {
            "costs": {key: round(value, 6) for key, value in costs.items()},
            "images": {
                **{key: int(value) for key, value in images.items() if key not in {"savingsUsd"}},
                "savingsUsd": round(images["savingsUsd"], 6),
                **percentages,
            },
            "matchedRecords": matched_records,
        }

    def summary(self, from_date: date | None, to_date: date | None, lang: str) -> dict[str, Any]:
        summary = {
            "generatedAt": _now_iso(),
            "filters": {
                "from": from_date.isoformat() if from_date else None,
                "to": to_date.isoformat() if to_date else None,
                "lang": lang,
            },
            "costs": self._cost_bucket(),
            "jobs": {
                "total": 0,
                "completed": 0,
                "failed": 0,
                "partial": 0,
                "running": 0,
                "queued": 0,
                "unknown": 0,
            },
            "cards": {
                "requested": 0,
                "successful": 0,
                "failed": 0,
            },
            "images": self._image_bucket(),
            "byLanguage": {
                "en": {"jobs": 0, "totalUsd": 0.0, "images": self._image_bucket()},
                "ru": {"jobs": 0, "totalUsd": 0.0, "images": self._image_bucket()},
            },
        }

        for snapshot in self._iter_job_snapshots():
            if not self._job_matches_filters(snapshot, from_date, to_date, lang):
                continue
            job_summary = self.summarize_records(snapshot["records"], snapshot["createdDate"], from_date, to_date)
            job_data = snapshot["job"]
            state = snapshot["state"]
            status = snapshot["status"] if snapshot["status"] in summary["jobs"] else "unknown"
            job_lang = snapshot.get("lang")
            requested_cards = len(self._job_phrase_ids(job_data.get("entries") or []))
            successful_cards = len(self._unique_phrase_ids(state.get("successfulPhraseIds") or []))
            explicit_failed_cards = len(self._unique_phrase_ids(state.get("failedPhraseIds") or []))
            failed_cards = explicit_failed_cards
            if status in {"failed", "partial"}:
                failed_cards = max(explicit_failed_cards, requested_cards - successful_cards)

            summary["jobs"]["total"] += 1
            summary["jobs"][status] += 1
            summary["cards"]["requested"] += requested_cards
            summary["cards"]["successful"] += successful_cards
            summary["cards"]["failed"] += failed_cards

            for key in summary["costs"]:
                summary["costs"][key] += job_summary["costs"][key]
            for key in ["total", "real", "generated", "skipped", "failed", "generatedAttempted"]:
                summary["images"][key] += job_summary["images"][key]
            summary["images"]["savingsUsd"] += job_summary["images"]["savingsUsd"]

            if job_lang in summary["byLanguage"]:
                lang_bucket = summary["byLanguage"][job_lang]
                lang_bucket["jobs"] += 1
                lang_bucket["totalUsd"] += job_summary["costs"]["totalUsd"]
                for key in ["total", "real", "generated", "skipped", "failed", "generatedAttempted"]:
                    lang_bucket["images"][key] += job_summary["images"][key]
                lang_bucket["images"]["savingsUsd"] += job_summary["images"]["savingsUsd"]

        total_images = summary["images"]["total"] or 0
        summary["images"].update({
            "savingsUsd": round(summary["images"]["savingsUsd"], 6),
            "realPct": round((summary["images"]["real"] / total_images) * 100, 1) if total_images else 0.0,
            "generatedPct": round((summary["images"]["generated"] / total_images) * 100, 1) if total_images else 0.0,
            "skippedPct": round((summary["images"]["skipped"] / total_images) * 100, 1) if total_images else 0.0,
            "failedPct": round((summary["images"]["failed"] / total_images) * 100, 1) if total_images else 0.0,
            "generatedAttemptPct": round((summary["images"]["generatedAttempted"] / total_images) * 100, 1) if total_images else 0.0,
        })
        summary["costs"] = {key: round(value, 6) for key, value in summary["costs"].items()}
        for lang_bucket in summary["byLanguage"].values():
            total = lang_bucket["images"]["total"] or 0
            lang_bucket["totalUsd"] = round(lang_bucket["totalUsd"], 6)
            lang_bucket["images"].update({
                "savingsUsd": round(lang_bucket["images"]["savingsUsd"], 6),
                "realPct": round((lang_bucket["images"]["real"] / total) * 100, 1) if total else 0.0,
                "generatedPct": round((lang_bucket["images"]["generated"] / total) * 100, 1) if total else 0.0,
                "skippedPct": round((lang_bucket["images"]["skipped"] / total) * 100, 1) if total else 0.0,
                "failedPct": round((lang_bucket["images"]["failed"] / total) * 100, 1) if total else 0.0,
                "generatedAttemptPct": round((lang_bucket["images"]["generatedAttempted"] / total) * 100, 1) if total else 0.0,
            })
        return summary

    def jobs(self, from_date: date | None, to_date: date | None, lang: str) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for snapshot in self._iter_job_snapshots():
            if not self._job_matches_filters(snapshot, from_date, to_date, lang):
                continue
            job_summary = self.summarize_records(snapshot["records"], snapshot["createdDate"], from_date, to_date)
            job_data = snapshot["job"]
            state = snapshot["state"]
            requested_cards = len(self._job_phrase_ids(job_data.get("entries") or []))
            successful_cards = len(self._unique_phrase_ids(state.get("successfulPhraseIds") or []))
            explicit_failed_cards = len(self._unique_phrase_ids(state.get("failedPhraseIds") or []))
            failed_cards = explicit_failed_cards
            if snapshot["status"] in {"failed", "partial"}:
                failed_cards = max(explicit_failed_cards, requested_cards - successful_cards)
            rows.append({
                "jobId": snapshot["jobId"],
                "createdAt": snapshot["createdAt"],
                "updatedAt": snapshot["updatedAt"],
                "lang": snapshot["lang"],
                "deckName": job_data.get("deckName", ""),
                "imageSource": job_data.get("imageSource", ""),
                "status": snapshot["status"],
                "stage": snapshot["stage"],
                "requestedCards": requested_cards,
                "successfulCards": successful_cards,
                "failedCards": failed_cards,
                "lastError": state.get("lastError"),
                "costs": job_summary["costs"],
                "images": job_summary["images"],
                "matchedRecords": job_summary["matchedRecords"],
            })
        return rows

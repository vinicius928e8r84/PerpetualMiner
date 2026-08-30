from __future__ import annotations

import copy
import ctypes
import hashlib
import importlib
import json
import logging
import os
import random
import re
import sqlite3
import subprocess
import sys
import threading
import time
import uuid
from datetime import date, datetime
from pathlib import Path
from typing import Any, Callable
from urllib.request import pathname2url

import requests
from flask import Flask, jsonify, request

from anki_session import AnkiRepairBlockedError, AnkiSession
import card_normalization as cardnorm
from analytics import JobAnalytics


ROOT = Path(__file__).resolve().parent.parent
SERVER_PATH = Path(__file__).resolve()
CONFIG_PATH = ROOT / "bridge" / "config.json"
LOG_PATH = ROOT / "bridge" / "runtime" / "bridge.log"
for proxy_key in ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"]:
    os.environ.pop(proxy_key, None)
os.environ["NO_PROXY"] = "127.0.0.1,localhost"
os.environ["no_proxy"] = "127.0.0.1,localhost"

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(threadName)s] %(message)s",
    handlers=[logging.FileHandler(LOG_PATH, encoding="utf-8")],
)
LOGGER = logging.getLogger("anki_bridge")

# EN_STOP_WORDS / EN_LEMMA_EXCEPTIONS e a normalizacao de cartao EN/RU migraram
# para card_normalization.py (candidato B). BridgeApp chama via cardnorm.*.


def _log_unhandled_exception(exc_type, exc_value, exc_traceback) -> None:
    if issubclass(exc_type, KeyboardInterrupt):
        sys.__excepthook__(exc_type, exc_value, exc_traceback)
        return
    LOGGER.critical("Unhandled exception", exc_info=(exc_type, exc_value, exc_traceback))


sys.excepthook = _log_unhandled_exception


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


def _write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _file_fingerprint(path: Path) -> dict[str, Any]:
    result: dict[str, Any] = {"path": str(path), "exists": path.exists()}
    if not path.exists():
        return result
    try:
        stat = path.stat()
        data = path.read_bytes()
    except OSError as exc:
        result["error"] = str(exc)
        return result
    result["mtime"] = datetime.fromtimestamp(stat.st_mtime).astimezone().isoformat(timespec="seconds")
    result["sha256_12"] = hashlib.sha256(data).hexdigest()[:12]
    return result


class BridgeApp:
    def __init__(self, config: dict[str, Any] | None = None) -> None:
        self.config = config if config is not None else _read_json(CONFIG_PATH, {})
        # Resolve relative to the repo root (like jobs_root/queue_file below) so the
        # monorepo is portable; absolute paths in config still work unchanged.
        self.automatic_anki_path = ROOT / self.config["automatic_anki_path"]
        self.jobs_root = ROOT / self.config.get("jobs_root", "bridge/runtime/jobs")
        self.queue_file = ROOT / self.config.get("queue_file", "bridge/runtime/queue.json")
        self.anki_connect_url = self.config.get("anki_connect_url", "http://127.0.0.1:8765")
        self.anki_executable = self.config.get("anki_executable", "")
        self.anki_base_path = self.config.get("anki_base_path", "")
        self.anki_profile = self.config.get("anki_profile", "")
        self.anki = AnkiSession(self.config)
        self.lock = threading.Lock()
        self.anki_stats_lock = threading.Lock()
        self.anki_stats_ttl_sec = int(self.config.get("anki_stats_ttl_sec", 60))
        self.anki_stats_cache: dict[str, Any] | None = None
        self.stop_event = threading.Event()
        self.modules: dict[str, Any] = {}
        self.module_fingerprint: dict[str, Any] = {}
        self.started_at = _now_iso()
        self.server_fingerprint = _file_fingerprint(SERVER_PATH)
        self.app = Flask(__name__)
        self._register_routes()
        self.worker = threading.Thread(target=self._worker_loop, daemon=True)
        self.analytics = JobAnalytics(
            self.jobs_root,
            self.queue_file,
            unique_phrase_ids=self._unique_phrase_ids,
            job_phrase_ids=self._job_phrase_ids,
        )

    def _ensure_runtime(self) -> None:
        self.jobs_root.mkdir(parents=True, exist_ok=True)
        if not self.queue_file.exists():
            _write_json(self.queue_file, {"jobs": []})

    def _recover_interrupted_jobs(self) -> None:
        queue = self._queue_data()
        recovered = 0
        for item in queue.get("jobs", []):
            if item.get("status") != "running":
                continue
            job_id = item.get("jobId")
            if not job_id:
                continue
            item["status"] = "queued"
            item["updatedAt"] = _now_iso()
            state = self._safe_read_json(self._state_file(job_id), {})
            if state:
                state["status"] = "queued"
                state["stage"] = "queued"
                state["lastError"] = "Bridge reiniciado durante o processamento; job refileirado para retomar."
                state["updatedAt"] = item["updatedAt"]
                self._write_state(job_id, state)
            recovered += 1
        if recovered:
            self._save_queue_data(queue)
            LOGGER.warning("Recovered %s interrupted running job(s) back to queued", recovered)

    def _load_modules(self) -> None:
        path_str = str(self.automatic_anki_path)
        if path_str not in sys.path:
            sys.path.insert(0, path_str)
        for name in [
            "config_loader",
            "parser",
            "generate_cards",
            "extract_prompts",
            "generate_audio",
            "generate_images",
            "google_images",
            "send_to_anki",
            "cost_tracker",
            "image_guard",
            "image_judge",
            "image_utils",
            "tts_accents",
            "start",
        ]:
            self.modules[name] = importlib.import_module(name)
        self.module_fingerprint = self._build_module_fingerprint()
        LOGGER.info(
            "Automatic Anki modules loaded. path=%s normalization_loaded=%s fingerprint=%s",
            self.automatic_anki_path,
            self.module_fingerprint.get("normalizationLoaded"),
            json.dumps(self.module_fingerprint.get("modules", {}), ensure_ascii=False, sort_keys=True),
        )

    def _module_file_fingerprint(self, filename: str) -> dict[str, Any]:
        return _file_fingerprint(self.automatic_anki_path / filename)

    def _build_module_fingerprint(self) -> dict[str, Any]:
        modules = {
            filename: self._module_file_fingerprint(filename)
            for filename in ["image_judge.py", "google_images.py", "image_utils.py"]
        }
        normalization_loaded = all(info.get("exists") and info.get("sha256_12") for info in modules.values())
        try:
            image_judge = self.modules.get("image_judge")
            google_images = self.modules.get("google_images")
            image_utils = self.modules.get("image_utils")
            normalization_loaded = bool(
                normalization_loaded
                and getattr(image_utils, "normalize_image_bytes", None)
                and getattr(google_images, "download_candidate", None)
                and getattr(image_judge, "_is_invalid_image_format_error", None)
            )
        except Exception:
            normalization_loaded = False
        return {
            "automaticAnkiPath": str(self.automatic_anki_path),
            "normalizationLoaded": normalization_loaded,
            "modules": modules,
        }

    def _anki_repair_blocked_handler_loaded(self) -> bool:
        return bool(
            isinstance(AnkiRepairBlockedError, type)
            and callable(getattr(self.anki, "_anki_repair_blocked_payload", None))
            and callable(getattr(self.anki, "_raise_if_anki_repair_blocked", None))
        )

    def _runtime_payload(self) -> dict[str, Any]:
        return {
            "pid": os.getpid(),
            "startedAt": self.started_at,
            "serverFile": self.server_fingerprint,
            "ankiRepairBlockedHandlerLoaded": self._anki_repair_blocked_handler_loaded(),
            "root": str(ROOT),
            "jobsRoot": str(self.jobs_root),
            "queueFile": str(self.queue_file),
        }

    def start(self) -> None:
        self._ensure_runtime()
        self.anki.ensure_connect_enabled()
        self._recover_interrupted_jobs()
        self._load_modules()
        LOGGER.info(
            "Bridge starting. automatic_anki_path=%s anki_executable=%s anki_connect_url=%s",
            self.automatic_anki_path,
            self.anki_executable,
            self.anki_connect_url,
        )
        self.worker.start()

    def _queue_data(self) -> dict[str, Any]:
        return _read_json(self.queue_file, {"jobs": []})

    def _save_queue_data(self, data: dict[str, Any]) -> None:
        _write_json(self.queue_file, data)

    def _job_dir(self, job_id: str) -> Path:
        return self.jobs_root / job_id

    def _job_file(self, job_id: str) -> Path:
        return self._job_dir(job_id) / "job.json"

    def _state_file(self, job_id: str) -> Path:
        return self._job_dir(job_id) / "state.json"

    def _read_job(self, job_id: str) -> dict[str, Any]:
        return _read_json(self._job_file(job_id), {})

    def _read_state(self, job_id: str) -> dict[str, Any]:
        return _read_json(self._state_file(job_id), {})

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

    def _analytics_filters(self) -> tuple[date | None, date | None, str]:
        from_date = self.analytics.parse_date(request.args.get("from"))
        to_date = self.analytics.parse_date(request.args.get("to"))
        if from_date and to_date and to_date < from_date:
            from_date, to_date = to_date, from_date
        lang = (request.args.get("lang") or "all").lower()
        if lang not in {"all", "en", "ru"}:
            lang = "all"
        return from_date, to_date, lang

    def _tail_lines(self, path: Path, max_lines: int = 200) -> list[str]:
        if not path.exists():
            return []
        try:
            return path.read_text(encoding="utf-8", errors="replace").splitlines()[-max_lines:]
        except Exception as exc:  # noqa: BLE001
            return [f"failed_to_read_log: {exc}"]

    def _sanitize_config(self, value: Any) -> Any:
        if isinstance(value, dict):
            sanitized: dict[str, Any] = {}
            for key, item in value.items():
                key_text = str(key).lower()
                if any(part in key_text for part in ["api_key", "apikey", "token", "secret", "password", "authorization"]):
                    sanitized[key] = "***redacted***"
                else:
                    sanitized[key] = self._sanitize_config(item)
            return sanitized
        if isinstance(value, list):
                return [self._sanitize_config(item) for item in value]
        return value

    def _ru_normalizer(self) -> Callable[[str], str] | None:
        """Callable de normalizacao de frase russa injetado no modulo puro.

        Espelha o antigo acesso a self.modules["parser"].normalize_ru_phrase; se
        o parser (ou o atributo) nao existir, retorna None e o modulo puro cai no
        fallback regex identico ao original.
        """
        parser = self.modules.get("parser")
        return getattr(parser, "normalize_ru_phrase", None) if parser is not None else None

    def _deck_stats_config(self, deck_name: str, lang: str) -> dict[str, Any]:
        config_path = self.automatic_anki_path / "config.yaml"
        yaml_mod = getattr(self.modules["config_loader"], "yaml", None)
        if not yaml_mod:
            raise RuntimeError("yaml_loader_unavailable")
        with config_path.open("r", encoding="utf-8") as file:
            base = yaml_mod.safe_load(file) or {}
        lang_cfg = base.get("languages", {}).get(lang, {})
        anki_cfg = base.setdefault("anki", {})
        anki_cfg["deck_name"] = deck_name
        if lang_cfg.get("note_type"):
            anki_cfg["note_type"] = lang_cfg["note_type"]
        if lang_cfg.get("fields"):
            anki_cfg["fields"] = lang_cfg["fields"]
        return base

    def _deck_term_stats(self, deck_name: str, lang: str) -> dict[str, Any]:
        config = self._deck_stats_config(deck_name, lang)
        normalize_ru = self._ru_normalizer()
        front_field = config.get("anki", {}).get("fields", {}).get("front", "Frente")
        note_ids = self.anki.invoke("findNotes", {"query": f'deck:"{deck_name}"'}) or []
        card_ids = self.anki.invoke("findCards", {"query": f'deck:"{deck_name}"'}) or []

        fronts: set[str] = set()
        note_fields: dict[int, dict[str, str]] = {}
        if note_ids:
            for start in range(0, len(note_ids), 100):
                batch = note_ids[start:start + 100]
                for note in self.anki.invoke("notesInfo", {"notes": batch}) or []:
                    fields = note.get("fields") or {}
                    note_id = int(note.get("noteId") or note.get("id") or 0)
                    if note_id:
                        note_fields[note_id] = {
                            key: str((value or {}).get("value") or "")
                            for key, value in fields.items()
                            if isinstance(value, dict)
                        }
                    front = ((fields.get(front_field) or {}).get("value") or "").strip()
                    identity = cardnorm.normalize_term_identity(front, lang, normalize_ru)
                    if identity:
                        fronts.add(identity)

        buckets = {"new": 0, "learning": 0, "young": 0, "mature": 0}
        catalog_cards: list[dict[str, Any]] = []
        if card_ids:
            for start in range(0, len(card_ids), 200):
                batch = card_ids[start:start + 200]
                for card in self.anki.invoke("cardsInfo", {"cards": batch}) or []:
                    bucket = cardnorm.card_bucket(card)
                    buckets[bucket] += 1
                    note_id = int(card.get("note") or 0)
                    fields = note_fields.get(note_id, {})
                    catalog_cards.append({
                        "noteId": note_id,
                        "front": fields.get(front_field, ""),
                        "back": fields.get(config.get("anki", {}).get("fields", {}).get("back", "Verso"), ""),
                        "created": note_id,
                        "bucket": bucket,
                    })

        vocabulary = cardnorm.catalog_stats_from_cards(catalog_cards, lang, normalize_ru)
        reviewed = buckets["learning"] + buckets["young"] + buckets["mature"]
        return {
            "deckName": deck_name,
            "lang": lang,
            "frontField": front_field,
            "notes": len(note_ids),
            "cards": len(card_ids),
            "uniqueTerms": vocabulary["targetTerms"],
            "uniqueFronts": len(fronts),
            "uniqueTermTokens": vocabulary["phraseVocabulary"],
            "vocabulary": vocabulary,
            "termMetric": "anki_target_terms",
            "new": buckets["new"],
            "learning": buckets["learning"],
            "young": buckets["young"],
            "mature": buckets["mature"],
            "reviewed": reviewed,
            "maturePct": round((buckets["mature"] / reviewed) * 100, 1) if reviewed else 0.0,
        }

    def _deck_vocabulary(self, deck_name: str, lang: str) -> dict[str, Any]:
        config = self._deck_stats_config(deck_name, lang)
        normalize_ru = self._ru_normalizer()
        front_field = config.get("anki", {}).get("fields", {}).get("front", "Frente")
        back_field = config.get("anki", {}).get("fields", {}).get("back", "Verso")
        note_ids = self.anki.invoke("findNotes", {"query": f'deck:"{deck_name}"'}) or []
        card_ids = self.anki.invoke("findCards", {"query": f'deck:"{deck_name}"'}) or []

        note_fields: dict[int, dict[str, str]] = {}
        if note_ids:
            for start in range(0, len(note_ids), 100):
                batch = note_ids[start:start + 100]
                for note in self.anki.invoke("notesInfo", {"notes": batch}) or []:
                    fields = note.get("fields") or {}
                    note_id = int(note.get("noteId") or note.get("id") or 0)
                    if note_id:
                        note_fields[note_id] = {
                            key: str((value or {}).get("value") or "")
                            for key, value in fields.items()
                            if isinstance(value, dict)
                        }

        catalog_cards: list[dict[str, Any]] = []
        if card_ids:
            for start in range(0, len(card_ids), 200):
                batch = card_ids[start:start + 200]
                for card in self.anki.invoke("cardsInfo", {"cards": batch}) or []:
                    note_id = int(card.get("note") or 0)
                    fields = note_fields.get(note_id, {})
                    catalog_cards.append({
                        "noteId": note_id,
                        "front": fields.get(front_field, ""),
                        "back": fields.get(back_field, ""),
                        "created": note_id,
                        "bucket": cardnorm.card_bucket(card),
                    })

        return {
            "generatedAt": _now_iso(),
            "deckName": deck_name,
            "lang": lang,
            "source": "ankiconnect",
            "totalCards": len(catalog_cards),
            "words": cardnorm.front_vocabulary_rows_from_cards(catalog_cards, lang, normalize_ru),
        }

    def _anki_collection_db_path(self) -> Path:
        if not self.anki_base_path:
            raise RuntimeError("anki_base_path_not_configured")
        base_path = Path(self.anki_base_path)
        candidates: list[Path] = []
        if self.anki_profile:
            candidates.append(base_path / self.anki_profile / "collection.anki2")
        if base_path.exists():
            candidates.extend(path for path in base_path.glob("*/collection.anki2") if path not in candidates)
        for path in candidates:
            if path.exists():
                return path
        if candidates:
            raise RuntimeError(f"collection_anki2_not_found: {candidates[0]}")
        raise RuntimeError("collection_anki2_not_found")

    def _open_local_anki_collection(self) -> sqlite3.Connection:
        collection_path = self._anki_collection_db_path()
        uri = f"file:{pathname2url(str(collection_path))}?mode=ro&immutable=1"
        con = sqlite3.connect(uri, uri=True)
        con.row_factory = sqlite3.Row
        con.create_collation(
            "unicase",
            lambda left, right: ((left or "").casefold() > (right or "").casefold())
            - ((left or "").casefold() < (right or "").casefold()),
        )
        return con

    def _local_front_field_ord_by_model(self, con: sqlite3.Connection, front_field: str) -> dict[int, int]:
        rows = con.execute("select ntid, ord, name from fields").fetchall()
        front_name = front_field.casefold()
        result: dict[int, int] = {}
        for row in rows:
            if str(row["name"] or "").casefold() == front_name:
                result[int(row["ntid"])] = int(row["ord"])
        return result

    def _local_deck_ids(self, con: sqlite3.Connection, deck_name: str) -> list[int]:
        rows = con.execute("select id, name from decks").fetchall()
        prefix = f"{deck_name}::"
        return [
            int(row["id"])
            for row in rows
            if str(row["name"] or "") == deck_name or str(row["name"] or "").startswith(prefix)
        ]

    def _local_deck_term_stats(self, con: sqlite3.Connection, deck_name: str, lang: str) -> dict[str, Any]:
        config = self._deck_stats_config(deck_name, lang)
        normalize_ru = self._ru_normalizer()
        front_field = config.get("anki", {}).get("fields", {}).get("front", "Frente")
        deck_ids = self._local_deck_ids(con, deck_name)
        if not deck_ids:
            return cardnorm.empty_deck_stats(deck_name, lang, front_field)

        placeholders = ",".join("?" for _ in deck_ids)
        buckets = {"new": 0, "learning": 0, "young": 0, "mature": 0}
        back_field = config.get("anki", {}).get("fields", {}).get("back", "Verso")
        card_rows = con.execute(
            f"""
            select c.nid, c.type, c.ivl, c.mod, n.mid, n.flds
            from cards c
            join notes n on n.id = c.nid
            where c.did in ({placeholders})
            """,
            deck_ids,
        ).fetchall()
        for card in card_rows:
            bucket = cardnorm.card_bucket_from_values(int(card["type"] or 0), int(card["ivl"] or 0))
            buckets[bucket] += 1

        fronts: set[str] = set()
        front_ord_by_model = self._local_front_field_ord_by_model(con, front_field)
        back_ord_by_model = self._local_front_field_ord_by_model(con, back_field)
        catalog_cards: list[dict[str, Any]] = []
        note_ids: set[int] = set()
        for card in card_rows:
            fields = str(card["flds"] or "").split("\x1f")
            note_id = int(card["nid"] or 0)
            note_ids.add(note_id)
            front_ord = front_ord_by_model.get(int(card["mid"] or 0), 0)
            back_ord = back_ord_by_model.get(int(card["mid"] or 0), 1)
            front = fields[front_ord] if front_ord < len(fields) else (fields[0] if fields else "")
            back = fields[back_ord] if back_ord < len(fields) else ""
            identity = cardnorm.normalize_term_identity(front, lang, normalize_ru)
            if identity:
                fronts.add(identity)
            catalog_cards.append({
                "noteId": note_id,
                "front": front,
                "back": back,
                "created": note_id,
                "bucket": cardnorm.card_bucket_from_values(int(card["type"] or 0), int(card["ivl"] or 0)),
            })

        vocabulary = cardnorm.catalog_stats_from_cards(catalog_cards, lang, normalize_ru)
        reviewed = buckets["learning"] + buckets["young"] + buckets["mature"]
        return {
            "deckName": deck_name,
            "lang": lang,
            "frontField": front_field,
            "notes": len(note_ids),
            "cards": len(card_rows),
            "uniqueTerms": vocabulary["targetTerms"],
            "uniqueFronts": len(fronts),
            "uniqueTermTokens": vocabulary["phraseVocabulary"],
            "vocabulary": vocabulary,
            "termMetric": "anki_target_terms",
            "new": buckets["new"],
            "learning": buckets["learning"],
            "young": buckets["young"],
            "mature": buckets["mature"],
            "reviewed": reviewed,
            "maturePct": round((buckets["mature"] / reviewed) * 100, 1) if reviewed else 0.0,
            "source": "collection.anki2",
        }

    def _local_deck_catalog_cards(self, con: sqlite3.Connection, deck_name: str, lang: str) -> list[dict[str, Any]]:
        config = self._deck_stats_config(deck_name, lang)
        front_field = config.get("anki", {}).get("fields", {}).get("front", "Frente")
        back_field = config.get("anki", {}).get("fields", {}).get("back", "Verso")
        deck_ids = self._local_deck_ids(con, deck_name)
        if not deck_ids:
            return []

        placeholders = ",".join("?" for _ in deck_ids)
        front_ord_by_model = self._local_front_field_ord_by_model(con, front_field)
        back_ord_by_model = self._local_front_field_ord_by_model(con, back_field)
        card_rows = con.execute(
            f"""
            select c.nid, c.type, c.ivl, n.mid, n.flds
            from cards c
            join notes n on n.id = c.nid
            where c.did in ({placeholders})
            """,
            deck_ids,
        ).fetchall()
        cards: list[dict[str, Any]] = []
        for card in card_rows:
            fields = str(card["flds"] or "").split("\x1f")
            front_ord = front_ord_by_model.get(int(card["mid"] or 0), 0)
            back_ord = back_ord_by_model.get(int(card["mid"] or 0), 1)
            cards.append({
                "noteId": int(card["nid"] or 0),
                "front": fields[front_ord] if front_ord < len(fields) else (fields[0] if fields else ""),
                "back": fields[back_ord] if back_ord < len(fields) else "",
                "created": int(card["nid"] or 0),
                "bucket": cardnorm.card_bucket_from_values(int(card["type"] or 0), int(card["ivl"] or 0)),
            })
        return cards

    def _local_vocabulary(self, deck_name: str, lang: str) -> dict[str, Any]:
        collection_path = self._anki_collection_db_path()
        normalize_ru = self._ru_normalizer()
        con = self._open_local_anki_collection()
        try:
            cards = self._local_deck_catalog_cards(con, deck_name, lang)
        finally:
            con.close()
        return {
            "generatedAt": _now_iso(),
            "deckName": deck_name,
            "lang": lang,
            "source": "collection.anki2",
            "collectionPath": str(collection_path),
            "totalCards": len(cards),
            "words": cardnorm.front_vocabulary_rows_from_cards(cards, lang, normalize_ru),
        }

    def _local_anki_deck_stats(self, decks: list[dict[str, str]], reason: str) -> dict[str, Any]:
        collection_path = self._anki_collection_db_path()
        con = self._open_local_anki_collection()
        try:
            rows: list[dict[str, Any]] = []
            seen: set[tuple[str, str]] = set()
            for item in decks:
                deck_name = str(item.get("deckName") or "").strip()
                lang = str(item.get("lang") or "en").strip().lower()
                if not deck_name or lang not in {"en", "ru"}:
                    continue
                key = (deck_name.casefold(), lang)
                if key in seen:
                    continue
                seen.add(key)
                rows.append(self._local_deck_term_stats(con, deck_name, lang))
        finally:
            con.close()

        return {
            "generatedAt": _now_iso(),
            "decks": rows,
            "totals": cardnorm.deck_stats_totals(rows),
            "source": "collection.anki2",
            "sourceDetail": f"AnkiConnect indisponivel; lendo {collection_path.name}. Motivo: {reason}",
            "collectionPath": str(collection_path),
        }

    def _anki_deck_stats(self, decks: list[dict[str, str]]) -> dict[str, Any]:
        available_decks = set(self.anki.invoke("deckNames") or [])
        rows: list[dict[str, Any]] = []
        seen: set[tuple[str, str]] = set()
        for item in decks:
            deck_name = str(item.get("deckName") or "").strip()
            lang = str(item.get("lang") or "en").strip().lower()
            if not deck_name or lang not in {"en", "ru"}:
                continue
            key = (deck_name.casefold(), lang)
            if key in seen:
                continue
            seen.add(key)
            if deck_name not in available_decks:
                rows.append(cardnorm.empty_deck_stats(deck_name, lang))
                continue
            rows.append(self._deck_term_stats(deck_name, lang))

        return {
            "generatedAt": _now_iso(),
            "decks": rows,
            "totals": cardnorm.deck_stats_totals(rows),
            "source": "ankiconnect",
            "sourceDetail": "AnkiConnect",
        }

    def _anki_stats_cache_key(self, decks: list[dict[str, str]]) -> str:
        normalized = []
        for item in decks:
            deck_name = str(item.get("deckName") or "").strip()
            lang = str(item.get("lang") or "en").strip().lower()
            if deck_name and lang in {"en", "ru"}:
                normalized.append({"deckName": deck_name, "lang": lang})
        return json.dumps(normalized, ensure_ascii=False, sort_keys=True)

    def _cached_anki_deck_stats(
        self,
        decks: list[dict[str, str]],
        refresh: bool = False,
        launch: bool = False,
    ) -> dict[str, Any]:
        cache_key = self._anki_stats_cache_key(decks)
        now = time.time()
        cached = self.anki_stats_cache
        if (
            cached
            and not refresh
            and cached.get("key") == cache_key
            and now - float(cached.get("createdAtMonotonic", 0)) < self.anki_stats_ttl_sec
        ):
            return copy.deepcopy(cached["data"])

        if not self.anki_stats_lock.acquire(blocking=False):
            if not self.anki_stats_lock.acquire(timeout=10):
                cached = self.anki_stats_cache
                if cached and cached.get("key") == cache_key:
                    data = copy.deepcopy(cached["data"])
                    data["stale"] = True
                    data["message"] = "ankistats_refresh_in_progress"
                    return data
                raise RuntimeError("ankistats_refresh_in_progress")

        try:
            cached = self.anki_stats_cache
            if (
                cached
                and not refresh
                and cached.get("key") == cache_key
                and time.time() - float(cached.get("createdAtMonotonic", 0)) < self.anki_stats_ttl_sec
            ):
                return copy.deepcopy(cached["data"])

            ready, detail = self.anki.collection_ready_status()
            if not ready:
                try:
                    data = self._local_anki_deck_stats(decks, detail)
                    self.anki_stats_cache = {
                        "key": cache_key,
                        "createdAtMonotonic": time.time(),
                        "data": copy.deepcopy(data),
                    }
                    return data
                except Exception as local_exc:  # noqa: BLE001
                    LOGGER.warning("Local Anki collection stats fallback failed: %s", local_exc)
                    if launch:
                        try:
                            self.anki.ensure_ready()
                        except RuntimeError as launch_exc:
                            LOGGER.warning("AnkiConnect launch failed after local stats fallback failed: %s", launch_exc)
                    if cached and cached.get("key") == cache_key:
                        data = copy.deepcopy(cached["data"])
                        data["stale"] = True
                        data["message"] = detail
                        return data
                    raise RuntimeError(f"{detail}; fallback_local_failed: {local_exc}") from local_exc

            ready, detail = self.anki.collection_ready_status()
            if not ready:
                try:
                    data = self._local_anki_deck_stats(decks, detail)
                    self.anki_stats_cache = {
                        "key": cache_key,
                        "createdAtMonotonic": time.time(),
                        "data": copy.deepcopy(data),
                    }
                    return data
                except Exception as local_exc:  # noqa: BLE001
                    LOGGER.warning("Local Anki collection stats fallback failed: %s", local_exc)
                    if cached and cached.get("key") == cache_key:
                        data = copy.deepcopy(cached["data"])
                        data["stale"] = True
                        data["message"] = detail
                        return data
                    raise RuntimeError(f"{detail}; fallback_local_failed: {local_exc}") from local_exc

            data = self._anki_deck_stats(decks)
            self.anki_stats_cache = {
                "key": cache_key,
                "createdAtMonotonic": time.time(),
                "data": copy.deepcopy(data),
            }
            return data
        finally:
            self.anki_stats_lock.release()

    def _artifact_manifest(self, job_id: str) -> list[dict[str, Any]]:
        job_dir = self._job_dir(job_id)
        if not job_dir.exists():
            return []
        artifacts: list[dict[str, Any]] = []
        for path in sorted(job_dir.rglob("*")):
            if not path.is_file():
                continue
            try:
                stat = path.stat()
                artifacts.append({
                    "path": str(path.relative_to(job_dir)).replace("\\", "/"),
                    "bytes": stat.st_size,
                    "modifiedAt": datetime.fromtimestamp(stat.st_mtime).astimezone().isoformat(timespec="seconds"),
                })
            except OSError:
                continue
        return artifacts[:500]

    def _debug_bundle(self, job_id: str) -> dict[str, Any]:
        job_data = self._safe_read_json(self._job_file(job_id), {})
        state = self._safe_read_json(self._state_file(job_id), {})
        queue_item = next((item for item in self._safe_read_json(self.queue_file, {"jobs": []}).get("jobs", []) if item.get("jobId") == job_id), None)
        costs = self._read_jsonl(self._job_dir(job_id) / "log" / "costs.jsonl")
        try:
            anki_connect = self.anki.connect_status()
            anki_collection = self.anki.collection_ready_status()
        except Exception as exc:  # noqa: BLE001
            anki_connect = (False, f"{type(exc).__name__}: {exc}")
            anki_collection = (False, f"{type(exc).__name__}: {exc}")
        return {
            "generatedAt": _now_iso(),
            "jobId": job_id,
            "job": job_data,
            "state": state,
            "queueItem": queue_item,
            "costs": costs,
            "costSummary": self.analytics.summarize_records(costs, self.analytics.parse_date(job_data.get("createdAt")), None, None),
            "artifacts": self._artifact_manifest(job_id),
            "bridgeLogTail": self._tail_lines(LOG_PATH),
            "runtime": {
                **self._runtime_payload(),
                "automaticAnkiPath": str(self.automatic_anki_path),
                "moduleFingerprint": self.module_fingerprint,
            },
            "anki": {
                "connectUrl": self.anki_connect_url,
                "executable": self.anki_executable,
                "basePath": self.anki_base_path,
                "profile": self.anki_profile,
                "connectAvailable": anki_connect[0],
                "connectDetail": anki_connect[1],
                "collectionReady": anki_collection[0],
                "collectionDetail": anki_collection[1],
            },
            "config": self._sanitize_config(self.config),
        }

    def _write_state(self, job_id: str, state: dict[str, Any]) -> None:
        _write_json(self._state_file(job_id), state)

    def _update_state(self, job_id: str, **fields: Any) -> dict[str, Any]:
        with self.lock:
            state = self._read_state(job_id)
            state.update(fields)
            state["updatedAt"] = _now_iso()
            self._write_state(job_id, state)
            data = self._queue_data()
            for item in data["jobs"]:
                if item["jobId"] == job_id:
                    item["status"] = state.get("status", item.get("status", "queued"))
                    item["updatedAt"] = state["updatedAt"]
                    break
            self._save_queue_data(data)
            return state

    def _register_routes(self) -> None:
        @self.app.get("/health")
        def health():
            queue = self._queue_data()
            return jsonify({
                "ok": True,
                "bridge": "running",
                "jobs": len(queue["jobs"]),
                "activeJobId": next((j["jobId"] for j in queue["jobs"] if j.get("status") == "running"), None),
                "automaticAnkiPath": str(self.automatic_anki_path),
                "runtime": self._runtime_payload(),
                "moduleFingerprint": self.module_fingerprint,
            })

        @self.app.get("/jobs")
        def jobs():
            data = self._queue_data()
            result = []
            for item in data["jobs"]:
                result.append({
                    **item,
                    "state": self._read_state(item["jobId"]),
                })
            return jsonify({"jobs": result})

        @self.app.get("/analytics/summary")
        def analytics_summary():
            from_date, to_date, lang = self._analytics_filters()
            return jsonify(self.analytics.summary(from_date, to_date, lang))

        @self.app.get("/analytics/jobs")
        def analytics_jobs():
            from_date, to_date, lang = self._analytics_filters()
            return jsonify({"jobs": self.analytics.jobs(from_date, to_date, lang)})

        @self.app.get("/anki/status")
        def anki_status():
            return jsonify(self.anki.status())

        @self.app.post("/anki/repair")
        def anki_repair():
            try:
                payload = self.anki.repair()
                return jsonify(payload), 200 if payload.get("ok") else 503
            except AnkiRepairBlockedError as exc:
                LOGGER.warning("Anki repair blocked: %s", exc)
                return jsonify(exc.payload), 503
            except RuntimeError as exc:
                LOGGER.warning("Anki repair unavailable: %s", exc)
                return jsonify({"error": "anki_repair_unavailable", "detail": str(exc)}), 409
            except Exception as exc:  # noqa: BLE001
                LOGGER.exception("Anki repair failed")
                return jsonify({"error": "anki_repair_failed", "detail": str(exc)}), 503

        def _requested_anki_stat_decks() -> list[dict[str, str]]:
            deck_names = request.args.getlist("deck")
            langs = request.args.getlist("lang")
            decks = [
                {"deckName": deck_name, "lang": langs[index] if index < len(langs) else "en"}
                for index, deck_name in enumerate(deck_names)
            ]
            if not decks:
                decks = [
                    {"deckName": "English Mining", "lang": "en"},
                    {"deckName": "Russian Mining", "lang": "ru"},
                ]
            deck_filter = (request.args.get("deck") or "").strip()
            if deck_filter and not deck_names:
                decks = [{"deckName": deck_filter, "lang": request.args.get("lang") or "en"}]
            return decks

        @self.app.get("/anki/deck-stats")
        @self.app.get("/anki/stats/decks")
        def anki_deck_stats():
            decks = _requested_anki_stat_decks()
            try:
                refresh = request.args.get("refresh") in {"1", "true", "yes"}
                launch = request.args.get("launch") in {"1", "true", "yes"}
                return jsonify(self._cached_anki_deck_stats(decks, refresh=refresh, launch=launch))
            except RuntimeError as exc:
                LOGGER.warning("Anki deck stats unavailable: %s", exc)
                return jsonify({"error": "anki_stats_unavailable", "detail": str(exc)}), 503
            except Exception as exc:  # noqa: BLE001
                LOGGER.exception("Failed to compute Anki deck stats")
                return jsonify({"error": "anki_stats_unavailable", "detail": str(exc)}), 503

        @self.app.get("/anki/vocabulary")
        def anki_vocabulary():
            deck_name = (request.args.get("deck") or "").strip()
            lang = (request.args.get("lang") or "en").strip().lower()
            if not deck_name:
                return jsonify({"error": "deck_required"}), 400
            if lang not in {"en", "ru"}:
                return jsonify({"error": "invalid_lang"}), 400

            status = (request.args.get("status") or "all").strip().lower()
            if status not in {"all", "new", "recent", "mature", "mixed", "seen"}:
                status = "all"
            item_type = (request.args.get("type") or "all").strip().lower()
            if item_type not in {"all", "word", "term"}:
                item_type = "all"
            search = (request.args.get("q") or "").strip().casefold()
            try:
                limit = max(1, min(10000, int(request.args.get("limit") or 1000)))
            except ValueError:
                limit = 1000
            try:
                offset = max(0, int(request.args.get("offset") or 0))
            except ValueError:
                offset = 0

            try:
                try:
                    data = self._deck_vocabulary(deck_name, lang)
                except Exception as live_exc:  # noqa: BLE001
                    data = self._local_vocabulary(deck_name, lang)
                    data["sourceDetail"] = f"AnkiConnect indisponivel; lendo collection.anki2. Motivo: {type(live_exc).__name__}: {live_exc}"
                words = data["words"]
                if status != "all":
                    words = [word for word in words if word.get("status") == status]
                if item_type != "all":
                    words = [word for word in words if word.get("type") == item_type]
                if search:
                    words = [word for word in words if search in str(word.get("word") or "").casefold()]
                total = len(words)
                data.update({
                    "filters": {"status": status, "type": item_type, "q": search, "limit": limit, "offset": offset},
                    "totalWords": total,
                    "words": words[offset:offset + limit],
                })
                return jsonify(data)
            except Exception as exc:  # noqa: BLE001
                LOGGER.exception("Failed to compute Anki vocabulary")
                return jsonify({"error": "anki_vocabulary_unavailable", "detail": str(exc)}), 503

        @self.app.get("/jobs/<job_id>")
        def job(job_id: str):
            job_data = self._read_job(job_id)
            if not job_data:
                return jsonify({"error": "job_not_found"}), 404
            return jsonify({
                "job": job_data,
                "state": self._read_state(job_id),
            })

        @self.app.get("/jobs/<job_id>/debug-bundle")
        def debug_bundle(job_id: str):
            if not self._job_file(job_id).exists():
                return jsonify({"error": "job_not_found"}), 404
            return jsonify(self._debug_bundle(job_id))

        @self.app.post("/jobs")
        def create_job():
            payload = request.get_json(force=True, silent=False) or {}
            if not isinstance(payload.get("entries"), list) or not payload["entries"]:
                return jsonify({"error": "entries_required"}), 400
            if payload.get("lang") not in ("en", "ru"):
                return jsonify({"error": "invalid_lang"}), 400

            job_id = payload.get("jobId") or f"{datetime.now().strftime('%Y%m%d-%H%M%S')}-{payload['lang']}-{uuid.uuid4().hex[:6]}"
            created_at = _now_iso()
            job_dir = self._job_dir(job_id)
            job_dir.mkdir(parents=True, exist_ok=True)

            job_payload = {
                "jobId": job_id,
                "createdAt": created_at,
                "lang": payload["lang"],
                "deckName": payload.get("deckName", "teste"),
                "imageSource": payload.get("imageSource", "1"),
                "tts": payload.get("tts", {}),
                "entries": payload["entries"],
                "status": "queued",
            }
            state = {
                "jobId": job_id,
                "status": "queued",
                "stage": "queued",
                "completedStages": [],
                "successfulPhraseIds": [],
                "failedPhraseIds": [],
                "lastError": None,
                "updatedAt": created_at,
            }

            with self.lock:
                _write_json(self._job_file(job_id), job_payload)
                self._write_state(job_id, state)
                queue = self._queue_data()
                queue["jobs"].append({
                    "jobId": job_id,
                    "lang": job_payload["lang"],
                    "status": "queued",
                    "createdAt": created_at,
                    "updatedAt": created_at,
                })
                self._save_queue_data(queue)
            return jsonify({"jobId": job_id, "status": "queued"}), 201

        @self.app.post("/jobs/<job_id>/retry")
        def retry_job(job_id: str):
            if not self._job_file(job_id).exists():
                return jsonify({"error": "job_not_found"}), 404
            state = self._read_state(job_id)
            if state.get("status") == "running":
                return jsonify({"jobId": job_id, "status": state.get("status")})
            with self.lock:
                state = self._read_state(job_id)
                state.update({"status": "queued", "stage": "queued", "lastError": None, "ankiError": None, "repairPayload": None})
                state["updatedAt"] = _now_iso()
                self._write_state(job_id, state)
                job_payload = self._read_job(job_id)
                queue = self._queue_data()
                queue_item = next((item for item in queue["jobs"] if item.get("jobId") == job_id), None)
                if queue_item:
                    queue_item["status"] = "queued"
                    queue_item["updatedAt"] = state["updatedAt"]
                else:
                    queue["jobs"].append({
                        "jobId": job_id,
                        "lang": job_payload.get("lang", "unknown"),
                        "status": "queued",
                        "createdAt": job_payload.get("createdAt") or state["updatedAt"],
                        "updatedAt": state["updatedAt"],
                    })
                self._save_queue_data(queue)
            return jsonify({"jobId": job_id, "status": state["status"]})

    def _worker_loop(self) -> None:
        while not self.stop_event.is_set():
            try:
                next_job = None
                with self.lock:
                    queue = self._queue_data()
                    for item in queue["jobs"]:
                        if item.get("status") == "queued":
                            item["status"] = "running"
                            item["updatedAt"] = _now_iso()
                            next_job = item["jobId"]
                            self._save_queue_data(queue)
                            break
                if not next_job:
                    time.sleep(1)
                    continue
                try:
                    self._process_job(next_job)
                except AnkiRepairBlockedError as exc:
                    LOGGER.exception("Job %s blocked by Anki repair access denied", next_job)
                    try:
                        self._update_state(
                            next_job,
                            status="failed",
                            stage="failed",
                            lastError=str(exc),
                            ankiError="repair_access_denied",
                            repairPayload=exc.payload,
                        )
                    except Exception:  # noqa: BLE001
                        LOGGER.exception("Job %s: falha ao salvar estado de erro (AnkiRepairBlocked)", next_job)
                except Exception as exc:  # noqa: BLE001
                    LOGGER.exception("Job %s failed", next_job)
                    try:
                        self._update_state(next_job, status="failed", stage="failed", lastError=str(exc))
                    except Exception:  # noqa: BLE001
                        LOGGER.exception("Job %s: falha ao salvar estado de erro", next_job)
                time.sleep(0.2)
            except Exception:  # noqa: BLE001
                LOGGER.exception("_worker_loop: erro inesperado no loop principal; continuando após 2s")
                time.sleep(2)

    def _build_job_config(self, job: dict[str, Any], workspace: Path) -> dict[str, Any]:
        base = self.modules["config_loader"].load_config()
        base["lang"] = job["lang"]
        base["anki"]["deck_name"] = job["deckName"]
        lang_cfg = base.get("languages", {}).get(job["lang"], {})
        if lang_cfg.get("note_type"):
            base["anki"]["note_type"] = lang_cfg["note_type"]
        if lang_cfg.get("fields"):
            base["anki"]["fields"] = lang_cfg["fields"]

        tts = job.get("tts", {})
        profiles = base.setdefault("tts", {}).setdefault("profiles", {}).setdefault(job["lang"], {})
        word = profiles.setdefault("word", {})
        phrase = profiles.setdefault("phrase", {})
        if tts.get("wordTld"):
            word["tld"] = tts["wordTld"]
            word.setdefault("lang", job["lang"])
        if tts.get("phraseTld"):
            phrase["tld"] = tts["phraseTld"]
            phrase.setdefault("lang", job["lang"])

        output_dir = workspace / "Output"
        log_dir = workspace / "log"
        mining_file = workspace / "mining.txt"
        prompts_file = workspace / "prompts.txt"
        output_dir.mkdir(parents=True, exist_ok=True)
        log_dir.mkdir(parents=True, exist_ok=True)

        base["paths"]["output_dir"] = str(output_dir)
        base["paths"]["log_dir"] = str(log_dir)
        base["paths"]["mining_file"] = str(mining_file)
        base["paths"]["prompts_file"] = str(prompts_file)
        prompts_cfg = base["paths"].get("prompts", {})
        base["paths"]["prompts"] = {
            key: str((self.automatic_anki_path / rel_path).resolve())
            for key, rel_path in prompts_cfg.items()
        }
        return base

    def _write_mining_file(self, workspace: Path, entries: list[dict[str, Any]]) -> None:
        lines = [entry["line"].rstrip() for entry in entries if entry.get("line")]
        (workspace / "mining.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")

    def _load_entries(self, config: dict[str, Any]) -> list[Any]:
        parser = self.modules["parser"]
        mining_path = Path(config["paths"]["mining_file"])
        if config.get("lang") == "ru":
            return parser.parse_mining_file_ru(mining_path)
        return parser.parse_mining_file(mining_path)

    def _unique_phrase_ids(self, values: list[Any]) -> list[int]:
        ids: list[int] = []
        seen: set[int] = set()
        for value in values or []:
            try:
                phrase_id = int(value)
            except (TypeError, ValueError):
                continue
            if phrase_id in seen:
                continue
            ids.append(phrase_id)
            seen.add(phrase_id)
        return ids

    def _job_phrase_ids(self, entries: list[dict[str, Any]]) -> list[int]:
        return self._unique_phrase_ids([entry.get("phraseId") for entry in entries if isinstance(entry, dict)])

    def _pending_send_pairs(
        self,
        original_entries: list[dict[str, Any]],
        parsed_entries: list[Any],
        successful_phrase_ids: list[Any],
    ) -> list[tuple[dict[str, Any], Any]]:
        successful = set(self._unique_phrase_ids(successful_phrase_ids))
        pairs: list[tuple[dict[str, Any], Any]] = []
        for src_entry, parsed_entry in zip(original_entries, parsed_entries, strict=False):
            try:
                phrase_id = int(src_entry.get("phraseId"))
            except (AttributeError, TypeError, ValueError):
                phrase_id = None
            if phrase_id is not None and phrase_id in successful:
                continue
            pairs.append((src_entry, parsed_entry))
        return pairs

    def _expected_stems(self, entries: list[Any]) -> list[str]:
        parser = self.modules["parser"]
        return [
            card_job.filename_stem
            for entry in entries
            for card_job in parser.get_card_jobs(entry)
        ]

    def _files_ready(self, paths: list[Path]) -> bool:
        return bool(paths) and all(path.exists() and path.stat().st_size > 0 for path in paths)

    def _card_texts_ready(self, config: dict[str, Any], entries: list[Any]) -> bool:
        output_dir = Path(config["paths"]["output_dir"])
        return self._files_ready([output_dir / f"{stem}.txt" for stem in self._expected_stems(entries)])

    def _audio_ready(self, config: dict[str, Any], entries: list[Any]) -> bool:
        output_dir = Path(config["paths"]["output_dir"])
        paths: list[Path] = []
        for stem in self._expected_stems(entries):
            paths.append(output_dir / f"{stem}_word.mp3")
            paths.append(output_dir / f"{stem}_phrase.mp3")
        return self._files_ready(paths)

    def _prompts_ready(self, config: dict[str, Any]) -> bool:
        return Path(config["paths"]["prompts_file"]).exists()

    def _mark_completed(self, job_id: str, stage: str) -> None:
        state = self._read_state(job_id)
        completed = state.get("completedStages", [])
        if stage not in completed:
            completed.append(stage)
        self._update_state(job_id, completedStages=completed)

    def _set_stage(self, job_id: str, stage: str, **extra: Any) -> None:
        self._update_state(job_id, stage=stage, status="running", **extra)

    def _run_images(self, job_id: str, config: dict[str, Any], entries: list[Any], image_source: str) -> tuple[list[str], int, dict[str, str]]:
        start_mod = self.modules["start"]
        prompts_file = Path(config["paths"]["prompts_file"])
        prompt_lines = [line.strip() for line in prompts_file.read_text(encoding="utf-8").splitlines() if line.strip()] if prompts_file.exists() else []
        self._set_stage(job_id, "generate_images", progress={"done": 0, "total": len(prompt_lines)})
        return start_mod._run_images(  # noqa: SLF001
            config,
            prompt_lines,
            Path(config["paths"]["output_dir"]),
            image_source,
            config["openai_api_key"],
            config["paths"]["log_dir"],
        )

    def _run_with_retry(
        self,
        fn: Callable[..., Any],
        *args: Any,
        attempts: int = 3,
        retry_if: Callable[[Exception], bool] | None = None,
        **kwargs: Any,
    ) -> Any:
        last_exc: Exception | None = None
        for attempt in range(1, attempts + 1):
            try:
                return fn(*args, **kwargs)
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                should_retry = retry_if(exc) if retry_if else False
                if not should_retry or attempt >= attempts:
                    raise
                time.sleep(1.5 + random.random())
        if last_exc:
            raise last_exc

    def _is_transient_audio_error(self, exc: Exception) -> bool:
        msg = str(exc).lower()
        return "failed to connect" in msg or "connection" in msg or "timed out" in msg

    def _is_transient_anki_error(self, exc: Exception) -> bool:
        msg = str(exc).lower()
        return (
            "collection is not available" in msg
            or "failed to establish a new connection" in msg
            or "connection refused" in msg
            or "connection aborted" in msg
            or "remote end closed connection" in msg
            or "timed out" in msg
        )

    def _send_to_anki_with_ready_retry(self, job_id: str, entries: list[Any], config: dict[str, Any]) -> dict[str, bool]:
        import io
        import contextlib

        last_exc: Exception | None = None
        for attempt in range(1, 4):
            self.anki.ensure_ready()
            try:
                buf = io.StringIO()
                with contextlib.redirect_stdout(buf):
                    result = self.modules["send_to_anki"].run(entries, config)
                output = buf.getvalue().strip()
                if output:
                    LOGGER.info("send_to_anki stdout (job %s attempt %s):\n%s", job_id, attempt, output)
                failed_stems = [stem for stem, ok in result.items() if not ok]
                if failed_stems:
                    LOGGER.warning("send_to_anki: %d/%d notes failed for job %s: %s", len(failed_stems), len(result), job_id, failed_stems)
                return result
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                if attempt >= 3 or not self._is_transient_anki_error(exc):
                    raise
                LOGGER.warning(
                    "Transient Anki send failure for job %s on attempt %s/3: %s",
                    job_id,
                    attempt,
                    exc,
                )
                time.sleep(2)
        if last_exc:
            raise last_exc
        return {}

    def _phrase_id_map(self, entries: list[dict[str, Any]]) -> dict[str, int]:
        mapping: dict[str, int] = {}
        parser = self.modules["parser"]
        temp_path = self.jobs_root / "_tmp_mapping.txt"
        try:
            temp_path.write_text("\n".join(entry["line"] for entry in entries) + "\n", encoding="utf-8")
            parsed = parser.parse_mining_file_ru(temp_path) if any("ru" == entry.get("lang") for entry in []) else parser.parse_mining_file(temp_path)
        finally:
            if temp_path.exists():
                temp_path.unlink()
        for original in parsed:
            jobs = parser.get_card_jobs(original)
            for job in jobs:
                for entry in entries:
                    if entry["line"] == self._entry_to_line(original):
                        mapping[job.filename_stem] = entry["phraseId"]
        return mapping

    def _entry_to_line(self, entry: Any) -> str:
        source = entry.context_source or ""
        title = entry.context_title or ""
        detail = entry.context_detail or ""
        if len(entry.keywords) == 1 and entry.phrase == entry.keywords[0] and any(ord(ch) > 127 for ch in entry.phrase):
            return f"{entry.phrase} [Contexto: {source} - {title} - {detail}]".strip()
        prefix = " | ".join(entry.keywords)
        return f"{prefix} : {entry.phrase} [Contexto: {source} - {title} - {detail}]".strip()

    def _process_job(self, job_id: str) -> None:
        job = self._read_job(job_id)
        workspace = self._job_dir(job_id)
        self._write_mining_file(workspace, job["entries"])
        config = self._build_job_config(job, workspace)
        entries = self._load_entries(config)
        parser = self.modules["parser"]

        state = self._read_state(job_id)
        completed = set(state.get("completedStages", []))

        cards_ran = False
        prompts_ran = False

        if "generate_cards" not in completed or not self._card_texts_ready(config, entries):
            self._set_stage(job_id, "generate_cards")
            self.modules["generate_cards"].run(entries, config)
            if not self._card_texts_ready(config, entries):
                raise RuntimeError(
                    "generate_cards não gerou os arquivos .txt esperados. "
                    "Causa mais comum: erro da API OpenAI (429/cota esgotada ou chave inválida). "
                    "Verifique os créditos em platform.openai.com e o bridge.log para o erro exato."
                )
            self._mark_completed(job_id, "generate_cards")
            cards_ran = True

        if cards_ran or "extract_prompts" not in completed or not self._prompts_ready(config):
            self._set_stage(job_id, "extract_prompts")
            self.modules["extract_prompts"].run(entries, config)
            self._mark_completed(job_id, "extract_prompts")
            prompts_ran = True

        if cards_ran or "generate_audio" not in completed or not self._audio_ready(config, entries):
            total_jobs = len([job_item for entry in entries for job_item in parser.get_card_jobs(entry)]) * 2
            def audio_progress(done: int, total: int, label: str) -> None:
                self._set_stage(job_id, "generate_audio", progress={"done": done, "total": total or total_jobs, "label": label})
            self._set_stage(job_id, "generate_audio", progress={"done": 0, "total": total_jobs})
            self._run_with_retry(
                self.modules["generate_audio"].run,
                entries,
                config,
                progress_callback=audio_progress,
                attempts=3,
                retry_if=self._is_transient_audio_error,
            )
            if not self._audio_ready(config, entries):
                raise RuntimeError(
                    "generate_audio não gerou os arquivos .mp3 esperados. "
                    "Causa comum: erro da API de áudio (cota/limite ou chave inválida). "
                    "Verifique o bridge.log para o erro exato."
                )
            self._mark_completed(job_id, "generate_audio")

        if prompts_ran or "generate_images" not in completed:
            self._run_images(job_id, config, entries, job.get("imageSource", "1"))
            self._mark_completed(job_id, "generate_images")

        if "wait_anki" not in completed:
            self._set_stage(job_id, "wait_anki")
            self.anki.ensure_ready()
            self._mark_completed(job_id, "wait_anki")

        previously_successful = self._unique_phrase_ids(state.get("successfulPhraseIds") or [])
        pending_pairs = self._pending_send_pairs(job["entries"], entries, previously_successful)
        send_entries = [parsed_entry for _, parsed_entry in pending_pairs]

        self._set_stage(job_id, "send_to_anki")
        stem_to_phrase_id: dict[str, int] = {}
        phrase_to_stems: dict[int, list[str]] = {}
        for src_entry, original in pending_pairs:
            phrase_id = int(src_entry["phraseId"])
            phrase_to_stems.setdefault(phrase_id, [])
            for card_job in parser.get_card_jobs(original):
                stem_to_phrase_id[card_job.filename_stem] = phrase_id
                phrase_to_stems[phrase_id].append(card_job.filename_stem)

        try:
            if send_entries:
                results = self._send_to_anki_with_ready_retry(job_id, send_entries, config)
            else:
                results = {}
        except Exception:
            failed = self._unique_phrase_ids([*state.get("failedPhraseIds", []), *phrase_to_stems.keys()])
            self._update_state(job_id, failedPhraseIds=failed)
            raise

        new_successful = [
            phrase_id
            for phrase_id, stems in phrase_to_stems.items()
            if stems and all(results.get(stem) is True for stem in stems)
        ]
        successful = self._unique_phrase_ids([*previously_successful, *new_successful])
        failed = self._unique_phrase_ids([
            phrase_id
            for phrase_id, stems in phrase_to_stems.items()
            if stems and not all(results.get(stem) is True for stem in stems)
        ])
        if results and all(results.values()):
            self.modules["send_to_anki"].cleanup_output(Path(config["paths"]["output_dir"]), results)
        requested = set(self._job_phrase_ids(job.get("entries") or []))
        successful_set = set(successful)
        failed_set = set(failed)
        pending_failed = [phrase_id for phrase_id in requested if phrase_id not in successful_set and phrase_id not in failed_set]
        failed = self._unique_phrase_ids([*failed, *pending_failed])
        completed = bool(requested) and successful_set >= requested and not failed
        self._update_state(
            job_id,
            status="completed" if completed else ("partial" if successful else "failed"),
            stage="completed" if completed else ("partial" if successful else "failed"),
            successfulPhraseIds=successful,
            failedPhraseIds=failed,
            lastError=None if completed else "Falha ao enviar um ou mais cards ao Anki",
        )


def main() -> None:
    bridge = BridgeApp()
    bridge.start()
    host = bridge.config.get("host", "127.0.0.1")
    port = int(bridge.config.get("port", 8766))
    bridge.app.run(host=host, port=port, debug=False, use_reloader=False)


if __name__ == "__main__":
    main()

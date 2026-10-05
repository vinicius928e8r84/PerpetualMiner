from __future__ import annotations

import copy
import ctypes
import hashlib
import importlib
import json
import logging
import os
import re
import sqlite3
import subprocess
import sys
import threading
import time
from datetime import date, datetime
from pathlib import Path
from typing import Any, Callable
from urllib.request import pathname2url

import requests
from flask import Flask, jsonify, request

from anki_session import AnkiRepairBlockedError, AnkiSession
import card_normalization as cardnorm
from analytics import JobAnalytics
from envio import (
    AutomaticAnkiEngine,
    JobRunner,
    JobStore,
    JobWorker,
    job_phrase_ids,
    now_iso as _now_iso,
    read_json as _read_json,
    unique_phrase_ids,
)


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
        self.store = JobStore(self.jobs_root, self.queue_file)
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
        self.engine = AutomaticAnkiEngine(self.modules, self.automatic_anki_path)
        self.job_worker = JobWorker(self.store, JobRunner(self.store, self.engine, self.anki), self.stop_event)
        self.worker = threading.Thread(target=self.job_worker.loop, daemon=True)
        self.analytics = JobAnalytics(
            self.jobs_root,
            self.queue_file,
            unique_phrase_ids=unique_phrase_ids,
            job_phrase_ids=job_phrase_ids,
        )

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
        self.store.ensure_runtime()
        self.anki.ensure_connect_enabled()
        self.store.recover_interrupted()
        self._load_modules()
        LOGGER.info(
            "Bridge starting. automatic_anki_path=%s anki_executable=%s anki_connect_url=%s",
            self.automatic_anki_path,
            self.anki_executable,
            self.anki_connect_url,
        )
        self.worker.start()

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

    def _anki_deck_names(self) -> list[str]:
        """Os baralhos que o Anki tem, para a aba Ajustes de envio oferecer a escolha.

        Ao vivo pelo AnkiConnect; sem ele, lidos do arquivo local (os níveis vêm
        separados por \x1f, que aqui voltam a ser `::`). O "Default" do Anki não entra.
        """
        ready, _detail = self.anki.collection_ready_status()
        if ready:
            try:
                names = self.anki.invoke("deckNames") or []
            except Exception:  # noqa: BLE001
                ready = False
        if not ready:
            con = self._open_local_anki_collection()
            try:
                names = [row["name"] for row in con.execute("select name from decks")]
            finally:
                con.close()
        cleaned = {str(name or "").replace("\x1f", "::").strip() for name in names}
        return sorted((name for name in cleaned if name and name != "Default"), key=str.casefold)

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
            if (name := str(row["name"] or "").replace("\x1f", "::")) == deck_name or name.startswith(prefix)
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
        job_dir = self.store.job_dir(job_id)
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
        job_data = self._safe_read_json(self.store.job_file(job_id), {})
        state = self._safe_read_json(self.store.state_file(job_id), {})
        queue_item = next((item for item in self._safe_read_json(self.queue_file, {"jobs": []}).get("jobs", []) if item.get("jobId") == job_id), None)
        costs = self._read_jsonl(self.store.job_dir(job_id) / "log" / "costs.jsonl")
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

    def _register_routes(self) -> None:
        @self.app.get("/health")
        def health():
            queue = self.store.queue_data()
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
            return jsonify({"jobs": self.store.listing()})

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

        # As leituras do Anki também atendem POST com corpo JSON: é o contrato da Conexão como complemento do
        # Anki (complemento/contrato/exemplos.json), que a extensão fala. O GET fica para quem ainda o usa.
        def _read_params() -> Any:
            """Os parâmetros do pedido: a query string (GET) ou o corpo JSON (POST)."""
            if request.method == "POST":
                body = request.get_json(silent=True)
                return body if isinstance(body, dict) else {}
            return request.args

        @self.app.route("/anki/decks", methods=["GET", "POST"])
        def anki_decks():
            try:
                return jsonify({"decks": self._anki_deck_names()})
            except Exception as exc:  # noqa: BLE001
                LOGGER.warning("Anki deck names unavailable: %s", exc)
                return jsonify({"error": "anki_decks_unavailable", "detail": str(exc)}), 503

        def _requested_anki_stat_decks() -> list[dict[str, str]]:
            if request.method == "POST":
                requested = _read_params().get("decks")
                return [item for item in requested if isinstance(item, dict)] if isinstance(requested, list) else []
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
        @self.app.route("/anki/stats/decks", methods=["GET", "POST"])
        def anki_deck_stats():
            decks = _requested_anki_stat_decks()
            params = _read_params()
            try:
                refresh = str(params.get("refresh")).lower() in {"1", "true", "yes"}
                launch = str(params.get("launch")).lower() in {"1", "true", "yes"}
                return jsonify(self._cached_anki_deck_stats(decks, refresh=refresh, launch=launch))
            except RuntimeError as exc:
                LOGGER.warning("Anki deck stats unavailable: %s", exc)
                return jsonify({"error": "anki_stats_unavailable", "detail": str(exc)}), 503
            except Exception as exc:  # noqa: BLE001
                LOGGER.exception("Failed to compute Anki deck stats")
                return jsonify({"error": "anki_stats_unavailable", "detail": str(exc)}), 503

        @self.app.route("/anki/vocabulary", methods=["GET", "POST"])
        def anki_vocabulary():
            params = _read_params()
            deck_name = str(params.get("deck") or "").strip()
            lang = str(params.get("lang") or "en").strip().lower()
            if not deck_name:
                return jsonify({"error": "deck_required"}), 400
            if lang not in {"en", "ru"}:
                return jsonify({"error": "invalid_lang"}), 400

            status = str(params.get("status") or "all").strip().lower()
            if status not in {"all", "new", "recent", "mature", "mixed", "seen"}:
                status = "all"
            item_type = str(params.get("type") or "all").strip().lower()
            if item_type not in {"all", "word", "term"}:
                item_type = "all"
            search = str(params.get("q") or "").strip().casefold()
            try:
                limit = max(1, min(10000, int(params.get("limit") or 1000)))
            except ValueError:
                limit = 1000
            try:
                offset = max(0, int(params.get("offset") or 0))
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
            job_data = self.store.read_job(job_id)
            if not job_data:
                return jsonify({"error": "job_not_found"}), 404
            return jsonify({
                "job": job_data,
                "state": self.store.read_state(job_id),
            })

        @self.app.get("/jobs/<job_id>/debug-bundle")
        def debug_bundle(job_id: str):
            if not self.store.exists(job_id):
                return jsonify({"error": "job_not_found"}), 404
            return jsonify(self._debug_bundle(job_id))

        @self.app.post("/jobs")
        def create_job():
            payload = request.get_json(force=True, silent=False) or {}
            if not isinstance(payload.get("entries"), list) or not payload["entries"]:
                return jsonify({"error": "entries_required"}), 400
            if payload.get("lang") not in ("en", "ru"):
                return jsonify({"error": "invalid_lang"}), 400

            job_id = self.store.create(payload)
            return jsonify({"jobId": job_id, "status": "queued"}), 201

        @self.app.post("/jobs/<job_id>/retry")
        def retry_job(job_id: str):
            if not self.store.exists(job_id):
                return jsonify({"error": "job_not_found"}), 404
            return jsonify({"jobId": job_id, "status": self.store.requeue(job_id)})


def main() -> None:
    bridge = BridgeApp()
    bridge.start()
    host = bridge.config.get("host", "127.0.0.1")
    port = int(bridge.config.get("port", 8766))
    bridge.app.run(host=host, port=port, debug=False, use_reloader=False)


if __name__ == "__main__":
    main()

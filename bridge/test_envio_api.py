"""Envio pela API real e pelo adapter AutomaticAnkiEngine, sem servicos externos.

O parser e os produtos no disco sao reais; so os modulos que chamariam APIs
pagas/Anki sao substituidos. As respostas de /jobs e os JSON persistidos sao
os contratos observados, inclusive ao continuar o mesmo Envio.
"""
from __future__ import annotations

import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Callable
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "bridge"))

import server
from engine import parser
from envio import ADDED, CARD_FAILED, DUPLICATE


class OfflineModules:
    """Produtos locais deterministas no lugar dos servicos do Automatic Anki."""

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []
        self.send_plan: dict[str, str] = {}
        self.present: set[str] = set()
        self.on_call: Callable[[], None] = lambda: None
        self.modules = {
            "parser": parser,
            "config_loader": SimpleNamespace(load_config=self.config),
            "generate_cards": SimpleNamespace(run=self.generate_cards),
            "extract_prompts": SimpleNamespace(run=self.extract_prompts),
            "generate_audio": SimpleNamespace(run=self.generate_audio),
            "start": SimpleNamespace(_run_images=self.generate_images),
            "send_to_anki": SimpleNamespace(
                run=self.send,
                is_present=lambda raw: raw in (ADDED, DUPLICATE),
                DUPLICATE=DUPLICATE,
                cleanup_output=self.cleanup,
            ),
        }

    @staticmethod
    def config() -> dict[str, Any]:
        return {
            "anki": {"deck_name": "base", "note_type": "base", "fields": {}},
            "languages": {
                "en": {"note_type": "English", "fields": {"front": "Front", "back": "Back"}},
                "ru": {"note_type": "Russian", "fields": {"front": "Frente", "back": "Verso"}},
            },
            "tts": {"profiles": {}},
            "paths": {"prompts": {"cards": "prompts/cards.txt"}},
            "openai_api_key": "offline-not-a-key",
        }

    @staticmethod
    def cards(entries: list[Any]) -> list[Any]:
        return [card for entry in entries for card in parser.get_card_jobs(entry)]

    def record(self, stage: str, **fields: Any) -> None:
        self.calls.append({"stage": stage, **fields})
        self.on_call()

    def generate_cards(self, entries: list[Any], config: dict[str, Any]) -> None:
        self.record(
            "generate_cards",
            lang=config["lang"],
            deckName=config["anki"]["deck_name"],
            noteType=config["anki"]["note_type"],
            tts=copy.deepcopy(config["tts"]),
        )
        output = Path(config["paths"]["output_dir"])
        for card in self.cards(entries):
            (output / f"{card.filename_stem}.txt").write_text(card.phrase, encoding="utf-8")

    def extract_prompts(self, entries: list[Any], config: dict[str, Any]) -> None:
        self.record("extract_prompts")
        lines = [f"{card.filename_stem}: image of {card.keyword}" for card in self.cards(entries)]
        Path(config["paths"]["prompts_file"]).write_text("\n".join(lines) + "\n", encoding="utf-8")

    def generate_audio(self, entries: list[Any], config: dict[str, Any], progress_callback: Any) -> None:
        self.record("generate_audio")
        cards = self.cards(entries)
        output = Path(config["paths"]["output_dir"])
        for index, card in enumerate(cards, 1):
            for kind in ("word", "phrase"):
                (output / f"{card.filename_stem}_{kind}.mp3").write_bytes(b"offline audio fixture")
            progress_callback(index * 2, len(cards) * 2, card.keyword)

    def generate_images(
        self, config: dict[str, Any], lines: list[str], output: Path,
        image_source: str, api_key: str, log_dir: str,
    ) -> None:
        self.record("generate_images", imageSource=image_source, total=len(lines))
        for line in lines:
            stem = line.split(":", 1)[0]
            (output / f"{stem}.jpg").write_bytes(b"offline image fixture")

    def send(self, entries: list[Any], config: dict[str, Any]) -> dict[str, str]:
        results = {}
        for card in self.cards(entries):
            stem = card.filename_stem
            results[stem] = self.send_plan.get(card.keyword, DUPLICATE if stem in self.present else ADDED)
            if results[stem] != CARD_FAILED:
                self.present.add(stem)
        self.record("send_to_anki", phrases=[entry.phrase for entry in entries], results=results)
        return results

    def cleanup(self, output: Path, results: dict[str, str]) -> None:
        self.record("cleanup", results=results)
        for stem, raw in results.items():
            if raw in (ADDED, DUPLICATE):
                for path in output.glob(f"{stem}.*"):
                    path.unlink()
                for path in output.glob(f"{stem}_*.mp3"):
                    path.unlink()


def offline_bridge(root: Path) -> tuple[server.BridgeApp, OfflineModules]:
    bridge = server.BridgeApp(config={
        "automatic_anki_path": "engine",
        "jobs_root": str(root / "jobs"),
        "queue_file": str(root / "queue.json"),
    })
    modules = OfflineModules()
    bridge.modules.update(modules.modules)
    bridge.store.ensure_runtime()
    bridge.anki.ensure_ready = lambda: modules.record("ensure_ready")
    return bridge, modules


class EnvioApiTests(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.bridge, self.modules = offline_bridge(self.root)
        self.client = self.bridge.app.test_client()
        self.observed: list[dict[str, Any]] = []
        self.modules.on_call = lambda: self.observed.append(self.client.get("/jobs").get_json())

    def create(self, job_id: str = "envio-api", lang: str = "en") -> str:
        entries = [
            {"phraseId": 1, "line": "sack : She hit the sack early. [Contexto: netflix - Show - Episode]"},
            {"phraseId": 2, "line": "arm | leg : It costs an arm and a leg."},
            {"phraseId": 3, "line": "late : Better late than never."},
        ] if lang == "en" else [{"phraseId": 4, "line": "Я улыбаюсь каждое утро. [Contexto: livro - Livro - 10]"}]
        response = self.client.post("/jobs", json={
            "jobId": job_id, "lang": lang, "entries": entries,
            "deckName": "Inglês::Mineradas" if lang == "en" else "RUSSIAN",
            "imageSource": "2", "tts": {"wordTld": "com", "phraseTld": "co.uk"},
        })
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.get_json(), {"jobId": job_id, "status": "queued"})
        return job_id

    def state(self, job_id: str) -> dict[str, Any]:
        response = self.client.get(f"/jobs/{job_id}")
        self.assertEqual(response.status_code, 200)
        return response.get_json()["state"]

    def assert_persisted(self, job_id: str) -> None:
        job = json.loads((self.root / "jobs" / job_id / "job.json").read_text(encoding="utf-8"))
        state = json.loads((self.root / "jobs" / job_id / "state.json").read_text(encoding="utf-8"))
        queue = json.loads((self.root / "queue.json").read_text(encoding="utf-8"))
        self.assertEqual(self.client.get(f"/jobs/{job_id}").get_json(), {"job": job, "state": state})
        self.assertEqual(self.client.get("/jobs").get_json(), {"jobs": [{**queue["jobs"][0], "state": state}]})
        self.assertEqual(set(queue["jobs"][0]), {"jobId", "lang", "status", "createdAt", "updatedAt"})
        self.assertEqual(queue["jobs"][0]["status"], state["status"])

    def test_added_duplicate_and_failed_phrases_are_visible_and_persisted_then_only_missing_are_retried(self) -> None:
        job_id = self.create()
        self.modules.send_plan = {"late": DUPLICATE, "leg": CARD_FAILED}

        self.assertTrue(self.bridge.job_worker.run_next())

        state = self.state(job_id)
        self.assertEqual((state["status"], state["successfulPhraseIds"], state["duplicatePhraseIds"], state["failedPhraseIds"]),
                         ("partial", [1, 3], [3], [2]))
        self.assert_persisted(job_id)
        self.assertNotIn("cleanup", [call["stage"] for call in self.modules.calls])
        stages = [item["jobs"][0]["state"]["stage"] for item in self.observed]
        self.assertEqual(stages, ["generate_cards", "extract_prompts", "generate_audio", "generate_images",
                                  "wait_anki", "send_to_anki", "send_to_anki"])

        self.modules.calls.clear()
        self.modules.send_plan.clear()
        retry = self.client.post(f"/jobs/{job_id}/retry")
        self.assertEqual(retry.get_json(), {"jobId": job_id, "status": "queued"})
        self.assertTrue(self.bridge.job_worker.run_next())

        state = self.state(job_id)
        self.assertEqual((state["status"], state["successfulPhraseIds"], state["duplicatePhraseIds"], state["failedPhraseIds"]),
                         ("completed", [1, 3, 2], [3], []))
        self.assertEqual([call["stage"] for call in self.modules.calls], ["ensure_ready", "send_to_anki", "cleanup"])
        self.assertEqual(self.modules.calls[1]["phrases"], ["It costs an arm and a leg."])
        self.assert_persisted(job_id)
        self.assertFalse(self.bridge.job_worker.run_next())

    def test_missing_audio_is_regenerated_on_retry_without_regenerating_cards_prompts_or_images(self) -> None:
        job_id = self.create()
        self.modules.send_plan = {"leg": CARD_FAILED}
        self.bridge.job_worker.run_next()
        output = self.root / "jobs" / job_id / "Output"
        next(output.glob("*_phrase.mp3")).unlink()
        self.modules.calls.clear()
        self.modules.send_plan.clear()

        self.client.post(f"/jobs/{job_id}/retry")
        self.bridge.job_worker.run_next()

        self.assertEqual([call["stage"] for call in self.modules.calls],
                         ["generate_audio", "ensure_ready", "send_to_anki", "cleanup"])
        self.assertEqual(self.state(job_id)["status"], "completed")
        self.assert_persisted(job_id)

    def test_russian_job_uses_the_real_parser_and_language_specific_config(self) -> None:
        job_id = self.create(lang="ru")

        self.bridge.job_worker.run_next()

        state = self.state(job_id)
        self.assertEqual((state["status"], state["successfulPhraseIds"]), ("completed", [4]))
        generated = self.modules.calls[0]
        self.assertEqual((generated["lang"], generated["deckName"], generated["noteType"]), ("ru", "RUSSIAN", "Russian"))
        self.assertEqual(generated["tts"]["profiles"]["ru"]["phrase"], {"tld": "co.uk", "lang": "ru"})
        sent = next(call for call in self.modules.calls if call["stage"] == "send_to_anki")
        self.assertEqual(sent["phrases"], ["Я улыбаюсь каждое утро."])
        self.assert_persisted(job_id)

    def test_start_tolerates_invalid_utf8_state_and_the_api_remains_available(self) -> None:
        job_id = self.create()
        self.bridge.store.claim_next()
        self.bridge.store.set_stage(job_id, "generate_audio")
        self.bridge.store.state_file(job_id).write_bytes(b'{"progress": {"label": "\xd0"}}')

        with mock.patch.object(self.bridge.anki, "ensure_connect_enabled"), \
                mock.patch.object(self.bridge, "_load_modules"), \
                mock.patch.object(self.bridge.worker, "start") as start_worker:
            self.bridge.start()

        start_worker.assert_called_once_with()
        health = self.client.get("/health")
        self.assertEqual(health.status_code, 200)
        self.assertEqual((health.get_json()["ok"], health.get_json()["jobs"], health.get_json()["activeJobId"]), (True, 1, None))
        self.assertEqual(self.client.get("/jobs").get_json()["jobs"][0]["status"], "queued")
        self.assertEqual(self.state(job_id), {})
        self.assertTrue(self.bridge.job_worker.run_next())
        self.assertEqual(self.state(job_id)["status"], "completed")
        self.assert_persisted(job_id)


class LeiturasDoAnkiPorPostTests(unittest.TestCase):
    """A extensão lê os Baralhos por POST com corpo JSON, como na Conexão do complemento do Anki
    (complemento/contrato/exemplos.json); o GET segue respondendo o mesmo."""

    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.bridge, self.modules = offline_bridge(Path(temporary.name))
        self.modules.modules["config_loader"].base_config = OfflineModules.config
        self.bridge.anki.collection_ready_status = lambda: (True, "")
        self.bridge.anki.invoke = self.ankiconnect
        self.client = self.bridge.app.test_client()

    @staticmethod
    def ankiconnect(action: str, params: dict[str, Any] | None = None, timeout: int = 20) -> Any:
        notes = {
            1: {"noteId": 1, "fields": {"Front": {"value": "She <b>gave up</b> smoking"}, "Back": {"value": "give up /ɡɪv ʌp/"}}},
            2: {"noteId": 2, "fields": {"Front": {"value": "I gave her the book"}, "Back": {"value": "give /ɡɪv/"}}},
        }
        cards = {10: {"cardId": 10, "note": 1, "type": 2, "interval": 40}, 11: {"cardId": 11, "note": 2, "type": 0, "interval": 0}}
        return {
            "deckNames": ["Default", "Inglês", "Inglês::Séries"],
            "findNotes": list(notes),
            "findCards": list(cards),
            "notesInfo": [notes[i] for i in (params or {}).get("notes", [])],
            "cardsInfo": [cards[i] for i in (params or {}).get("cards", [])],
        }[action]

    def test_os_baralhos_lidos_por_post_sao_os_mesmos_do_get(self) -> None:
        self.assertEqual(self.client.post("/anki/decks", json={}).get_json(), self.client.get("/anki/decks").get_json())
        self.assertEqual(self.client.post("/anki/decks", json={}).get_json(), {"decks": ["Inglês", "Inglês::Séries"]})

    def test_o_vocabulario_pedido_por_post_traz_os_filtros_do_corpo(self) -> None:
        body = {"deck": "Inglês", "lang": "en", "type": "term", "limit": 10000}
        post = self.client.post("/anki/vocabulary", json=body).get_json()
        get = self.client.get("/anki/vocabulary?deck=Inglês&lang=en&type=term&limit=10000").get_json()
        self.assertEqual([(w["word"], w["type"]) for w in post["words"]], [("gave up", "term")])
        self.assertEqual((post["words"], post["filters"]), (get["words"], get["filters"]))

    def test_o_vocabulario_por_post_sem_baralho_e_recusado_como_no_get(self) -> None:
        response = self.client.post("/anki/vocabulary", json={"lang": "en"})
        self.assertEqual((response.status_code, response.get_json()), (400, {"error": "deck_required"}))

    def test_um_limite_e_um_deslocamento_que_nao_sao_numeros_voltam_ao_padrao_em_vez_de_quebrar(self) -> None:
        for bad in ({"a": 1}, [3], "muitos"):
            response = self.client.post("/anki/vocabulary", json={"deck": "Inglês", "lang": "en", "limit": bad, "offset": bad})
            self.assertEqual(response.status_code, 200)
            self.assertEqual((response.get_json()["filters"]["limit"], response.get_json()["filters"]["offset"]), (1000, 0))

    def test_os_numeros_dos_baralhos_pedidos_por_post_voltam_na_ordem_pedida_e_o_que_nao_existe_vem_missing(self) -> None:
        decks = [{"deckName": "Alemão", "lang": "en"}, {"deckName": "Inglês", "lang": "en"}]
        rows = self.client.post("/anki/stats/decks", json={"decks": decks, "refresh": True}).get_json()["decks"]
        self.assertEqual([(row["deckName"], bool(row.get("missing")), row["cards"]) for row in rows],
                         [("Alemão", True, 0), ("Inglês", False, 2)])


if __name__ == "__main__":
    unittest.main()

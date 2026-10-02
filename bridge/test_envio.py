"""Testes do Envio ao Anki pela interface: JobStore, JobRunner e JobWorker com um
Engine de mentira (nenhum arquivo do Automatic Anki, nenhum Flask, nenhum Anki)."""
from __future__ import annotations

import json
import logging
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from typing import Any
from unittest import mock

sys.path.insert(0, str(Path(__file__).parent))

import envio  # noqa: E402
from anki_session import AnkiRepairBlockedError  # noqa: E402
from envio import ADDED, CARD_FAILED, DUPLICATE, JobRunner, JobStore, JobWorker  # noqa: E402


def setUpModule() -> None:
    logging.disable(logging.CRITICAL)


def tearDownModule() -> None:
    logging.disable(logging.NOTSET)


class FakeEngine:
    """Cada frase `n` vira dois cartoes: `s<n>a` e `s<n>b`. `files` diz o que
    existe no disco; `send_plan` decide o resultado de cada cartao."""

    def __init__(self) -> None:
        self.calls: list[str] = []
        self.files: set[str] = set()
        self.send_plan: dict[str, str] = {}
        self.send_errors: list[Exception] = []
        self.audio_errors: list[Exception] = []
        self.sent: list[list[str]] = []
        self.cleaned: list[dict[str, Any]] = []
        self.make_cards = True
        self.make_audio = True
        self.parsed_limit: int | None = None

    # -- Engine --
    def prepare(self, job: dict[str, Any], workspace: Path) -> tuple[str, list[str]]:
        self.calls.append("prepare")
        parsed = [f"s{entry['phraseId']}" for entry in job["entries"]]
        return "config", parsed[: self.parsed_limit]

    def stems_of(self, entry: str) -> list[str]:
        return [f"{entry}a", f"{entry}b"]

    def card_texts_ready(self, config: Any, entries: list[str]) -> bool:
        return "cards" in self.files

    def prompts_ready(self, config: Any) -> bool:
        return "prompts" in self.files

    def audio_ready(self, config: Any, entries: list[str]) -> bool:
        return "audio" in self.files

    def generate_cards(self, entries: list[str], config: Any) -> None:
        self.calls.append("generate_cards")
        if self.make_cards:
            self.files.add("cards")

    def extract_prompts(self, entries: list[str], config: Any) -> None:
        self.calls.append("extract_prompts")
        self.files.add("prompts")

    def audio_total(self, entries: list[str]) -> int:
        return len(entries) * 4

    def generate_audio(self, entries: list[str], config: Any, progress_callback: Any) -> None:
        self.calls.append("generate_audio")
        if self.audio_errors:
            raise self.audio_errors.pop(0)
        progress_callback(1, 0, "primeiro")
        if self.make_audio:
            self.files.add("audio")

    def prompt_lines(self, config: Any) -> list[str]:
        return ["p1", "p2", "p3"]

    def generate_images(self, config: Any, prompt_lines: list[str], image_source: str) -> None:
        self.calls.append(f"generate_images:{image_source}")

    def send(self, entries: list[str], config: Any) -> dict[str, Any]:
        self.calls.append("send")
        if self.send_errors:
            raise self.send_errors.pop(0)
        self.sent.append(list(entries))
        return {stem: self.send_plan.get(stem, ADDED) for entry in entries for stem in self.stems_of(entry)}

    def classify(self, raw_status: Any) -> str:
        return raw_status if raw_status in (ADDED, DUPLICATE) else CARD_FAILED

    def cleanup(self, config: Any, results: dict[str, Any]) -> None:
        self.calls.append("cleanup")
        self.cleaned.append(results)


class FakeAnki:
    def __init__(self) -> None:
        self.ready_calls = 0
        self.blocked: AnkiRepairBlockedError | None = None

    def ensure_ready(self) -> None:
        self.ready_calls += 1
        if self.blocked:
            raise self.blocked


def _payload(*phrase_ids: int, lang: str = "en", **extra: Any) -> dict[str, Any]:
    return {
        "lang": lang,
        "entries": [{"phraseId": pid, "line": f"linha {pid}"} for pid in phrase_ids],
        **extra,
    }


class EnvioTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        root = Path(self._tmp.name)
        self.store = JobStore(root / "jobs", root / "queue.json")
        self.store.ensure_runtime()
        self.engine = FakeEngine()
        self.anki = FakeAnki()
        self.sleeps: list[float] = []
        self.runner = JobRunner(self.store, self.engine, self.anki, sleep=self.sleeps.append)

    def envio(self, *phrase_ids: int, **extra: Any) -> str:
        return self.store.create(_payload(*phrase_ids, **extra))

    def run_envio(self, job_id: str) -> dict[str, Any]:
        self.store.claim_next()
        self.runner.run(job_id)
        return self.store.read_state(job_id)

    def finish(self, job_id: str, status: str, **fields: Any) -> None:
        self.store.set_stage(job_id, "send_to_anki")
        self.store.update(job_id, status=status, stage=status, **fields)

    def queue_status(self, job_id: str) -> str:
        return next(i["status"] for i in self.store.queue_data()["jobs"] if i["jobId"] == job_id)


# ---------------------------------------------------------------------------
# A fila e o estado
# ---------------------------------------------------------------------------
class JobStoreTests(EnvioTestCase):
    def test_a_new_envio_waits_in_the_queue_with_nothing_done(self) -> None:
        job_id = self.envio(1, 2, deckName="CIMV", imageSource="2")

        state = self.store.read_state(job_id)
        self.assertEqual((state["status"], state["stage"]), ("queued", "queued"))
        self.assertEqual(state["completedStages"], [])
        self.assertEqual(self.store.read_job(job_id)["deckName"], "CIMV")
        self.assertEqual(self.queue_status(job_id), "queued")
        self.assertEqual([item["jobId"] for item in self.store.listing()], [job_id])
        self.assertEqual(self.store.listing()[0]["state"]["status"], "queued")

    def test_the_worker_takes_envios_in_arrival_order_and_marks_them_running(self) -> None:
        first = self.envio(1)
        second = self.envio(2)

        self.assertEqual(self.store.claim_next(), first)
        self.assertEqual(self.queue_status(first), "running")
        self.assertEqual(self.store.claim_next(), second)
        self.assertIsNone(self.store.claim_next())

    def test_status_is_kept_the_same_in_state_and_queue(self) -> None:
        job_id = self.envio(1)

        self.store.set_stage(job_id, "generate_cards")

        self.assertEqual(self.store.read_state(job_id)["status"], "running")
        self.assertEqual(self.queue_status(job_id), "running")

    def test_a_finished_envio_cannot_go_back_to_running_without_being_requeued(self) -> None:
        job_id = self.envio(1)
        self.finish(job_id, "failed")

        with self.assertRaises(envio.InvalidTransition):
            self.store.update(job_id, status="running")
        self.assertEqual(self.store.read_state(job_id)["status"], "failed")

    def test_requeue_keeps_the_stages_and_phrases_already_done(self) -> None:
        job_id = self.envio(1, 2)
        self.store.mark_completed(job_id, "generate_cards")
        self.finish(
            job_id,
            "partial",
            successfulPhraseIds=[1],
            lastError="x",
            ankiError="repair_access_denied",
            repairPayload={"a": 1},
        )

        status = self.store.requeue(job_id)

        state = self.store.read_state(job_id)
        self.assertEqual(status, "queued")
        self.assertEqual((state["status"], state["stage"]), ("queued", "queued"))
        self.assertEqual(state["completedStages"], ["generate_cards"])
        self.assertEqual(state["successfulPhraseIds"], [1])
        self.assertEqual((state["lastError"], state["ankiError"], state["repairPayload"]), (None, None, None))
        self.assertEqual(self.queue_status(job_id), "queued")

    def test_requeue_of_a_running_envio_changes_nothing(self) -> None:
        job_id = self.envio(1)
        self.store.set_stage(job_id, "generate_cards")

        self.assertEqual(self.store.requeue(job_id), "running")
        self.assertEqual(self.store.read_state(job_id)["stage"], "generate_cards")

    def test_requeue_puts_back_an_envio_missing_from_the_queue(self) -> None:
        job_id = self.envio(1)
        self.finish(job_id, "failed")
        self.store.save_queue_data({"jobs": []})

        self.store.requeue(job_id)

        item = self.store.queue_data()["jobs"][0]
        self.assertEqual((item["jobId"], item["status"], item["lang"]), (job_id, "queued", "en"))

    def test_envios_running_when_the_bridge_restarted_go_back_to_the_queue(self) -> None:
        job_id = self.envio(1)
        self.store.claim_next()
        self.store.set_stage(job_id, "generate_audio")

        self.assertEqual(self.store.recover_interrupted(), 1)

        state = self.store.read_state(job_id)
        self.assertEqual((state["status"], state["stage"]), ("queued", "queued"))
        self.assertIn("Bridge reiniciado", state["lastError"])
        self.assertEqual(self.queue_status(job_id), "queued")
        self.assertEqual(self.store.claim_next(), job_id)

    def test_running_envio_with_invalid_utf8_state_is_recovered(self) -> None:
        job_id = self.envio(1)
        self.store.claim_next()
        self.store.set_stage(job_id, "generate_audio")
        self.store.state_file(job_id).write_bytes(b'{"progress": {"label": "\xd0"}}')

        self.assertEqual(self.store.recover_interrupted(), 1)

        self.assertEqual(self.queue_status(job_id), "queued")
        self.assertEqual(self.store.read_state(job_id), {})
        self.assertEqual(self.store.listing()[0]["state"], {})
        self.assertEqual(self.store.claim_next(), job_id)

    def test_corrupt_json_reads_return_their_defaults(self) -> None:
        job_id = self.envio(1)
        for content in (b"", b'{"status":', b'{"progress": {"label": "\xd0"}}'):
            with self.subTest(content=content):
                self.store.job_file(job_id).write_bytes(content)
                self.store.state_file(job_id).write_bytes(content)
                self.store.queue_file.write_bytes(content)

                self.assertEqual(self.store.read_job(job_id), {})
                self.assertEqual(self.store.read_state(job_id), {})
                self.assertEqual(self.store.queue_data(), {"jobs": []})


# ---------------------------------------------------------------------------
# As etapas
# ---------------------------------------------------------------------------
class JobRunnerStageTests(EnvioTestCase):
    def test_a_new_envio_goes_through_every_stage_and_completes(self) -> None:
        job_id = self.envio(1, 2, imageSource="2")

        state = self.run_envio(job_id)

        self.assertEqual(
            self.engine.calls,
            ["prepare", "generate_cards", "extract_prompts", "generate_audio", "generate_images:2", "send", "cleanup"],
        )
        self.assertEqual(
            state["completedStages"],
            ["generate_cards", "extract_prompts", "generate_audio", "generate_images", "wait_anki"],
        )
        self.assertEqual((state["status"], state["stage"]), ("completed", "completed"))
        self.assertEqual(state["successfulPhraseIds"], [1, 2])
        self.assertEqual(state["failedPhraseIds"], [])
        self.assertEqual(state["duplicatePhraseIds"], [])
        self.assertIsNone(state["lastError"])
        self.assertEqual(self.queue_status(job_id), "completed")

    def test_the_image_source_defaults_to_foto_real(self) -> None:
        job_id = self.envio(1)

        self.run_envio(job_id)

        self.assertIn("generate_images:1", self.engine.calls)

    def test_progress_of_audio_and_images_reaches_the_state_while_running(self) -> None:
        seen: list[tuple[str, Any]] = []
        original = self.store.set_stage

        def spy(job_id: str, stage: str, **extra: Any) -> None:
            seen.append((stage, extra.get("progress")))
            original(job_id, stage, **extra)

        self.store.set_stage = spy  # type: ignore[method-assign]
        self.run_envio(self.envio(1))

        self.assertIn(("generate_audio", {"done": 0, "total": 4}), seen)
        self.assertIn(("generate_audio", {"done": 1, "total": 4, "label": "primeiro"}), seen)
        self.assertIn(("generate_images", {"done": 0, "total": 3}), seen)

    def test_retomar_skips_the_stages_whose_products_are_still_there(self) -> None:
        job_id = self.envio(1)
        self.run_envio(job_id)
        self.engine.calls.clear()
        self.store.requeue(job_id)

        state = self.run_envio(job_id)

        # Tudo foi enviado antes: nada de etapa, nada para enviar.
        self.assertEqual(self.engine.calls, ["prepare"])
        self.assertEqual(state["status"], "completed")
        self.assertEqual(state["successfulPhraseIds"], [1])

    def test_retomar_redoes_an_upstream_stage_whose_product_vanished_and_what_depends_on_it(self) -> None:
        job_id = self.envio(1)
        self.run_envio(job_id)
        self.engine.calls.clear()
        self.engine.files.discard("cards")
        self.store.requeue(job_id)

        self.run_envio(job_id)

        self.assertEqual(
            self.engine.calls[:5],
            ["prepare", "generate_cards", "extract_prompts", "generate_audio", "generate_images:1"],
        )

    def test_retomar_redoes_only_the_audio_when_only_the_audio_vanished(self) -> None:
        job_id = self.envio(1)
        self.run_envio(job_id)
        self.engine.calls.clear()
        self.engine.files.discard("audio")
        self.store.requeue(job_id)

        self.run_envio(job_id)

        self.assertEqual(self.engine.calls, ["prepare", "generate_audio"])

    def test_retomar_after_a_stage_failed_does_not_repeat_the_stages_before_it(self) -> None:
        job_id = self.envio(1)
        self.engine.audio_errors = [RuntimeError("cota esgotada")] * 3
        self.store.claim_next()
        with self.assertRaises(RuntimeError):
            self.runner.run(job_id)
        self.assertEqual(
            self.store.read_state(job_id)["completedStages"], ["generate_cards", "extract_prompts"]
        )
        self.engine.calls.clear()
        self.engine.audio_errors.clear()
        self.store.requeue(job_id)

        state = self.run_envio(job_id)

        self.assertEqual(
            self.engine.calls,
            ["prepare", "generate_audio", "generate_images:1", "send", "cleanup"],
        )
        self.assertEqual(state["status"], "completed")

    def test_cards_that_were_not_written_stop_the_envio_with_the_cause(self) -> None:
        job_id = self.envio(1)
        self.engine.make_cards = False

        with self.assertRaisesRegex(RuntimeError, "generate_cards não gerou"):
            self.run_envio(job_id)

        self.assertNotIn("generate_cards", self.store.read_state(job_id)["completedStages"])

    def test_audio_that_was_not_written_stops_the_envio_with_the_cause(self) -> None:
        job_id = self.envio(1)
        self.engine.make_audio = False

        with self.assertRaisesRegex(RuntimeError, "generate_audio não gerou"):
            self.run_envio(job_id)

        self.assertEqual(self.engine.calls.count("generate_audio"), 1)

    def test_a_transient_audio_error_is_tried_again_and_a_permanent_one_is_not(self) -> None:
        job_id = self.envio(1)
        self.engine.audio_errors = [RuntimeError("Failed to connect")]

        state = self.run_envio(job_id)

        self.assertEqual(self.engine.calls.count("generate_audio"), 2)
        self.assertEqual(len(self.sleeps), 1)
        self.assertEqual(state["status"], "completed")

        other = self.envio(2)
        self.engine.files.discard("audio")
        self.engine.audio_errors = [RuntimeError("chave inválida")]
        self.engine.calls.clear()
        with self.assertRaisesRegex(RuntimeError, "chave inválida"):
            self.run_envio(other)
        self.assertEqual(self.engine.calls.count("generate_audio"), 1)

    def test_it_waits_for_the_anki_before_sending(self) -> None:
        job_id = self.envio(1)

        self.run_envio(job_id)

        # uma vez na etapa wait_anki, outra antes de cada tentativa de envio
        self.assertEqual(self.anki.ready_calls, 2)


# ---------------------------------------------------------------------------
# O fim: adicionada / duplicada / falhou
# ---------------------------------------------------------------------------
class JobRunnerOutcomeTests(EnvioTestCase):
    def test_a_phrase_with_every_card_already_in_anki_is_duplicate_not_added(self) -> None:
        job_id = self.envio(1, 2)
        self.engine.send_plan = {"s1a": DUPLICATE, "s1b": DUPLICATE}

        state = self.run_envio(job_id)

        self.assertEqual(state["status"], "completed")
        self.assertEqual(state["successfulPhraseIds"], [1, 2])
        self.assertEqual(state["duplicatePhraseIds"], [1])

    def test_a_phrase_with_one_new_card_is_added_even_if_the_other_existed(self) -> None:
        job_id = self.envio(1)
        self.engine.send_plan = {"s1a": DUPLICATE}

        state = self.run_envio(job_id)

        self.assertEqual(state["successfulPhraseIds"], [1])
        self.assertEqual(state["duplicatePhraseIds"], [])

    def test_a_failed_card_makes_the_envio_partial_and_keeps_the_artifacts(self) -> None:
        job_id = self.envio(1, 2)
        self.engine.send_plan = {"s2b": CARD_FAILED}

        state = self.run_envio(job_id)

        self.assertEqual((state["status"], state["stage"]), ("partial", "partial"))
        self.assertEqual(state["successfulPhraseIds"], [1])
        self.assertEqual(state["failedPhraseIds"], [2])
        self.assertEqual(state["lastError"], "Falha ao enviar um ou mais cards ao Anki")
        self.assertNotIn("cleanup", self.engine.calls)
        self.assertEqual(self.queue_status(job_id), "partial")

    def test_when_nothing_gets_in_the_envio_failed(self) -> None:
        job_id = self.envio(1)
        self.engine.send_plan = {"s1a": CARD_FAILED, "s1b": CARD_FAILED}

        state = self.run_envio(job_id)

        self.assertEqual((state["status"], state["stage"]), ("failed", "failed"))
        self.assertEqual(state["failedPhraseIds"], [1])
        self.assertEqual(state["successfulPhraseIds"], [])

    def test_continuar_envio_sends_only_the_phrases_that_are_missing(self) -> None:
        job_id = self.envio(1, 2, 3)
        self.engine.send_plan = {"s2a": CARD_FAILED, "s3b": CARD_FAILED}
        self.run_envio(job_id)
        self.engine.send_plan = {}
        self.store.requeue(job_id)

        state = self.run_envio(job_id)

        self.assertEqual(self.engine.sent, [["s1", "s2", "s3"], ["s2", "s3"]])
        self.assertEqual((state["status"], state["failedPhraseIds"]), ("completed", []))
        self.assertEqual(state["successfulPhraseIds"], [1, 2, 3])

    def test_duplicates_found_before_survive_a_later_retry(self) -> None:
        job_id = self.envio(1, 2)
        self.engine.send_plan = {"s1a": DUPLICATE, "s1b": DUPLICATE, "s2a": CARD_FAILED}
        self.run_envio(job_id)
        self.engine.send_plan = {}
        self.store.requeue(job_id)

        state = self.run_envio(job_id)

        self.assertEqual(state["successfulPhraseIds"], [1, 2])
        self.assertEqual(state["duplicatePhraseIds"], [1])

    def test_a_phrase_the_engine_did_not_turn_into_cards_counts_as_failed(self) -> None:
        job_id = self.envio(1, 2)
        self.engine.parsed_limit = 1

        state = self.run_envio(job_id)

        self.assertEqual((state["status"], state["successfulPhraseIds"], state["failedPhraseIds"]), ("partial", [1], [2]))

    def test_a_send_that_raises_marks_every_pending_phrase_failed_and_the_envio_failed(self) -> None:
        job_id = self.envio(1, 2)
        self.engine.send_errors = [RuntimeError("deckNames error: boom")]
        self.store.claim_next()

        with self.assertRaises(RuntimeError):
            self.runner.run(job_id)

        self.assertEqual(self.store.read_state(job_id)["failedPhraseIds"], [1, 2])

    def test_a_transient_anki_error_is_tried_again(self) -> None:
        job_id = self.envio(1)
        self.engine.send_errors = [ConnectionError("Connection refused"), RuntimeError("timed out")]

        state = self.run_envio(job_id)

        self.assertEqual(state["status"], "completed")
        self.assertEqual(self.sleeps, [2, 2])
        # wait_anki + uma por tentativa de envio
        self.assertEqual(self.anki.ready_calls, 4)

    def test_a_permanent_anki_error_is_not_tried_again(self) -> None:
        job_id = self.envio(1)
        self.engine.send_errors = [RuntimeError("model not found")]
        self.store.claim_next()

        with self.assertRaisesRegex(RuntimeError, "model not found"):
            self.runner.run(job_id)

        self.assertEqual(self.engine.calls.count("send"), 1)


class SettleTests(unittest.TestCase):
    def classify(self, raw: Any) -> str:
        return raw if raw in (ADDED, DUPLICATE) else CARD_FAILED

    def test_a_stem_missing_from_the_results_counts_as_failed(self) -> None:
        outcome = envio.settle([1], [], [], {1: ["a", "b"]}, {"a": ADDED}, self.classify)

        self.assertEqual((outcome.status, outcome.failed, outcome.successful), ("failed", [1], []))

    def test_requested_phrases_that_never_reached_the_send_are_failed(self) -> None:
        outcome = envio.settle([1, 2], [1], [], {}, {}, self.classify)

        self.assertEqual((outcome.status, outcome.successful, outcome.failed), ("partial", [1], [2]))

    def test_an_envio_with_no_requested_phrases_is_not_completed(self) -> None:
        outcome = envio.settle([], [], [], {}, {}, self.classify)

        self.assertEqual(outcome.status, "failed")


# ---------------------------------------------------------------------------
# O worker
# ---------------------------------------------------------------------------
class JobWorkerTests(EnvioTestCase):
    def setUp(self) -> None:
        super().setUp()
        self.stop = threading.Event()
        self.worker = JobWorker(self.store, self.runner, self.stop, sleep=self.sleeps.append)

    def test_with_nothing_queued_it_says_so(self) -> None:
        self.assertFalse(self.worker.run_next())

    def test_it_runs_the_queued_envio_to_the_end(self) -> None:
        job_id = self.envio(1)

        self.assertTrue(self.worker.run_next())

        self.assertEqual(self.store.read_state(job_id)["status"], "completed")

    def test_an_error_in_a_stage_fails_the_envio_with_the_message(self) -> None:
        job_id = self.envio(1)
        self.engine.make_cards = False

        self.assertTrue(self.worker.run_next())

        state = self.store.read_state(job_id)
        self.assertEqual((state["status"], state["stage"]), ("failed", "failed"))
        self.assertIn("generate_cards não gerou", state["lastError"])
        self.assertEqual(self.queue_status(job_id), "failed")
        self.assertNotIn("ankiError", state)

    def test_an_anki_that_windows_would_not_let_us_close_is_reported_as_such(self) -> None:
        job_id = self.envio(1)
        payload = {"error": "repair_access_denied", "detail": "feche o Anki"}
        self.anki.blocked = AnkiRepairBlockedError(payload)

        self.worker.run_next()

        state = self.store.read_state(job_id)
        self.assertEqual(state["status"], "failed")
        self.assertEqual(state["ankiError"], "repair_access_denied")
        self.assertEqual(state["repairPayload"], payload)
        self.assertEqual(state["lastError"], "feche o Anki")

    def test_a_failed_envio_can_be_continued_and_the_worker_takes_it_again(self) -> None:
        job_id = self.envio(1)
        self.engine.make_cards = False
        self.worker.run_next()
        self.engine.make_cards = True
        self.store.requeue(job_id)

        self.worker.run_next()

        self.assertEqual(self.store.read_state(job_id)["status"], "completed")

    def test_a_delayed_second_retry_leaves_the_envio_running_and_preserves_send_outcomes(self) -> None:
        job_id = self.envio(1, 2)
        self.engine.send_plan = {"s2b": CARD_FAILED}
        self.worker.run_next()
        self.assertEqual(self.store.read_state(job_id)["status"], "partial")
        self.engine.send_plan.clear()
        retry_waiting = threading.Event()
        resume_retry = threading.Event()
        retry_results: list[str] = []
        retry_errors: list[Exception] = []
        snapshots: list[tuple[dict[str, Any], dict[str, Any]]] = []
        real_lock = self.store.lock

        class DelayedRetryLock:
            def __enter__(self) -> None:
                if threading.current_thread() is retry_thread:
                    retry_waiting.set()
                    if not resume_retry.wait(5):
                        raise TimeoutError("Retry was not resumed")
                real_lock.acquire()

            def __exit__(self, *args: Any) -> None:
                real_lock.release()

        def retry_envio() -> None:
            try:
                retry_results.append(self.store.requeue(job_id))
            except Exception as exc:
                retry_errors.append(exc)

        retry_thread = threading.Thread(target=retry_envio)
        original_send = self.engine.send

        def send_while_retry_is_waiting(entries: list[str], config: Any) -> dict[str, Any]:
            snapshots.append((self.store.read_state(job_id), self.store.queue_data()))
            resume_retry.set()
            retry_thread.join(5)
            snapshots.append((self.store.read_state(job_id), self.store.queue_data()))
            return original_send(entries, config)

        with mock.patch.object(self.store, "lock", DelayedRetryLock()):
            retry_thread.start()
            try:
                self.assertTrue(retry_waiting.wait(5))
                self.assertEqual(self.store.requeue(job_id), "queued")
                with mock.patch.object(self.engine, "send", side_effect=send_while_retry_is_waiting):
                    self.assertTrue(self.worker.run_next())
            finally:
                resume_retry.set()
                retry_thread.join(5)

        self.assertFalse(retry_thread.is_alive())
        self.assertEqual(retry_errors, [])
        self.assertEqual(retry_results, ["running"])
        self.assertEqual(len(snapshots), 2)
        self.assertEqual((snapshots[0][0]["status"], snapshots[0][0]["stage"]), ("running", "send_to_anki"))
        self.assertEqual(snapshots[1], snapshots[0])
        state = self.store.read_state(job_id)
        self.assertEqual((state["status"], state["stage"]), ("completed", "completed"))
        self.assertEqual(state["successfulPhraseIds"], [1, 2])
        self.assertEqual(state["failedPhraseIds"], [])
        self.assertIsNone(state["lastError"])
        self.assertEqual(self.queue_status(job_id), "completed")
        self.assertEqual(self.engine.sent, [["s1", "s2"], ["s2"]])
        self.assertFalse(self.worker.run_next())

    def test_the_loop_idles_when_empty_runs_what_arrives_and_stops_on_the_event(self) -> None:
        job_id = self.envio(1)
        naps: list[float] = []

        def nap(seconds: float) -> None:
            naps.append(seconds)
            if len(naps) >= 2:
                self.stop.set()

        loop = JobWorker(self.store, self.runner, self.stop, sleep=nap)
        loop.loop()

        self.assertEqual(self.store.read_state(job_id)["status"], "completed")
        self.assertEqual(naps, [0.2, 1])

    def test_the_loop_survives_an_unexpected_error(self) -> None:
        naps: list[float] = []

        def nap(seconds: float) -> None:
            naps.append(seconds)
            self.stop.set()

        worker = JobWorker(self.store, self.runner, self.stop, sleep=nap)
        worker.run_next = lambda: (_ for _ in ()).throw(OSError("disco cheio"))  # type: ignore[method-assign]

        worker.loop()

        self.assertEqual(naps, [2])


class FilesOnDiskTests(EnvioTestCase):
    def test_state_and_queue_files_keep_the_shape_the_panel_and_analytics_read(self) -> None:
        job_id = self.envio(1)
        self.run_envio(job_id)

        state = json.loads(self.store.state_file(job_id).read_text(encoding="utf-8"))
        queue = json.loads(self.store.queue_file.read_text(encoding="utf-8"))

        self.assertTrue({"jobId", "status", "stage", "completedStages", "successfulPhraseIds",
                         "failedPhraseIds", "duplicatePhraseIds", "lastError", "updatedAt"} <= set(state))
        self.assertEqual(set(queue["jobs"][0]), {"jobId", "lang", "status", "createdAt", "updatedAt"})


if __name__ == "__main__":
    unittest.main()

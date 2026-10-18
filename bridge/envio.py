"""O Envio ao Anki como maquina de estados.

Um Envio (job) guarda o pedido em ``jobs_root/<id>/job.json`` e o estado em
``jobs_root/<id>/state.json``. ``queue.json`` preserva a ordem de chegada e
espelha o status para o worker achar o proximo. ``JobStore`` e o unico escritor
desses arquivos. ``JobRunner`` percorre as etapas e ``JobWorker`` drena a fila;
``server.py`` monta os adapters e expoe o Envio pela API ``/jobs``.

As transicoes de status ficam em ``TRANSITIONS`` e sua validacao em
``JobStore._check_transition`` (``InvalidTransition`` para mudancas proibidas
a partir de um status conhecido). ``JobStore.recover_interrupted`` refileira
Envios interrompidos quando o bridge inicia.

A ordem e as regras de retomada ficam em ``STAGES`` e ``Stage``, incluindo as
dependencias entre etapas e quais produtos sao verificados no disco.
``_pending_send_pairs`` decide o que ainda precisa ser enviado; ``settle``
define os resultados por frase.

Os adapters entram por injecao e sao trocaveis no teste:

  - ``store``: ``JobStore`` (fila e estado);
  - ``engine``: protocolo ``Engine``, implementado por ``AutomaticAnkiEngine``;
  - ``anki``: ``AnkiSession`` (``ensure_ready``).
"""
from __future__ import annotations

import copy
import hashlib
import io
import contextlib
import json
import logging
import random
import shutil
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Protocol

from anki_session import AnkiRepairBlockedError

LOGGER = logging.getLogger("anki_bridge")

QUEUED = "queued"
RUNNING = "running"
COMPLETED = "completed"
PARTIAL = "partial"
FAILED = "failed"

# Quem pode ir para onde. Ficar onde esta (ex.: running -> running a cada etapa)
# sempre vale.
TRANSITIONS: dict[str, frozenset[str]] = {
    QUEUED: frozenset({RUNNING, FAILED}),
    RUNNING: frozenset({QUEUED, COMPLETED, PARTIAL, FAILED}),
    COMPLETED: frozenset({QUEUED}),
    PARTIAL: frozenset({QUEUED}),
    FAILED: frozenset({QUEUED}),
}

ADDED = "added"
DUPLICATE = "duplicate"
CARD_FAILED = "failed"

SEND_FAILED_MESSAGE = "Falha ao enviar um ou mais cards ao Anki"


class InvalidTransition(ValueError):
    """O Envio nao pode ir do status atual para o pedido."""


def body_fingerprint(payload: dict[str, Any]) -> str:
    """O SHA-256 do corpo do ``POST /jobs`` normalizado como ``create`` o grava (idioma, Baralho, imagens, sotaque e Frases)."""
    body = {
        "lang": payload.get("lang"),
        "deckName": payload.get("deckName", "teste"),
        "imageSource": payload.get("imageSource", "1"),
        "tts": payload.get("tts", {}),
        "entries": payload.get("entries"),
    }
    return hashlib.sha256(json.dumps(body, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()


def now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def read_json(path: Path, default: Any) -> Any:
    try:
        if not path.exists():
            return copy.deepcopy(default)
        text = path.read_text(encoding="utf-8").strip()
        if not text:
            LOGGER.warning("read_json: arquivo vazio (corrompido?), usando default: %s", path)
            return copy.deepcopy(default)
        return json.loads(text)
    except (json.JSONDecodeError, UnicodeDecodeError, OSError) as exc:
        LOGGER.warning("read_json: falha ao ler %s (%s), usando default", path, exc)
        return copy.deepcopy(default)


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def unique_phrase_ids(values: list[Any]) -> list[int]:
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


def job_phrase_ids(entries: list[dict[str, Any]]) -> list[int]:
    return unique_phrase_ids([entry.get("phraseId") for entry in entries if isinstance(entry, dict)])


def is_transient_audio_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return "failed to connect" in msg or "connection" in msg or "timed out" in msg


def is_transient_anki_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return (
        "collection is not available" in msg
        or "failed to establish a new connection" in msg
        or "connection refused" in msg
        or "connection aborted" in msg
        or "remote end closed connection" in msg
        or "timed out" in msg
    )


class JobStore:
    def __init__(self, jobs_root: Path, queue_file: Path) -> None:
        self.jobs_root = jobs_root
        self.queue_file = queue_file
        self.lock = threading.Lock()

    def job_dir(self, job_id: str) -> Path:
        return self.jobs_root / job_id

    def job_file(self, job_id: str) -> Path:
        return self.job_dir(job_id) / "job.json"

    def state_file(self, job_id: str) -> Path:
        return self.job_dir(job_id) / "state.json"

    def exists(self, job_id: str) -> bool:
        return self.job_file(job_id).exists()

    def queue_data(self) -> dict[str, Any]:
        return read_json(self.queue_file, {"jobs": []})

    def save_queue_data(self, data: dict[str, Any]) -> None:
        write_json(self.queue_file, data)

    def read_job(self, job_id: str) -> dict[str, Any]:
        return read_json(self.job_file(job_id), {})

    def read_state(self, job_id: str) -> dict[str, Any]:
        return read_json(self.state_file(job_id), {})

    def listing(self) -> list[dict[str, Any]]:
        return [
            {**item, "state": self.read_state(item["jobId"])}
            for item in self.queue_data()["jobs"]
        ]

    def ensure_runtime(self) -> None:
        self.jobs_root.mkdir(parents=True, exist_ok=True)
        if not self.queue_file.exists():
            write_json(self.queue_file, {"jobs": []})

    def create(self, payload: dict[str, Any]) -> str:
        """Entra um Envio novo na fila (``queued``) e devolve o id."""
        job_id = payload.get("jobId") or f"{datetime.now().strftime('%Y%m%d-%H%M%S')}-{payload['lang']}-{uuid.uuid4().hex[:6]}"
        created_at = now_iso()
        self.job_dir(job_id).mkdir(parents=True, exist_ok=True)
        job_payload = {
            "jobId": job_id,
            "createdAt": created_at,
            "lang": payload["lang"],
            "deckName": payload.get("deckName", "teste"),
            "imageSource": payload.get("imageSource", "1"),
            "tts": payload.get("tts", {}),
            "entries": payload["entries"],
            "status": QUEUED,
            "corpoSha256": body_fingerprint(payload),
        }
        state = {
            "jobId": job_id,
            "status": QUEUED,
            "stage": "queued",
            "completedStages": [],
            "successfulPhraseIds": [],
            "failedPhraseIds": [],
            "lastError": None,
            "updatedAt": created_at,
        }
        with self.lock:
            write_json(self.job_file(job_id), job_payload)
            write_json(self.state_file(job_id), state)
            queue = self.queue_data()
            queue["jobs"].append({
                "jobId": job_id,
                "lang": job_payload["lang"],
                "status": QUEUED,
                "createdAt": created_at,
                "updatedAt": created_at,
            })
            self.save_queue_data(queue)
        return job_id

    def same_request(self, job_id: str, payload: dict[str, Any]) -> bool:
        """O corpo é o que criou este Envio? Compara a impressão gravada no criar (``corpoSha256``), nunca o pedido
        guardado, que o Apagar tudo reescreve (sem as linhas das Frases): o mesmo corpo depois dele não é ``409``."""
        return self.read_job(job_id).get("corpoSha256") == body_fingerprint(payload)

    def wipe_phrases(self) -> None:
        """O Apagar tudo (CFG-17): de todo Envio somem as linhas das Frases e os arquivos de trabalho (o texto minerado,
        os cartões e o áudio gerados); um Envio na fila ou rodando vai a ``failed`` com ``wiped``. Ficam o estado, os
        ``phraseId`` e os custos. Repetido, nao grava nada."""
        with self.lock:
            if not self.jobs_root.is_dir():
                return
            for folder in sorted(path for path in self.jobs_root.iterdir() if path.is_dir()):
                job_id = folder.name
                job = self.read_job(job_id)
                if not job:
                    continue
                if not job.get("wiped") or any("line" in entry for entry in job.get("entries", [])):
                    for entry in job.get("entries", []):
                        entry.pop("line", None)
                    job["wiped"] = True
                    write_json(self.job_file(job_id), job)
                (folder / "mining.txt").unlink(missing_ok=True)
                shutil.rmtree(folder / "Output", ignore_errors=True)
                state = self.read_state(job_id)
                if state and not state.get("wiped"):
                    if state.get("status") in (QUEUED, RUNNING):
                        state.update(status=FAILED, stage="failed", lastError="frases_apagadas")
                        queue = self.queue_data()
                        for item in queue["jobs"]:
                            if item.get("jobId") == job_id:
                                item["status"] = FAILED
                        self.save_queue_data(queue)
                    state["wiped"] = True
                    state["updatedAt"] = now_iso()
                    write_json(self.state_file(job_id), state)

    def requeue(self, job_id: str) -> str:
        """Continuar envio: preserva as etapas concluidas e as frases ja enviadas.

        A verificacao de RUNNING compartilha o lock com a escrita, para que um
        retry atrasado nao troque running por queued durante uma etapa.
        """
        with self.lock:
            state = self.read_state(job_id)
            if state.get("status") == RUNNING:
                return state["status"]
            if state.get("wiped") or self.read_job(job_id).get("wiped"):
                return state.get("status", FAILED)  # as Frases foram apagadas: nao ha o que refazer
            self._check_transition(state, QUEUED)
            state.update({"status": QUEUED, "stage": "queued", "lastError": None, "ankiError": None, "repairPayload": None})
            state["updatedAt"] = now_iso()
            write_json(self.state_file(job_id), state)
            job_payload = self.read_job(job_id)
            queue = self.queue_data()
            queue_item = next((item for item in queue["jobs"] if item.get("jobId") == job_id), None)
            if queue_item:
                queue_item["status"] = QUEUED
                queue_item["updatedAt"] = state["updatedAt"]
            else:
                queue["jobs"].append({
                    "jobId": job_id,
                    "lang": job_payload.get("lang", "unknown"),
                    "status": QUEUED,
                    "createdAt": job_payload.get("createdAt") or state["updatedAt"],
                    "updatedAt": state["updatedAt"],
                })
            self.save_queue_data(queue)
        return state["status"]

    def claim_next(self) -> str | None:
        """Reserva o proximo Envio marcando primeiro apenas a fila como rodando.

        O estado muda ao entrar numa etapa; falhas antes dela sao registradas
        pelo worker. Essa janela entre os dois arquivos preserva o contrato.
        """
        with self.lock:
            queue = self.queue_data()
            for item in queue["jobs"]:
                if item.get("status") == QUEUED:
                    item["status"] = RUNNING
                    item["updatedAt"] = now_iso()
                    self.save_queue_data(queue)
                    return item["jobId"]
        return None

    def recover_interrupted(self) -> int:
        """Bridge reiniciou com Envios rodando: voltam para a fila para retomar."""
        queue = self.queue_data()
        recovered = 0
        for item in queue.get("jobs", []):
            if item.get("status") != RUNNING:
                continue
            job_id = item.get("jobId")
            if not job_id:
                continue
            item["status"] = QUEUED
            item["updatedAt"] = now_iso()
            state = self.read_state(job_id)
            if state:
                state["status"] = QUEUED
                state["stage"] = "queued"
                state["lastError"] = "Bridge reiniciado durante o processamento; job refileirado para retomar."
                state["updatedAt"] = item["updatedAt"]
                write_json(self.state_file(job_id), state)
            recovered += 1
        if recovered:
            self.save_queue_data(queue)
            LOGGER.warning("Recovered %s interrupted running job(s) back to queued", recovered)
        return recovered

    def update(self, job_id: str, **fields: Any) -> dict[str, Any]:
        """Grava campos no estado do Envio e espelha o status na fila.

        Um status atual conhecido segue ``TRANSITIONS`` ou permanece igual;
        mudancas proibidas levantam ``InvalidTransition``. Estados antigos
        sem status conhecido sao tolerados.
        """
        with self.lock:
            state = self.read_state(job_id)
            if "status" in fields:
                self._check_transition(state, fields["status"])
            state.update(fields)
            state["updatedAt"] = now_iso()
            write_json(self.state_file(job_id), state)
            data = self.queue_data()
            for item in data["jobs"]:
                if item["jobId"] == job_id:
                    item["status"] = state.get("status", item.get("status", QUEUED))
                    item["updatedAt"] = state["updatedAt"]
                    break
            self.save_queue_data(data)
            return state

    def set_stage(self, job_id: str, stage: str, **extra: Any) -> None:
        self.update(job_id, stage=stage, status=RUNNING, **extra)

    def mark_completed(self, job_id: str, stage: str) -> None:
        completed = self.read_state(job_id).get("completedStages", [])
        if stage not in completed:
            completed.append(stage)
        self.update(job_id, completedStages=completed)

    @staticmethod
    def _check_transition(state: dict[str, Any], to: str) -> None:
        current = state.get("status")
        if current is None or current not in TRANSITIONS or current == to:
            return
        if to not in TRANSITIONS[current]:
            raise InvalidTransition(f"Envio nao pode ir de {current} para {to}")


class Engine(Protocol):
    """A seam do motor. ``config`` e ``entries`` sao os que ``prepare`` devolve;
    o Envio so os repassa."""

    def prepare(self, job: dict[str, Any], workspace: Path) -> tuple[Any, list[Any]]: ...
    def card_texts_ready(self, config: Any, entries: list[Any]) -> bool: ...
    def prompts_ready(self, config: Any) -> bool: ...
    def audio_ready(self, config: Any, entries: list[Any]) -> bool: ...
    def generate_cards(self, entries: list[Any], config: Any) -> None: ...
    def extract_prompts(self, entries: list[Any], config: Any) -> None: ...
    def audio_total(self, entries: list[Any]) -> int: ...
    def generate_audio(self, entries: list[Any], config: Any, progress_callback: Callable[[int, int, str], None]) -> None: ...
    def prompt_lines(self, config: Any) -> list[str]: ...
    def generate_images(self, config: Any, prompt_lines: list[str], image_source: str) -> None: ...
    def stems_of(self, entry: Any) -> list[str]: ...
    def send(self, entries: list[Any], config: Any) -> dict[str, Any]: ...
    def classify(self, raw_status: Any) -> str: ...
    def cleanup(self, config: Any, results: dict[str, Any]) -> None: ...


class AutomaticAnkiEngine:
    """Adapter de producao: os modulos do Automatic Anki (``engine/``).

    ``modules`` e o dicionario que o ``BridgeApp`` preenche em ``start()``; ele e
    lido so quando o Envio roda."""

    def __init__(self, modules: dict[str, Any], automatic_anki_path: Path) -> None:
        self.modules = modules
        self.automatic_anki_path = automatic_anki_path

    def prepare(self, job: dict[str, Any], workspace: Path) -> tuple[dict[str, Any], list[Any]]:
        lines = [entry["line"].rstrip() for entry in job["entries"] if entry.get("line")]
        (workspace / "mining.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
        config = self._build_job_config(job, workspace)
        parser = self.modules["parser"]
        mining_path = Path(config["paths"]["mining_file"])
        if config.get("lang") == "ru":
            return config, parser.parse_mining_file_ru(mining_path)
        return config, parser.parse_mining_file(mining_path)

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

    def stems_of(self, entry: Any) -> list[str]:
        return [card_job.filename_stem for card_job in self.modules["parser"].get_card_jobs(entry)]

    @staticmethod
    def _files_ready(paths: list[Path]) -> bool:
        return bool(paths) and all(path.exists() and path.stat().st_size > 0 for path in paths)

    def _expected_stems(self, entries: list[Any]) -> list[str]:
        return [stem for entry in entries for stem in self.stems_of(entry)]

    def card_texts_ready(self, config: dict[str, Any], entries: list[Any]) -> bool:
        output_dir = Path(config["paths"]["output_dir"])
        return self._files_ready([output_dir / f"{stem}.txt" for stem in self._expected_stems(entries)])

    def audio_ready(self, config: dict[str, Any], entries: list[Any]) -> bool:
        output_dir = Path(config["paths"]["output_dir"])
        paths: list[Path] = []
        for stem in self._expected_stems(entries):
            paths.append(output_dir / f"{stem}_word.mp3")
            paths.append(output_dir / f"{stem}_phrase.mp3")
        return self._files_ready(paths)

    def prompts_ready(self, config: dict[str, Any]) -> bool:
        return Path(config["paths"]["prompts_file"]).exists()

    def generate_cards(self, entries: list[Any], config: dict[str, Any]) -> None:
        self.modules["generate_cards"].run(entries, config)

    def extract_prompts(self, entries: list[Any], config: dict[str, Any]) -> None:
        self.modules["extract_prompts"].run(entries, config)

    def audio_total(self, entries: list[Any]) -> int:
        return len(self._expected_stems(entries)) * 2

    def generate_audio(self, entries: list[Any], config: dict[str, Any], progress_callback: Callable[[int, int, str], None]) -> None:
        self.modules["generate_audio"].run(entries, config, progress_callback=progress_callback)

    def prompt_lines(self, config: dict[str, Any]) -> list[str]:
        prompts_file = Path(config["paths"]["prompts_file"])
        if not prompts_file.exists():
            return []
        return [line.strip() for line in prompts_file.read_text(encoding="utf-8").splitlines() if line.strip()]

    def generate_images(self, config: dict[str, Any], prompt_lines: list[str], image_source: str) -> None:
        self.modules["start"]._run_images(  # noqa: SLF001
            config,
            prompt_lines,
            Path(config["paths"]["output_dir"]),
            image_source,
            config["openai_api_key"],
            config["paths"]["log_dir"],
        )

    def send(self, entries: list[Any], config: dict[str, Any]) -> dict[str, Any]:
        return self.modules["send_to_anki"].run(entries, config)

    def classify(self, raw_status: Any) -> str:
        send_mod = self.modules["send_to_anki"]
        if not send_mod.is_present(raw_status):
            return CARD_FAILED
        return DUPLICATE if raw_status == send_mod.DUPLICATE else ADDED

    def cleanup(self, config: dict[str, Any], results: dict[str, Any]) -> None:
        self.modules["send_to_anki"].cleanup_output(Path(config["paths"]["output_dir"]), results)


@dataclass(frozen=True)
class Outcome:
    status: str
    successful: list[int]
    failed: list[int]
    duplicate: list[int]
    last_error: str | None


def settle(
    requested: list[int],
    previously_successful: list[int],
    previously_duplicate: list[int],
    phrase_stems: dict[int, list[str]],
    results: dict[str, Any],
    classify: Callable[[Any], str],
) -> Outcome:
    """Decide como o Envio termina.

    Uma frase esta no Anki quando todos os cartoes dela foram ``added`` ou
    ``duplicate``; e ``duplicate`` (e nao ``added``) quando todos ja existiam.
    ``phrase_stems`` so traz as frases que foram enviadas agora; as de uma
    tentativa anterior entram por ``previously_successful``. Frase pedida que nao
    ficou no Anki conta como falha, mesmo sem nada a enviar."""
    def outcomes(stems: list[str]) -> list[str]:
        return [classify(results.get(stem)) for stem in stems]

    def in_anki(stems: list[str]) -> bool:
        return bool(stems) and all(o != CARD_FAILED for o in outcomes(stems))

    new_successful = [pid for pid, stems in phrase_stems.items() if in_anki(stems)]
    new_duplicate = [pid for pid in new_successful if all(o == DUPLICATE for o in outcomes(phrase_stems[pid]))]
    successful = unique_phrase_ids([*previously_successful, *new_successful])
    failed = unique_phrase_ids([pid for pid, stems in phrase_stems.items() if not in_anki(stems)])
    duplicate = unique_phrase_ids([*previously_duplicate, *new_duplicate])

    successful_set = set(successful)
    failed_set = set(failed)
    never_sent = [pid for pid in requested if pid not in successful_set and pid not in failed_set]
    failed = unique_phrase_ids([*failed, *never_sent])

    completed = bool(requested) and successful_set >= set(requested) and not failed
    status = COMPLETED if completed else (PARTIAL if successful else FAILED)
    return Outcome(status, successful, failed, duplicate, None if completed else SEND_FAILED_MESSAGE)


@dataclass
class _Run:
    job_id: str
    job: dict[str, Any]
    config: Any
    entries: list[Any]
    completed: set[str]
    ran: set[str] = field(default_factory=set)


@dataclass(frozen=True)
class Stage:
    name: str
    # Etapas anteriores que, se rodaram agora, obrigam esta a rodar de novo.
    after: tuple[str, ...]
    # O produto desta etapa ainda esta no disco? None: so ``completedStages`` vale.
    ready: Callable[[Engine, Any, list[Any]], bool] | None


# Ordem e regra de retomada: uma etapa roda quando nao esta em ``completedStages``,
# quando seu produto sumiu do disco ou quando uma etapa de que ela depende rodou.
STAGES: tuple[Stage, ...] = (
    Stage("generate_cards", (), lambda engine, config, entries: engine.card_texts_ready(config, entries)),
    Stage("extract_prompts", ("generate_cards",), lambda engine, config, entries: engine.prompts_ready(config)),
    Stage("generate_audio", ("generate_cards",), lambda engine, config, entries: engine.audio_ready(config, entries)),
    Stage("generate_images", ("extract_prompts",), None),
    Stage("wait_anki", (), None),
)


class JobRunner:
    def __init__(
        self,
        store: JobStore,
        engine: Engine,
        anki: Any,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self.store = store
        self.engine = engine
        self.anki = anki
        self.sleep = sleep

    def run(self, job_id: str) -> None:
        job = self.store.read_job(job_id)
        config, entries = self.engine.prepare(job, self.store.job_dir(job_id))
        state = self.store.read_state(job_id)
        run = _Run(job_id, job, config, entries, set(state.get("completedStages", [])))

        for stage in STAGES:
            if self._must_run(stage, run):
                getattr(self, f"_{stage.name}")(run)
                run.ran.add(stage.name)
        self._send_to_anki(run, state)

    def _must_run(self, stage: Stage, run: _Run) -> bool:
        if stage.name not in run.completed or any(name in run.ran for name in stage.after):
            return True
        return stage.ready is not None and not stage.ready(self.engine, run.config, run.entries)

    def _generate_cards(self, run: _Run) -> None:
        self.store.set_stage(run.job_id, "generate_cards")
        self.engine.generate_cards(run.entries, run.config)
        if not self.engine.card_texts_ready(run.config, run.entries):
            raise RuntimeError(
                "generate_cards não gerou os arquivos .txt esperados. "
                "Causa mais comum: erro da API OpenAI (429/cota esgotada ou chave inválida). "
                "Verifique os créditos em platform.openai.com e o bridge.log para o erro exato."
            )
        self.store.mark_completed(run.job_id, "generate_cards")

    def _extract_prompts(self, run: _Run) -> None:
        self.store.set_stage(run.job_id, "extract_prompts")
        self.engine.extract_prompts(run.entries, run.config)
        self.store.mark_completed(run.job_id, "extract_prompts")

    def _generate_audio(self, run: _Run) -> None:
        total_jobs = self.engine.audio_total(run.entries)

        def audio_progress(done: int, total: int, label: str) -> None:
            self.store.set_stage(run.job_id, "generate_audio", progress={"done": done, "total": total or total_jobs, "label": label})

        self.store.set_stage(run.job_id, "generate_audio", progress={"done": 0, "total": total_jobs})
        self._with_retry(
            self.engine.generate_audio,
            run.entries,
            run.config,
            progress_callback=audio_progress,
            retry_if=is_transient_audio_error,
        )
        if not self.engine.audio_ready(run.config, run.entries):
            raise RuntimeError(
                "generate_audio não gerou os arquivos .mp3 esperados. "
                "Causa comum: erro da API de áudio (cota/limite ou chave inválida). "
                "Verifique o bridge.log para o erro exato."
            )
        self.store.mark_completed(run.job_id, "generate_audio")

    def _generate_images(self, run: _Run) -> None:
        lines = self.engine.prompt_lines(run.config)
        self.store.set_stage(run.job_id, "generate_images", progress={"done": 0, "total": len(lines)})
        self.engine.generate_images(run.config, lines, run.job.get("imageSource", "1"))
        self.store.mark_completed(run.job_id, "generate_images")

    def _wait_anki(self, run: _Run) -> None:
        self.store.set_stage(run.job_id, "wait_anki")
        self.anki.ensure_ready()
        self.store.mark_completed(run.job_id, "wait_anki")

    def _send_to_anki(self, run: _Run, state: dict[str, Any]) -> None:
        job_id = run.job_id
        previously_successful = unique_phrase_ids(state.get("successfulPhraseIds") or [])
        pending = _pending_send_pairs(run.job["entries"], run.entries, previously_successful)
        send_entries = [parsed_entry for _, parsed_entry in pending]

        self.store.set_stage(job_id, "send_to_anki")
        phrase_stems: dict[int, list[str]] = {}
        for src_entry, parsed_entry in pending:
            phrase_stems.setdefault(int(src_entry["phraseId"]), []).extend(self.engine.stems_of(parsed_entry))

        try:
            results = self._send_with_ready_retry(job_id, send_entries, run.config) if send_entries else {}
        except Exception:
            failed = unique_phrase_ids([*state.get("failedPhraseIds", []), *phrase_stems.keys()])
            self.store.update(job_id, failedPhraseIds=failed)
            raise

        outcome = settle(
            job_phrase_ids(run.job.get("entries") or []),
            previously_successful,
            state.get("duplicatePhraseIds", []),
            phrase_stems,
            results,
            self.engine.classify,
        )
        if results and all(self.engine.classify(raw) != CARD_FAILED for raw in results.values()):
            self.engine.cleanup(run.config, results)
        self.store.update(
            job_id,
            status=outcome.status,
            stage=outcome.status,
            successfulPhraseIds=outcome.successful,
            failedPhraseIds=outcome.failed,
            duplicatePhraseIds=outcome.duplicate,
            lastError=outcome.last_error,
        )

    def _with_retry(
        self,
        fn: Callable[..., Any],
        *args: Any,
        attempts: int = 3,
        retry_if: Callable[[Exception], bool] | None = None,
        **kwargs: Any,
    ) -> Any:
        for attempt in range(1, attempts + 1):
            try:
                return fn(*args, **kwargs)
            except Exception as exc:  # noqa: BLE001
                if not (retry_if and retry_if(exc)) or attempt >= attempts:
                    raise
                self.sleep(1.5 + random.random())

    def _send_with_ready_retry(self, job_id: str, entries: list[Any], config: Any) -> dict[str, Any]:
        for attempt in range(1, 4):
            self.anki.ensure_ready()
            try:
                buf = io.StringIO()
                with contextlib.redirect_stdout(buf):
                    result = self.engine.send(entries, config)
                output = buf.getvalue().strip()
                if output:
                    LOGGER.info("send_to_anki stdout (job %s attempt %s):\n%s", job_id, attempt, output)
                failed_stems = [stem for stem, raw in result.items() if self.engine.classify(raw) == CARD_FAILED]
                dup_stems = [stem for stem, raw in result.items() if self.engine.classify(raw) == DUPLICATE]
                if failed_stems:
                    LOGGER.warning("send_to_anki: %d/%d notes failed for job %s: %s", len(failed_stems), len(result), job_id, failed_stems)
                if dup_stems:
                    LOGGER.info("send_to_anki: %d/%d notes already existed (duplicates) for job %s: %s", len(dup_stems), len(result), job_id, dup_stems)
                return result
            except Exception as exc:  # noqa: BLE001
                if attempt >= 3 or not is_transient_anki_error(exc):
                    raise
                LOGGER.warning("Transient Anki send failure for job %s on attempt %s/3: %s", job_id, attempt, exc)
                self.sleep(2)
        return {}


def _pending_send_pairs(
    original_entries: list[dict[str, Any]],
    parsed_entries: list[Any],
    successful_phrase_ids: list[Any],
) -> list[tuple[dict[str, Any], Any]]:
    """As frases que ainda faltam enviar: as que nao entraram em ``successfulPhraseIds``."""
    successful = set(unique_phrase_ids(successful_phrase_ids))
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


class JobWorker:
    def __init__(
        self,
        store: JobStore,
        runner: JobRunner,
        stop_event: threading.Event,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self.store = store
        self.runner = runner
        self.stop_event = stop_event
        self.sleep = sleep

    def run_next(self) -> bool:
        """Roda o proximo Envio da fila. ``False`` quando nao ha nenhum."""
        job_id = self.store.claim_next()
        if not job_id:
            return False
        try:
            self.runner.run(job_id)
        except AnkiRepairBlockedError as exc:
            LOGGER.exception("Job %s blocked by Anki repair access denied", job_id)
            self._record_failure(
                job_id,
                "falha ao salvar estado de erro (AnkiRepairBlocked)",
                lastError=str(exc),
                ankiError="repair_access_denied",
                repairPayload=exc.payload,
            )
        except Exception as exc:  # noqa: BLE001
            LOGGER.exception("Job %s failed", job_id)
            self._record_failure(job_id, "falha ao salvar estado de erro", lastError=str(exc))
        return True

    def _record_failure(self, job_id: str, log_message: str, **fields: Any) -> None:
        try:
            self.store.update(job_id, status=FAILED, stage=FAILED, **fields)
        except Exception:  # noqa: BLE001
            LOGGER.exception("Job %s: %s", job_id, log_message)

    def loop(self) -> None:
        while not self.stop_event.is_set():
            try:
                if not self.run_next():
                    self.sleep(1)
                    continue
                self.sleep(0.2)
            except Exception:  # noqa: BLE001
                LOGGER.exception("_worker_loop: erro inesperado no loop principal; continuando após 2s")
                self.sleep(2)

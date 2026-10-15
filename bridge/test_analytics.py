"""Testes de comportamento do modulo analytics (candidato C do refactor).

Monta um jobs_root falso em tmpdir (job.json / state.json / log/costs.jsonl +
queue.json) e exercita JobAnalytics: summary totals, filtros de data from/to,
buckets de custo e imagem, classify_image_source e as linhas de jobs().

Alem dos asserts de comportamento, ha um teste DIFERENCIAL contra o server.py
antigo (backup .bak desta sessao): para muitos inputs, exige que os metodos
antigos (_analytics_summary/_analytics_jobs/_summarize_records) e o novo
JobAnalytics produzam saida identica (0 divergencias).
"""

from __future__ import annotations

import importlib.util
import json
import os
import shutil
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

BRIDGE_DIR = Path(__file__).resolve().parent
if str(BRIDGE_DIR) not in sys.path:
    sys.path.insert(0, str(BRIDGE_DIR))

import analytics as an  # noqa: E402  (apos ajustar sys.path)


def _write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def build_jobs_root(base: Path, jobs: dict, queue: list) -> tuple[Path, Path]:
    """Monta jobs_root/<id>/{job.json,state.json,log/costs.jsonl} e queue.json."""
    jobs_root = base / "jobs"
    jobs_root.mkdir(parents=True, exist_ok=True)
    for job_id, spec in jobs.items():
        job_dir = jobs_root / job_id
        (job_dir / "log").mkdir(parents=True, exist_ok=True)
        _write_json(job_dir / "job.json", spec.get("job", {}))
        _write_json(job_dir / "state.json", spec.get("state", {}))
        costs = spec.get("costs", [])
        (job_dir / "log" / "costs.jsonl").write_text(
            "\n".join(json.dumps(r, ensure_ascii=False) for r in costs),
            encoding="utf-8",
        )
    queue_file = base / "queue.json"
    _write_json(queue_file, {"jobs": queue})
    return jobs_root, queue_file


# Contagem de phraseId (identica ao BridgeApp; usada como seam injetado).
def _unique_phrase_ids(values) -> list[int]:
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


def _job_phrase_ids(entries) -> list[int]:
    return _unique_phrase_ids([e.get("phraseId") for e in entries if isinstance(e, dict)])


def make_analytics(jobs_root: Path, queue_file: Path) -> an.JobAnalytics:
    return an.JobAnalytics(
        jobs_root,
        queue_file,
        unique_phrase_ids=_unique_phrase_ids,
        job_phrase_ids=_job_phrase_ids,
    )


class ClassifyImageSourceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.ja = make_analytics(Path("."), Path("."))

    def test_table(self) -> None:
        cases = [
            ("real", "real"), ("google", "real"), ("openverse", "real"),
            ("REAL", "real"),  # case-insensitive
            ("generated", "generated"), ("gerada", "generated"),
            ("dalle", "generated"), ("dall-e", "generated"), ("gpt-image", "generated"),
            ("skipped", "skipped"),
            ("", "failed"), (None, "failed"), ("whatever", "failed"),
        ]
        for raw, expected in cases:
            with self.subTest(raw=raw):
                self.assertEqual(self.ja._classify_image_source(raw), expected)


class ParseDateTest(unittest.TestCase):
    def setUp(self) -> None:
        self.ja = make_analytics(Path("."), Path("."))

    def test_table(self) -> None:
        self.assertEqual(self.ja.parse_date("2026-08-30"), date(2026, 8, 30))
        self.assertEqual(self.ja.parse_date("2026-08-30T12:00:00-03:00"), date(2026, 8, 30))
        self.assertIsNone(self.ja.parse_date(None))
        self.assertIsNone(self.ja.parse_date(""))
        self.assertIsNone(self.ja.parse_date("not-a-date"))


class SummarizeRecordsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.ja = make_analytics(Path("."), Path("."))

    def test_cost_and_image_buckets(self) -> None:
        records = [
            {"type": "tokens", "keyword": "gato", "cost_usd": 0.10},
            {"type": "tokens", "keyword": "[image_judge] x", "cost_usd": 0.02},
            {"type": "tokens", "keyword": "[image_guard] y", "cost_usd": 0.03},
            {"type": "image", "source": "generated", "cost_usd": 0.20},
            {"type": "image_pipeline", "final_source": "real",
             "cost_saved_vs_generated_usd": 0.20},
            {"type": "image_pipeline", "final_source": "generated",
             "generated_attempted": True, "actual_cost_usd": 0.05,
             "cost_saved_vs_generated_usd": 0.0},
            {"type": "session"},                       # ignorado
            {"type": "misc", "cost_usd": 0.01},        # otherUsd
        ]
        out = self.ja.summarize_records(records, None, None, None)
        costs = out["costs"]
        self.assertAlmostEqual(costs["cardUsd"], 0.10)
        self.assertAlmostEqual(costs["imageJudgeUsd"], 0.02)
        self.assertAlmostEqual(costs["imageGuardUsd"], 0.03)
        # imageGenerationUsd = max(records=0.20, pipeline=0.05) = 0.20
        self.assertAlmostEqual(costs["imageGenerationUsd"], 0.20)
        self.assertAlmostEqual(costs["otherUsd"], 0.01)
        self.assertAlmostEqual(costs["totalUsd"], 0.10 + 0.02 + 0.03 + 0.20 + 0.01)
        # Pipeline presente -> images vem do pipeline (2 no total).
        self.assertEqual(out["images"]["total"], 2)
        self.assertEqual(out["images"]["real"], 1)
        self.assertEqual(out["images"]["generated"], 1)
        self.assertEqual(out["images"]["generatedAttempted"], 1)
        self.assertAlmostEqual(out["images"]["savingsUsd"], 0.20)
        self.assertEqual(out["images"]["realPct"], 50.0)
        # matched_records incrementa antes do check de type; session conta.
        self.assertEqual(out["matchedRecords"], 8)

    def test_image_records_fallback_when_no_pipeline(self) -> None:
        records = [
            {"type": "image", "source": "real"},
            {"type": "image", "source": "generated"},
            {"type": "image", "source": "skipped"},
        ]
        out = self.ja.summarize_records(records, None, None, None)
        self.assertEqual(out["images"]["total"], 3)
        self.assertEqual(out["images"]["real"], 1)
        self.assertEqual(out["images"]["generated"], 1)
        self.assertEqual(out["images"]["skipped"], 1)

    def test_date_filter_excludes_out_of_range(self) -> None:
        records = [
            {"type": "tokens", "keyword": "a", "cost_usd": 1.0, "date": "2026-08-01"},
            {"type": "tokens", "keyword": "b", "cost_usd": 2.0, "date": "2026-08-15"},
            {"type": "tokens", "keyword": "c", "cost_usd": 4.0, "date": "2026-08-30"},
        ]
        out = self.ja.summarize_records(
            records, None, date(2026, 8, 10), date(2026, 8, 20)
        )
        self.assertEqual(out["matchedRecords"], 1)
        self.assertAlmostEqual(out["costs"]["cardUsd"], 2.0)


def _sample_jobs():
    jobs = {
        "job-en": {
            "job": {"lang": "en", "deckName": "EN::Deck", "imageSource": "google",
                    "createdAt": "2026-08-10T09:00:00-03:00",
                    "entries": [{"phraseId": 1}, {"phraseId": 2}, {"phraseId": 3}]},
            "state": {"status": "partial", "stage": "images",
                      "updatedAt": "2026-08-10T10:00:00-03:00",
                      "successfulPhraseIds": [1, 2], "failedPhraseIds": [],
                      "lastError": None},
            "costs": [
                {"type": "tokens", "keyword": "cat", "cost_usd": 0.10, "date": "2026-08-10"},
                {"type": "image_pipeline", "final_source": "real",
                 "cost_saved_vs_generated_usd": 0.20, "date": "2026-08-10"},
            ],
        },
        "job-ru": {
            "job": {"lang": "ru", "deckName": "RU::Deck", "imageSource": "generated",
                    "createdAt": "2026-08-20T09:00:00-03:00",
                    "entries": [{"phraseId": 10}, {"phraseId": 11}]},
            "state": {"status": "completed", "stage": "done",
                      "updatedAt": "2026-08-20T11:00:00-03:00",
                      "successfulPhraseIds": [10, 11], "failedPhraseIds": []},
            "costs": [
                {"type": "tokens", "keyword": "koshka", "cost_usd": 0.30, "date": "2026-08-20"},
                {"type": "image_pipeline", "final_source": "generated",
                 "generated_attempted": True, "actual_cost_usd": 0.05,
                 "cost_saved_vs_generated_usd": 0.0, "date": "2026-08-20"},
            ],
        },
    }
    queue = [
        {"jobId": "job-en", "status": "partial", "lang": "en",
         "createdAt": "2026-08-10T09:00:00-03:00"},
        {"jobId": "job-ru", "status": "completed", "lang": "ru",
         "createdAt": "2026-08-20T09:00:00-03:00"},
    ]
    return jobs, queue


class SummaryIoTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp(prefix="an_test_"))
        jobs, queue = _sample_jobs()
        self.jobs_root, self.queue_file = build_jobs_root(self.tmp, jobs, queue)
        self.ja = make_analytics(self.jobs_root, self.queue_file)

    def tearDown(self) -> None:
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_summary_totals_all(self) -> None:
        out = self.ja.summary(None, None, "all")
        self.assertEqual(out["jobs"]["total"], 2)
        self.assertEqual(out["jobs"]["partial"], 1)
        self.assertEqual(out["jobs"]["completed"], 1)
        # cards: en requested 3 successful 2 -> failed max(0, 3-2)=1 (partial); ru 2/2/0
        self.assertEqual(out["cards"]["requested"], 5)
        self.assertEqual(out["cards"]["successful"], 4)
        self.assertEqual(out["cards"]["failed"], 1)
        self.assertEqual(out["byLanguage"]["en"]["jobs"], 1)
        self.assertEqual(out["byLanguage"]["ru"]["jobs"], 1)
        self.assertEqual(out["images"]["total"], 2)
        self.assertEqual(out["images"]["real"], 1)
        self.assertEqual(out["images"]["generated"], 1)

    def test_summary_lang_filter(self) -> None:
        out = self.ja.summary(None, None, "en")
        self.assertEqual(out["jobs"]["total"], 1)
        self.assertEqual(out["byLanguage"]["en"]["jobs"], 1)
        self.assertEqual(out["byLanguage"]["ru"]["jobs"], 0)

    def test_summary_date_filter(self) -> None:
        # So o job-ru (2026-08-20) cai na janela.
        out = self.ja.summary(date(2026, 8, 15), date(2026, 8, 25), "all")
        self.assertEqual(out["jobs"]["total"], 1)
        self.assertEqual(out["jobs"]["completed"], 1)

    def test_jobs_rows(self) -> None:
        rows = self.ja.jobs(None, None, "all")
        self.assertEqual(len(rows), 2)
        by_id = {r["jobId"]: r for r in rows}
        en = by_id["job-en"]
        self.assertEqual(en["lang"], "en")
        self.assertEqual(en["deckName"], "EN::Deck")
        self.assertEqual(en["requestedCards"], 3)
        self.assertEqual(en["successfulCards"], 2)
        self.assertEqual(en["failedCards"], 1)
        self.assertEqual(en["status"], "partial")

    def test_jobs_sorted_newest_first(self) -> None:
        rows = self.ja.jobs(None, None, "all")
        self.assertEqual([r["jobId"] for r in rows], ["job-ru", "job-en"])


def _load_old_server():
    """Carrega o server.py antigo (backup .bak desta sessao) como modulo isolado.

    Copia o .bak para bridge/_server_old_c.py (para __file__/ROOT resolverem no
    projeto real), importa e devolve o modulo. O arquivo copiado e removido em
    tearDownModule. Retorna None se o backup nao existir (pula o diferencial).
    """
    bak = Path(r"C:/Users/sadvi/.claude/jobs/853728b2/tmp/server.py.20260830-C.bak")
    if not bak.exists():
        return None, None
    shim = BRIDGE_DIR / "_server_old_c.py"
    shutil.copyfile(bak, shim)
    spec = importlib.util.spec_from_file_location("_server_old_c", shim)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["_server_old_c"] = mod
    spec.loader.exec_module(mod)
    return mod, shim


_OLD_MOD = None
_OLD_SHIM = None


def tearDownModule() -> None:
    if _OLD_SHIM and _OLD_SHIM.exists():
        try:
            os.remove(_OLD_SHIM)
        except OSError:
            pass


class DifferentialTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        global _OLD_MOD, _OLD_SHIM
        _OLD_MOD, _OLD_SHIM = _load_old_server()

    def setUp(self) -> None:
        if _OLD_MOD is None:
            self.skipTest("backup .bak indisponivel; diferencial pulado")
        self.tmp = Path(tempfile.mkdtemp(prefix="an_diff_"))
        jobs, queue = _sample_jobs()
        self.jobs_root, self.queue_file = build_jobs_root(self.tmp, jobs, queue)
        # BridgeApp antigo apontado ao fixture.
        self.bo = _OLD_MOD.BridgeApp(config={"automatic_anki_path": "."})
        self.bo.jobs_root = self.jobs_root
        self.bo.queue_file = self.queue_file
        # JobAnalytics novo reusando a contagem de phrase-id do BridgeApp antigo.
        self.ja = an.JobAnalytics(
            self.jobs_root, self.queue_file,
            unique_phrase_ids=self.bo._unique_phrase_ids,
            job_phrase_ids=self.bo._job_phrase_ids,
        )

    def tearDown(self) -> None:
        shutil.rmtree(getattr(self, "tmp", Path(".")), ignore_errors=True)

    FILTERS = [
        (None, None, "all"),
        (None, None, "en"),
        (None, None, "ru"),
        (date(2026, 8, 1), date(2026, 8, 15), "all"),
        (date(2026, 8, 15), date(2026, 8, 31), "all"),
        (date(2026, 8, 15), date(2026, 8, 31), "en"),
        (date(2026, 8, 15), date(2026, 8, 31), "ru"),
        (date(2027, 1, 1), date(2027, 2, 1), "all"),  # janela vazia
    ]

    def test_summary_matches_old(self) -> None:
        for f, t, lang in self.FILTERS:
            with self.subTest(f=f, t=t, lang=lang):
                old = self.bo._analytics_summary(f, t, lang)
                new = self.ja.summary(f, t, lang)
                old.pop("generatedAt", None)  # timestamp de wall-clock difere
                new.pop("generatedAt", None)
                self.assertEqual(old, new)

    def test_jobs_matches_old(self) -> None:
        for f, t, lang in self.FILTERS:
            with self.subTest(f=f, t=t, lang=lang):
                self.assertEqual(
                    self.bo._analytics_jobs(f, t, lang),
                    self.ja.jobs(f, t, lang),
                )

    def test_summarize_records_matches_old(self) -> None:
        jobs, _ = _sample_jobs()
        record_sets = [spec["costs"] for spec in jobs.values()] + [[], [{"type": "session"}]]
        windows = [(None, None), (date(2026, 8, 1), date(2026, 8, 15))]
        for records in record_sets:
            for f, t in windows:
                with self.subTest(records=records, f=f, t=t):
                    self.assertEqual(
                        self.bo._summarize_records(records, None, f, t),
                        self.ja.summarize_records(records, None, f, t),
                    )


if __name__ == "__main__":
    unittest.main(verbosity=2)

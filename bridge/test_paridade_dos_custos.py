"""As duas contas dos custos dos Envios dão as mesmas linhas para os mesmos Envios.

`complemento/custos.py` (a Conexão como complemento do Anki) repete as regras de `JobAnalytics.jobs` e `summarize_records`
(`bridge/analytics.py`, a Conexão de hoje), que a aba Custos lê. A fonte de verdade é `analytics.py` enquanto o bridge
existir. Este teste põe os mesmos Envios (pedido, estado e registros de custo, com texto, juiz, triagem, imagens reais,
geradas e o pipeline) nos arquivos de cada um e compara as linhas, em vários períodos e idiomas.
Quando o bridge for aposentado (#179), este arquivo sai junto.
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
for pasta in (RAIZ, RAIZ / "bridge"):
    if str(pasta) not in sys.path:
        sys.path.insert(0, str(pasta))

from analytics import JobAnalytics  # noqa: E402  (apos ajustar sys.path)
from complemento import custos, envio, pasta_de_dados  # noqa: E402

ENVIOS = [
    {
        "job": {"jobId": "aaaaaaaa-0000-4000-8000-000000000001", "createdAt": "2026-10-10T09:00:00-03:00", "lang": "en",
                "deckName": "Inglês", "imageSource": "1", "entries": [{"phraseId": 1, "line": "a"}, {"phraseId": 2, "line": "b"}, {"phraseId": 2, "line": "b"}]},
        "state": {"status": "partial", "stage": "partial", "successfulPhraseIds": [1], "failedPhraseIds": [], "lastError": "openai_rate_limited",
                  "updatedAt": "2026-10-10T09:05:00-03:00"},
        "custos": [
            {"date": "2026-10-10", "type": "tokens", "model": "gpt-4o", "cost_usd": 0.0045, "keyword": "a"},
            {"date": "2026-10-11", "type": "tokens", "model": "gpt-4.1-mini", "cost_usd": 0.0002, "keyword": "[image_judge] a"},
            {"date": "2026-10-10", "type": "tokens", "cost_usd": 0.0001, "keyword": "[image_guard] a"},
            {"date": "2026-10-10", "type": "image", "source": "google", "cost_usd": 0},
            {"date": "2026-10-10", "type": "image", "source": "dalle", "cost_usd": 0.04},
            {"date": "2026-10-10", "type": "session", "cost_usd": 9.99},
            {"date": "2026-10-10", "type": "estranho", "cost_usd": "0.5"},
        ],
    },
    {
        "job": {"jobId": "aaaaaaaa-0000-4000-8000-000000000002", "createdAt": "2026-10-12T22:30:00-03:00", "lang": "ru",
                "deckName": "Русский", "imageSource": "2", "entries": [{"phraseId": 3, "line": "c"}]},
        "state": {"status": "completed", "stage": "completed", "successfulPhraseIds": [3], "failedPhraseIds": [], "lastError": None,
                  "updatedAt": "2026-10-12T22:31:00-03:00"},
        "custos": [
            {"date": "2026-10-12", "type": "tokens", "model": "gpt-4o", "cost_usd": 0.003, "keyword": "c"},
            {"date": "2026-10-12", "type": "image_pipeline", "final_source": "generated", "generated_attempted": True,
             "actual_cost_usd": 0.04, "cost_saved_vs_generated_usd": 0},
            {"date": "2026-10-12", "type": "image_pipeline", "final_source": "real", "cost_saved_vs_generated_usd": 0.04},
        ],
    },
    {
        "job": {"jobId": "aaaaaaaa-0000-4000-8000-000000000003", "createdAt": "2026-10-13T08:00:00-03:00", "lang": "en",
                "deckName": "Inglês", "imageSource": "1", "entries": [{"phraseId": 4, "line": "d"}]},
        "state": {"status": "failed", "stage": "failed", "successfulPhraseIds": [], "failedPhraseIds": [], "lastError": "openai_key_missing",
                  "updatedAt": "2026-10-13T08:00:01-03:00"},
        "custos": [],
    },
]

PERIODOS = [(None, None), (date(2026, 10, 10), date(2026, 10, 10)), (date(2026, 10, 11), date(2026, 10, 12)), (date(2026, 10, 14), None)]


def escrever(caminho: Path, dados) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text(json.dumps(dados, ensure_ascii=False), encoding="utf-8")


def escrever_registros(caminho: Path, registros) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text("".join(json.dumps(r) + "\n" for r in registros), encoding="utf-8")


class CustosIguaisNasDuasConexoes(unittest.TestCase):
    def test_as_linhas_dos_custos_sao_as_mesmas_no_bridge_e_no_complemento(self) -> None:
        with tempfile.TemporaryDirectory() as pasta:
            raiz = Path(pasta)
            bridge_jobs, fila = raiz / "bridge" / "jobs", []
            dados = pasta_de_dados.preparar(str(raiz / "complemento"))
            for item in ENVIOS:
                job_id = item["job"]["jobId"]
                escrever(bridge_jobs / job_id / "job.json", item["job"])
                escrever(bridge_jobs / job_id / "state.json", item["state"])
                escrever_registros(bridge_jobs / job_id / "log" / "costs.jsonl", item["custos"])
                escrever(Path(dados.fila) / (job_id + ".json"), item["job"])
                escrever(Path(dados.estado) / (job_id + ".json"), item["state"])
                if item["custos"]:
                    escrever_registros(Path(dados.custos) / job_id / "costs.jsonl", item["custos"])
                fila.append({"jobId": job_id, "lang": item["job"]["lang"], "status": item["state"]["status"],
                             "createdAt": item["job"]["createdAt"], "updatedAt": item["state"]["updatedAt"]})
            escrever(raiz / "bridge" / "queue.json", {"jobs": fila})
            escrever(Path(dados.fila) / "fila.json", {"jobs": fila})

            do_bridge = JobAnalytics(
                bridge_jobs, raiz / "bridge" / "queue.json",
                unique_phrase_ids=envio.ids_unicos,
                job_phrase_ids=lambda entradas: envio.ids_unicos(e.get("phraseId") for e in entradas),
            )
            do_complemento = envio.Fila(dados, motor=None)
            for de, ate in PERIODOS:
                for lang in ("all", "en", "ru"):
                    with self.subTest(de=de, ate=ate, lang=lang):
                        self.assertEqual(custos.linhas(do_complemento, de, ate, lang), do_bridge.jobs(de, ate, lang))


if __name__ == "__main__":
    unittest.main()

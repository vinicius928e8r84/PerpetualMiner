import json
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest import mock

import cost_tracker


class UmDiaFixo(date):
    @classmethod
    def today(cls):
        return cls(2026, 11, 25)


def vazio():
    return {"total_usd": 0.0, "by_model": {}, "n_cards": 0, "n_images_dalle": 0, "n_images_google": 0}


with open(Path(__file__).with_name("test_cost_tracker_periodo_casos.json"), encoding="utf-8") as arquivo:
    DADOS = json.load(arquivo)
PERIODOS = ("today", "week", "month", "alltime")
CASOS = [(caso["nome"], DADOS["geral"] if caso["registros"] == "geral" else caso["registros"], caso["texto_solto"], caso["periodo"], caso["esperado"])
         for caso in DADOS["casos"]] + [(f"sem registro, o periodo {periodo}", [], "", periodo, vazio()) for periodo in PERIODOS]


class OResumoPorPeriodo(unittest.TestCase):
    def resumo(self, registros, texto_solto):
        with tempfile.TemporaryDirectory() as pasta:
            (Path(pasta) / "costs.jsonl").write_text("\n".join(json.dumps(r) for r in registros) + "\n" + texto_solto, encoding="utf-8")
            with mock.patch.object(cost_tracker, "date", UmDiaFixo):
                return cost_tracker.summary(pasta)

    def test_cada_registro_soma_so_no_periodo_e_no_tipo_dele(self):
        for nome, registros, texto_solto, periodo, esperado in CASOS:
            with self.subTest(nome):
                self.assertEqual(self.resumo(registros, texto_solto)[periodo], esperado)


if __name__ == "__main__":
    unittest.main()

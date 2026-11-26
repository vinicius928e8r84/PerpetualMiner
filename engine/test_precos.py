import json
import tempfile
import unittest
from datetime import date
from pathlib import Path

import cost_tracker

ARQUIVO = Path(__file__).with_name("precos.json")
UM_MILHAO = 1_000_000
PAGINA_DE_PRECOS = "https://developers.openai.com/api/docs/pricing"


def precos():
    return json.loads(ARQUIVO.read_text(encoding="utf-8"))


def entradas():
    dados = precos()
    return [(grupo, modelo, entrada) for grupo in ("texto", "imagem") for modelo, entrada in dados[grupo].items()]


class OsPrecosMoramNoArquivoDeDados(unittest.TestCase):
    def test_cada_preco_tem_a_data_em_que_foi_lido_e_a_fonte(self):
        for grupo, modelo, entrada in entradas():
            with self.subTest(f"{grupo} {modelo}"):
                self.assertRegex(entrada["data"], r"^\d{4}-\d{2}(-\d{2})?$")
                if len(entrada["data"]) == 10:
                    date.fromisoformat(entrada["data"])
                self.assertTrue(entrada["fonte"].strip())

    def test_o_texto_e_o_que_esta_na_pagina_tem_o_endereco_da_pagina_como_fonte(self):
        for modelo, entrada in precos()["texto"].items():
            with self.subTest(modelo):
                self.assertEqual(entrada["fonte"], PAGINA_DE_PRECOS)
                self.assertEqual(entrada["data"], "2026-11-26")

    def test_o_preco_estimado_mostra_a_conta_e_a_conta_fecha_com_o_valor(self):
        estimados = [(modelo, entrada) for modelo, entrada in precos()["imagem"].items() if "estimativa" in entrada]
        self.assertTrue(estimados)
        for modelo, entrada in estimados:
            with self.subTest(modelo):
                conta = entrada["estimativa"]
                self.assertRegex(conta["fonte_dos_tokens"], r"^https://\S+$")
                self.assertIn("estimativa", conta["conta"])
                self.assertAlmostEqual(entrada["usd"], conta["tokens_de_saida"] * conta["saida_de_imagem_por_1m"] / UM_MILHAO, places=9)
                self.assertEqual(conta["saida_de_imagem_por_1m"], entrada["tarifa_por_1m_de_tokens"]["saida_de_imagem"])

    def test_o_arquivo_diz_a_unidade_de_cada_grupo_para_quem_confere_com_a_pagina(self):
        dados = precos()
        self.assertIn("1M", dados["unidade_do_texto"])
        self.assertIn("imagem", dados["unidade_da_imagem"])

    def test_o_preco_do_texto_vem_do_arquivo_por_milhao_de_tokens(self):
        for modelo, entrada in precos()["texto"].items():
            with self.subTest(modelo):
                so_entrada = cost_tracker.TokenUsage(modelo, UM_MILHAO, 0).priced_as(modelo)
                so_saida = cost_tracker.TokenUsage(modelo, 0, UM_MILHAO).priced_as(modelo)
                self.assertAlmostEqual(so_entrada, entrada["entrada"])
                self.assertAlmostEqual(so_saida, entrada["saida"])

    def test_o_preco_da_imagem_vem_do_arquivo_e_o_registro_cobra_esse_valor(self):
        for modelo, entrada in precos()["imagem"].items():
            with self.subTest(modelo):
                self.assertEqual(cost_tracker.PRICES[modelo], entrada["usd"])
                with tempfile.TemporaryDirectory() as pasta:
                    self.assertEqual(cost_tracker.record_image(pasta, model=modelo), entrada["usd"])

    def test_o_modelo_da_conta_do_motor_tem_preco_de_imagem(self):
        config = json.loads(Path(__file__).with_name("config.json").read_text(encoding="utf-8"))
        self.assertIn(config["openai"]["image_model"], precos()["imagem"])

    def test_o_modelo_sem_preco_custa_o_do_gpt_4o(self):
        esperado = cost_tracker.TokenUsage("gpt-4o", 1000, 1000).priced_as("gpt-4o")
        self.assertEqual(cost_tracker.TokenUsage("modelo-sem-preco", 1000, 1000).priced_as("modelo-sem-preco"), esperado)


if __name__ == "__main__":
    unittest.main()

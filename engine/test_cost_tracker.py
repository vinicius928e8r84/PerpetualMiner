"""O registro de custos do motor: cada pedido vira uma linha de `costs.jsonl`, com o preço de tabela do modelo, e o `summary` soma
as linhas por período."""

import json
import tempfile
import unittest
from datetime import date
from pathlib import Path

import cost_tracker


def linhas(pasta):
    return [json.loads(linha) for linha in (Path(pasta) / "costs.jsonl").read_text(encoding="utf-8").splitlines()]


class RegistroDeTokens(unittest.TestCase):
    def test_os_tokens_da_chave_custam_o_preco_do_modelo_e_o_modelo_sem_preco_custa_o_do_gpt_4o(self):
        with tempfile.TemporaryDirectory() as pasta:
            custos = [
                cost_tracker.record_tokens(pasta, cost_tracker.TokenUsage("gpt-4o-mini", 1000, 2000), "olho"),
                cost_tracker.record_tokens(pasta, cost_tracker.TokenUsage(model="modelo-sem-preco", input_tokens=3, output_tokens=7)),
            ]
            gravado = linhas(pasta)
        hoje = date.today().isoformat()
        self.assertEqual(custos, [(1000 * 0.00015 + 2000 * 0.0006) / 1000, (3 * 0.0025 + 7 * 0.01) / 1000])
        self.assertEqual([list(linha.items()) for linha in gravado], [
            [("date", hoje), ("type", "tokens"), ("model", "gpt-4o-mini"), ("input_tokens", 1000), ("output_tokens", 2000),
             ("cost_usd", 0.00135), ("keyword", "olho")],
            [("date", hoje), ("type", "tokens"), ("model", "modelo-sem-preco"), ("input_tokens", 3), ("output_tokens", 7),
             ("cost_usd", 7.8e-05), ("keyword", "")],
        ])

    def test_os_tokens_do_plano_custam_zero_e_guardam_o_que_a_chave_teria_cobrado_pelo_modelo_dela(self):
        with tempfile.TemporaryDirectory() as pasta:
            teria = [
                cost_tracker.record_plan_tokens(pasta, cost_tracker.TokenUsage("gpt-5", 1234, 567), "gpt-4.1", "olho"),
                cost_tracker.record_plan_tokens(pasta, cost_tracker.TokenUsage("gpt-5", 10, 20), "modelo-sem-preco"),
            ]
            gravado = linhas(pasta)
        hoje = date.today().isoformat()
        self.assertEqual(teria, [(1234 * 0.002 + 567 * 0.008) / 1000, (10 * 0.0025 + 20 * 0.01) / 1000])
        self.assertEqual([list(linha.items()) for linha in gravado], [
            [("date", hoje), ("type", "plan_tokens"), ("model", "gpt-5"), ("input_tokens", 1234), ("output_tokens", 567),
             ("cost_usd", 0.0), ("would_cost_usd", 0.007004), ("keyword", "olho")],
            [("date", hoje), ("type", "plan_tokens"), ("model", "gpt-5"), ("input_tokens", 10), ("output_tokens", 20),
             ("cost_usd", 0.0), ("would_cost_usd", 0.000225), ("keyword", "")],
        ])

    def test_a_correcao_paga_pela_chave_custa_o_preco_e_pelo_plano_custa_zero(self):
        with tempfile.TemporaryDirectory() as pasta:
            custos = [
                cost_tracker.record_correction(pasta, cost_tracker.TokenUsage("gpt-4.1-mini", 500, 100)),
                cost_tracker.record_correction(pasta, cost_tracker.TokenUsage("gpt-4.1-mini", 500, 100), paid=False),
                cost_tracker.record_correction(pasta, cost_tracker.TokenUsage("modelo-sem-preco", 1, 1), True),
            ]
            gravado = linhas(pasta)
        hoje = date.today().isoformat()
        self.assertEqual(custos, [(500 * 0.0004 + 100 * 0.0016) / 1000, 0.0, (0.0025 + 0.01) / 1000])
        self.assertEqual([list(linha.items()) for linha in gravado], [
            [("date", hoje), ("type", "correction_tokens"), ("model", "gpt-4.1-mini"), ("input_tokens", 500), ("output_tokens", 100),
             ("cost_usd", 0.00036)],
            [("date", hoje), ("type", "correction_tokens"), ("model", "gpt-4.1-mini"), ("input_tokens", 500), ("output_tokens", 100),
             ("cost_usd", 0.0)],
            [("date", hoje), ("type", "correction_tokens"), ("model", "modelo-sem-preco"), ("input_tokens", 1), ("output_tokens", 1),
             ("cost_usd", 1.3e-05)],
        ])

    def test_o_registro_cria_a_pasta_e_acrescenta_sem_apagar_o_que_ja_estava(self):
        with tempfile.TemporaryDirectory() as raiz:
            pasta = Path(raiz) / "log"
            cost_tracker.record_tokens(pasta, cost_tracker.TokenUsage("gpt-4o", 1, 1), "a")
            cost_tracker.record_plan_tokens(str(pasta), cost_tracker.TokenUsage("gpt-5", 1, 1), "gpt-4o", "b")
            cost_tracker.record_correction(pasta, cost_tracker.TokenUsage("gpt-4o", 1, 1))
            tipos = [(linha["type"], linha.get("keyword")) for linha in linhas(pasta)]
        self.assertEqual(tipos, [("tokens", "a"), ("plan_tokens", "b"), ("correction_tokens", None)])

    def test_o_resumo_soma_o_custo_dos_tokens_por_modelo_e_o_plano_e_a_correcao_so_no_total(self):
        with tempfile.TemporaryDirectory() as pasta:
            cost_tracker.record_tokens(pasta, cost_tracker.TokenUsage("gpt-4o", 1000, 1000), "a")
            cost_tracker.record_plan_tokens(pasta, cost_tracker.TokenUsage("gpt-5", 1000, 1000), "gpt-4o", "b")
            cost_tracker.record_correction(pasta, cost_tracker.TokenUsage("gpt-4o-mini", 1000, 1000))
            resumo = cost_tracker.summary(pasta)
        self.assertEqual(resumo["today"], {
            "total_usd": round(0.0125 + 0.00075, 4), "by_model": {"gpt-4o": 0.0125}, "n_cards": 0, "n_images_dalle": 0, "n_images_google": 0,
        })
        self.assertEqual(resumo["alltime"], resumo["today"])


if __name__ == "__main__":
    unittest.main()

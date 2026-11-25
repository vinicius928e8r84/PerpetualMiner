import json
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest import mock

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


class UmDiaFixo(date):
    @classmethod
    def today(cls):
        return cls(2026, 11, 25)


def registro(dia, tipo, custo=None, **campos):
    return dict({"date": dia, "type": tipo}, **({} if custo is None else {"cost_usd": custo}), **campos)


REGISTROS = [
    registro("2026-11-25", "tokens", 0.5, model="gpt-4o"),
    registro("2026-11-25", "tokens", 0.25, model="gpt-4o-mini"),
    registro("2026-11-25", "image", 0.04, model="dall-e-3-1024", source="dalle"),
    registro("2026-11-25", "image", 0.0, model="dall-e-3-1024", source="google"),
    registro("2026-11-25", "image", 0.04, model="gpt-image-1"),
    registro("2026-11-25", "session", 0.0, n_cards=3),
    registro("2026-11-25", "plan_tokens", 0.0, model="gpt-5", would_cost_usd=0.9),
    registro("2026-11-25", "correction_tokens", 0.125, model="gpt-4o"),
    registro("2026-11-25", "image_pipeline"),
    registro("2026-11-23", "tokens", 1.0, model="gpt-4o"),
    registro("2026-11-23", "session", n_cards=2),
    registro("2026-11-22", "tokens", 2.0, model="gpt-4o"),
    registro("2026-11-22", "image", 0.04, model="dall-e-3-1024"),
    registro("2026-11-01", "tokens", 4.0, model="gpt-4o-mini"),
    registro("2026-10-31", "tokens", 8.0, model="gpt-4o"),
    registro("2026-10-31", "image", 0.02, model="dall-e-3-512", source="google"),
    registro("2026-10-31", "session", n_cards=10),
]


def vazio():
    return {"total_usd": 0.0, "by_model": {}, "n_cards": 0, "n_images_dalle": 0, "n_images_google": 0}


class OResumoPorPeriodo(unittest.TestCase):
    def resumo(self, registros, texto_solto=""):
        with tempfile.TemporaryDirectory() as pasta:
            (Path(pasta) / "costs.jsonl").write_text("\n".join(json.dumps(r) for r in registros) + "\n" + texto_solto, encoding="utf-8")
            with mock.patch.object(cost_tracker, "date", UmDiaFixo):
                return cost_tracker.summary(pasta)

    def test_cada_periodo_soma_so_os_registros_do_dia_dele_em_diante(self):
        resumo = self.resumo(REGISTROS)
        self.assertEqual(resumo["today"], {
            "total_usd": 0.955, "by_model": {"gpt-4o": 0.5, "gpt-4o-mini": 0.25, "dall-e-3-1024": 0.04, "gpt-image-1": 0.04},
            "n_cards": 3, "n_images_dalle": 2, "n_images_google": 1,
        })
        self.assertEqual(resumo["week"], {
            "total_usd": 1.955, "by_model": {"gpt-4o": 1.5, "gpt-4o-mini": 0.25, "dall-e-3-1024": 0.04, "gpt-image-1": 0.04},
            "n_cards": 5, "n_images_dalle": 2, "n_images_google": 1,
        })
        self.assertEqual(resumo["month"], {
            "total_usd": 7.995, "by_model": {"gpt-4o": 3.5, "gpt-4o-mini": 4.25, "dall-e-3-1024": 0.08, "gpt-image-1": 0.04},
            "n_cards": 5, "n_images_dalle": 3, "n_images_google": 1,
        })
        self.assertEqual(resumo["alltime"], {
            "total_usd": 16.015, "by_model": {"gpt-4o": 11.5, "gpt-4o-mini": 4.25, "dall-e-3-1024": 0.08, "gpt-image-1": 0.04},
            "n_cards": 15, "n_images_dalle": 3, "n_images_google": 2,
        })

    def test_cada_tipo_de_registro_soma_so_o_que_e_dele(self):
        casos = [
            ("a imagem do google conta so a imagem e nao entra por modelo",
             [registro("2026-11-25", "image", 0.0, model="dall-e-3-1024", source="google")], dict(vazio(), n_images_google=1)),
            ("a imagem sem fonte e a do dalle e entra por modelo",
             [registro("2026-11-25", "image", 0.04, model="gpt-image-1")], dict(vazio(), total_usd=0.04, by_model={"gpt-image-1": 0.04}, n_images_dalle=1)),
            ("a sessao soma os cartoes e a sem cartoes soma zero",
             [registro("2026-11-25", "session", n_cards=4), registro("2026-11-25", "session")], dict(vazio(), n_cards=4)),
            ("o registro sem custo vale zero e o total e arredondado em quatro casas",
             [registro("2026-11-25", "image_pipeline"), registro("2026-11-25", "tokens", 0.123456, model="gpt-4o")],
             dict(vazio(), total_usd=0.1235, by_model={"gpt-4o": 0.1235})),
        ]
        for nome, registros, esperado in casos:
            with self.subTest(nome):
                self.assertEqual(self.resumo(registros)["today"], esperado)

    def test_sem_registro_o_resumo_e_de_zeros_em_cada_periodo(self):
        self.assertEqual(self.resumo([]), {periodo: vazio() for periodo in ("today", "week", "month", "alltime")})

    def test_a_linha_que_nao_e_json_e_ignorada_e_o_resto_e_somado(self):
        resumo = self.resumo([registro("2026-11-25", "tokens", 0.5, model="gpt-4o")], "isto nao e json\n\n")
        self.assertEqual(resumo["today"], dict(vazio(), total_usd=0.5, by_model={"gpt-4o": 0.5}))


if __name__ == "__main__":
    unittest.main()

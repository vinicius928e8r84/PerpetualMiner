import json
import os
import sys
import unittest
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import custos

DIA_19, DIA_20, DIA_21 = date(2026, 10, 19), date(2026, 10, 20), date(2026, 10, 21)


def registro(tipo, custo=0.0, dia="2026-10-20", **campos):
    return dict({"date": dia, "type": tipo, "cost_usd": custo}, **campos)


def custos_esperados(**valores):
    return dict({"cardUsd": 0.0, "imageJudgeUsd": 0.0, "imageGuardUsd": 0.0, "imageGenerationUsd": 0.0, "otherUsd": 0.0, "totalUsd": 0.0}, **valores)


def imagens_esperadas(**valores):
    return dict({
        "total": 0, "real": 0, "generated": 0, "skipped": 0, "failed": 0, "generatedAttempted": 0, "savingsUsd": 0.0,
        "realPct": 0.0, "generatedPct": 0.0, "skippedPct": 0.0, "failedPct": 0.0, "generatedAttemptPct": 0.0,
    }, **valores)


def resumo_esperado(contados, custos_do_envio=None, imagens=None, **plano):
    return dict({"costs": custos_do_envio or custos_esperados(), "images": imagens or imagens_esperadas(), "matchedRecords": contados}, **plano)


def resumo_do_dia(lidos, dia_do_envio=None, de=None, ate=None):
    return custos.resumir(lidos, dia_do_envio, de, ate)


class FilaDosCustos:
    def __init__(self, *envios):
        self.envios = {envio["item"]["jobId"]: envio for envio in envios}

    def envios_dos_custos(self):
        return [envio["item"] for envio in self.envios.values()]

    def pedido(self, job_id):
        return self.envios[job_id].get("pedido")

    def estado(self, job_id):
        return self.envios[job_id].get("estado", {})

    def registros_de_custo(self, job_id):
        return self.envios[job_id].get("custos", [])


PEDIDO = {
    "createdAt": "2026-10-20T10:00:00Z", "lang": "en", "deckName": "Inglês", "imageSource": "google",
    "entries": [{"phraseId": "a"}, {"phraseId": "b"}, {"phraseId": "b"}, {"phraseId": "c"}],
}
ESTADO_PARCIAL = {
    "status": "partial", "stage": "done", "updatedAt": "2026-10-20T10:05:00Z", "lastError": "openai_timeout",
    "successfulPhraseIds": ["a", "a"], "failedPhraseIds": [], "duplicatePhraseIds": ["c"],
}
FICHA_PARCIAL = {
    "createdAt": "2026-10-20T10:00:00Z", "updatedAt": "2026-10-20T10:05:00Z", "lang": "en", "deckName": "Inglês", "imageSource": "google",
    "status": "partial", "stage": "done", "requestedCards": 3, "successfulCards": 1, "failedCards": 2, "lastError": "openai_timeout",
    "successfulPhraseIds": ["a"], "duplicatePhraseIds": ["c"],
}
FICHA_GUARDADA_RU = {
    "createdAt": "2026-10-19T08:00:00Z", "updatedAt": "2026-10-19T09:00:00Z", "lang": "ru", "deckName": "Русский", "imageSource": "openverse",
    "status": "done", "stage": "done", "requestedCards": 1, "successfulCards": 1, "failedCards": 0, "lastError": None,
    "successfulPhraseIds": ["r"], "duplicatePhraseIds": [],
}


def linha_esperada(job_id, ficha, resumo):
    campos = {campo: valor for campo, valor in ficha.items() if campo not in ("successfulPhraseIds", "duplicatePhraseIds")}
    return dict({"jobId": job_id}, **campos, **resumo)


class ResumoDosRegistros(unittest.TestCase):
    def test_sem_registro_o_resumo_e_zerado(self):
        self.assertEqual(resumo_do_dia([]), resumo_esperado(0))

    def test_o_texto_o_juiz_e_a_triagem_da_imagem_caem_cada_um_na_sua_chave_pela_palavra(self):
        lidos = [
            registro("tokens", 0.01, keyword="1-0"), registro("tokens", 0.002, keyword="[image_judge] gato"),
            registro("tokens", 0.003, keyword="[image_guard] gato"), registro("tokens", 0.02),
        ]
        esperado = custos_esperados(cardUsd=0.03, imageJudgeUsd=0.002, imageGuardUsd=0.003, totalUsd=0.035)
        self.assertEqual(resumo_do_dia(lidos), resumo_esperado(4, esperado))

    def test_a_correcao_da_criacao_entra_no_total_e_a_chave_so_aparece_quando_houve_correcao(self):
        casos = {
            "com custo": ([registro("tokens", 0.01, keyword="1-0"), registro("correction_tokens", 0.004), registro("correction_tokens", 0.001)],
                          resumo_esperado(3, custos_esperados(cardUsd=0.01, totalUsd=0.015, correctionUsd=0.005))),
            "de graça": ([registro("correction_tokens", 0.0)], resumo_esperado(1, custos_esperados(correctionUsd=0.0))),
            "fora do período": ([registro("correction_tokens", 0.004, dia="2026-10-19")], resumo_esperado(0)),
        }
        for nome, (lidos, esperado) in casos.items():
            with self.subTest(nome):
                self.assertEqual(resumo_do_dia(lidos, de=DIA_20), esperado)

    def test_o_plano_conta_os_cartoes_sem_repetir_a_palavra_e_soma_o_que_a_chave_teria_cobrado(self):
        lidos = [
            registro("plan_tokens", 0.3, keyword="1-0", would_cost_usd=0.01), registro("plan_tokens", keyword="1-0", would_cost_usd=0.02),
            registro("plan_tokens", keyword="1-1", would_cost_usd="0.005"),
        ]
        self.assertEqual(resumo_do_dia(lidos), resumo_esperado(3, plan={"cards": 2, "wouldCostUsd": 0.035}))

    def test_as_imagens_do_pipeline_valem_no_lugar_dos_registros_de_imagem_e_a_gerada_custa_o_maior_dos_dois(self):
        lidos = [
            registro("image", 0.04, source="dalle"),
            registro("image_pipeline", final_source="google", cost_saved_vs_generated_usd=0.04),
            registro("image_pipeline", final_source="gpt-image", generated_attempted=True, actual_cost_usd=0.03),
            registro("image_pipeline", final_source="skipped"), registro("image_pipeline", final_source="??", generated_attempted=1),
        ]
        imagens = imagens_esperadas(
            total=4, real=1, generated=1, skipped=1, failed=1, generatedAttempted=2, savingsUsd=0.04,
            realPct=25.0, generatedPct=25.0, skippedPct=25.0, failedPct=25.0, generatedAttemptPct=50.0,
        )
        self.assertEqual(resumo_do_dia(lidos), resumo_esperado(5, custos_esperados(imageGenerationUsd=0.04, totalUsd=0.04), imagens))

    def test_a_imagem_gerada_do_pipeline_custa_o_que_ele_gastou_quando_e_mais_que_os_registros(self):
        lidos = [registro("image", 0.01, source="generated"), registro("image_pipeline", 0.9, final_source="generated", actual_cost_usd=0.03)]
        imagens = imagens_esperadas(total=1, generated=1, generatedPct=100.0)
        self.assertEqual(resumo_do_dia(lidos), resumo_esperado(2, custos_esperados(imageGenerationUsd=0.03, totalUsd=0.03), imagens))

    def test_sem_pipeline_as_imagens_vem_dos_registros_de_imagem_pela_origem(self):
        lidos = [
            registro("image", source="Openverse "), registro("image", 0.04, source="generated"), registro("image", source="skipped"),
            registro("image"), registro("image", 0.05, source="DALL-E"),
        ]
        imagens = imagens_esperadas(total=5, real=1, generated=2, skipped=1, failed=1, realPct=20.0, generatedPct=40.0, skippedPct=20.0, failedPct=20.0)
        self.assertEqual(resumo_do_dia(lidos), resumo_esperado(5, custos_esperados(imageGenerationUsd=0.09, totalUsd=0.09), imagens))

    def test_cada_origem_da_imagem_conta_no_seu_grupo(self):
        grupos = {
            "real": ("real", "google", "openverse", " GOOGLE "), "generated": ("gerada", "generated", "dalle", "dall-e", "gpt-image"),
            "skipped": ("skipped",), "failed": ("failed", "", None, "openai", "real-ish"),
        }
        for grupo, origens in grupos.items():
            for origem in origens:
                with self.subTest(origem=origem):
                    resumo = resumo_do_dia([registro("image_pipeline", final_source=origem)])
                    self.assertEqual((resumo["images"]["total"], resumo["images"][grupo]), (1, 1))

    def test_a_sessao_nao_custa_e_qualquer_outro_tipo_cai_em_outros(self):
        lidos = [
            registro("session", 1.0), registro("tts", 0.006), registro(None, 0.001), {"date": "2026-10-20", "cost_usd": 0.002},
            registro(7, 0.003), registro("tts", 0.0),
        ]
        self.assertEqual(resumo_do_dia(lidos), resumo_esperado(6, custos_esperados(otherUsd=0.012, totalUsd=0.012)))

    def test_um_custo_que_nao_e_numero_vale_zero(self):
        lidos = [registro("tokens", "x"), registro("tokens", None), registro("tts", "0.5"), registro("tts", [1])]
        self.assertEqual(resumo_do_dia(lidos), resumo_esperado(4, custos_esperados(otherUsd=0.5, totalUsd=0.5)))

    def test_o_periodo_conta_pelo_dia_do_registro_e_sem_ele_pelo_dia_do_envio(self):
        lidos = [
            registro("tokens", 0.01), {"createdAt": "2026-10-19T23:00:00", "type": "tokens", "cost_usd": 0.02},
            {"type": "tokens", "cost_usd": 0.04}, registro("tokens", 0.08, dia="ontem"), registro("tokens", 0.16, dia="2026-10-21"),
        ]
        casos = {
            "sem período": ((DIA_19, None, None), 0.31, 5),
            "um dia só, com o Envio de outro dia": ((DIA_19, DIA_20, DIA_20), 0.01, 1),
            "do dia 20 em diante, sem o dia do Envio": ((None, DIA_20, None), 0.17, 2),
            "até o dia 19, sem o dia do Envio": ((None, None, DIA_19), 0.02, 1),
            "sem período nem dia do Envio": ((None, None, None), 0.31, 5),
            "o dia do Envio fora do período": ((DIA_21, DIA_19, DIA_19), 0.02, 1),
            "o dia do Envio no período": ((DIA_21, DIA_21, None), 0.28, 3),
        }
        for nome, (argumentos, texto, contados) in casos.items():
            with self.subTest(nome):
                resumo = resumo_do_dia(lidos, *argumentos)
                self.assertEqual((resumo["costs"]["cardUsd"], resumo["matchedRecords"]), (texto, contados))

    def test_o_resumo_completo_sai_com_as_chaves_na_ordem_de_hoje(self):
        lidos = [
            registro("tokens", 0.01, keyword="1-0"), registro("correction_tokens", 0.002), registro("tts", 0.003),
            registro("plan_tokens", keyword="1-1", would_cost_usd=0.0123456789), registro("image", 0.04, source="generated"),
        ]
        esperado = (
            '{"costs": {"cardUsd": 0.01, "imageJudgeUsd": 0.0, "imageGuardUsd": 0.0, "imageGenerationUsd": 0.04, "otherUsd": 0.003, '
            '"totalUsd": 0.055, "correctionUsd": 0.002}, "images": {"total": 1, "real": 0, "generated": 1, "skipped": 0, "failed": 0, '
            '"generatedAttempted": 0, "savingsUsd": 0.0, "realPct": 0.0, "generatedPct": 100.0, "skippedPct": 0.0, "failedPct": 0.0, '
            '"generatedAttemptPct": 0.0}, "matchedRecords": 5, "plan": {"cards": 1, "wouldCostUsd": 0.012346}}'
        )
        self.assertEqual(json.dumps(resumo_do_dia(lidos)), esperado)


class DiaDeUmInstante(unittest.TestCase):
    def test_o_dia_vem_dos_dez_primeiros_caracteres_e_o_que_nao_e_data_e_none(self):
        casos = [
            (None, None), ("", None), ("x", None), ("2026-10-20T10:00:00Z", DIA_20), (" 2026-10-20", DIA_20), (DIA_20, DIA_20),
            ("2026-13-01", None),
        ]
        for valor, esperado in casos:
            with self.subTest(valor=valor):
                self.assertEqual(custos.dia(valor), esperado)


class FichaDoEnvio(unittest.TestCase):
    def test_a_ficha_conta_as_frases_sem_repetir_e_o_envio_parcial_conta_como_falha_o_que_nao_chegou(self):
        self.assertEqual(json.dumps(custos.ficha_do_envio({}, PEDIDO, ESTADO_PARCIAL)), json.dumps(FICHA_PARCIAL))

    def test_sem_pedido_nem_estado_a_ficha_cai_no_item_da_fila(self):
        item = {"createdAt": "2026-10-19T08:00:00Z", "updatedAt": "2026-10-19T09:00:00Z", "lang": "ru"}
        esperado = {
            "createdAt": "2026-10-19T08:00:00Z", "updatedAt": "2026-10-19T09:00:00Z", "lang": "ru", "deckName": "", "imageSource": "",
            "status": "unknown", "stage": "unknown", "requestedCards": 0, "successfulCards": 0, "failedCards": 0, "lastError": None,
            "successfulPhraseIds": [], "duplicatePhraseIds": [],
        }
        self.assertEqual(custos.ficha_do_envio(item, {}, {}), esperado)

    def test_as_falhas_de_um_envio_que_falhou_sao_as_marcadas_quando_sao_mais_que_as_que_faltam(self):
        ficha = custos.ficha_do_envio({"createdAt": "2026-10-19T08:00:00Z"}, {"entries": [{"phraseId": "a"}]}, {"status": "failed", "failedPhraseIds": ["a", "z", "y"]})
        self.assertEqual(
            (ficha["updatedAt"], ficha["lang"], ficha["stage"], ficha["requestedCards"], ficha["failedCards"]),
            ("2026-10-19T08:00:00Z", "unknown", "failed", 1, 3),
        )

    def test_um_envio_que_terminou_nao_conta_como_falha_o_que_nao_chegou(self):
        ficha = custos.ficha_do_envio({}, {"entries": [{"phraseId": "a"}, {"phraseId": "b"}]}, {"status": "done"})
        self.assertEqual(
            (ficha["createdAt"], ficha["updatedAt"], ficha["requestedCards"], ficha["successfulCards"], ficha["failedCards"]),
            (None, None, 2, 0, 0),
        )

    def test_a_ficha_guardada_vale_so_com_todos_os_campos_e_o_idioma_em_texto(self):
        sem_erro = {campo: valor for campo, valor in FICHA_GUARDADA_RU.items() if campo != "lastError"}
        casos = [
            (FICHA_GUARDADA_RU, True), (FICHA_PARCIAL, True), (dict(FICHA_GUARDADA_RU, lang=None), False), (sem_erro, False),
            ([FICHA_GUARDADA_RU], False), (None, False),
        ]
        for ficha, valida in casos:
            with self.subTest(ficha=ficha):
                self.assertIs(custos.ficha_valida(ficha), valida)


class LinhasDaAbaCustos(unittest.TestCase):
    def test_a_linha_tem_a_ficha_sem_as_frases_e_o_resumo_do_envio_com_o_plano(self):
        lidos = [registro("tokens", 0.01, keyword="1-0"), registro("plan_tokens", keyword="1-1", would_cost_usd=0.02)]
        fila = FilaDosCustos({"item": {"jobId": "j1"}, "pedido": PEDIDO, "estado": ESTADO_PARCIAL, "custos": lidos})
        esperado = linha_esperada("j1", FICHA_PARCIAL, resumo_esperado(
            2, custos_esperados(cardUsd=0.01, totalUsd=0.01), plan={"cards": 1, "wouldCostUsd": 0.02},
        ))
        linhas = custos.linhas(fila, None, None, "all")
        self.assertEqual(json.dumps(linhas), json.dumps([esperado]))

    def test_o_envio_que_a_retencao_apagou_sai_da_ficha_guardada_sem_ler_o_pedido(self):
        fila = FilaDosCustos({"item": {"jobId": "j0", "ficha": FICHA_GUARDADA_RU}, "custos": [registro("tts", 0.5, dia="2026-10-19")]})
        esperado = linha_esperada("j0", FICHA_GUARDADA_RU, resumo_esperado(1, custos_esperados(otherUsd=0.5, totalUsd=0.5)))
        self.assertEqual(custos.linhas(fila, DIA_19, DIA_19, "ru"), [esperado])

    def test_o_idioma_escolhe_as_linhas_e_all_deixa_todas(self):
        fila = FilaDosCustos({"item": {"jobId": "j0", "ficha": FICHA_GUARDADA_RU}}, {"item": {"jobId": "j1"}, "pedido": PEDIDO, "estado": ESTADO_PARCIAL})
        casos = {"all": ["j1", "j0"], "ru": ["j0"], "en": ["j1"], "es": []}
        for idioma, esperados in casos.items():
            with self.subTest(idioma):
                self.assertEqual([linha["jobId"] for linha in custos.linhas(fila, None, None, idioma)], esperados)

    def test_um_envio_de_fora_do_periodo_entra_so_quando_um_registro_e_do_periodo(self):
        fila = FilaDosCustos(
            {"item": {"jobId": "registro-no-periodo"}, "pedido": PEDIDO, "custos": [registro("tts", 0.5, dia="2026-10-21")]},
            {"item": {"jobId": "registro-sem-dia"}, "pedido": PEDIDO, "custos": [{"type": "tts", "cost_usd": 0.5}]},
            {"item": {"jobId": "sem-registro"}, "pedido": PEDIDO},
        )
        casos = {
            "o dia 21": ((DIA_21, DIA_21), [("registro-no-periodo", 1, 0.5)]),
            "o dia 20": ((DIA_20, DIA_20), [("registro-no-periodo", 0, 0.0), ("registro-sem-dia", 1, 0.5), ("sem-registro", 0, 0.0)]),
            "o dia 19": ((DIA_19, DIA_19), []),
            "sem fim": ((DIA_21, None), [("registro-no-periodo", 1, 0.5)]),
        }
        for nome, ((de, ate), esperadas) in casos.items():
            with self.subTest(nome):
                linhas = custos.linhas(fila, de, ate, "all")
                self.assertEqual([(linha["jobId"], linha["matchedRecords"], linha["costs"]["totalUsd"]) for linha in linhas], esperadas)

    def test_as_linhas_vem_do_envio_mais_novo_ao_mais_velho_e_o_sem_data_por_ultimo(self):
        fila = FilaDosCustos(
            {"item": {"jobId": "sem-data"}, "pedido": {}},
            {"item": {"jobId": "dia-19", "ficha": FICHA_GUARDADA_RU}},
            {"item": {"jobId": "dia-20"}, "pedido": PEDIDO},
            {"item": {"jobId": "dia-20-mais-tarde"}, "pedido": dict(PEDIDO, createdAt="2026-10-20T11:00:00Z")},
        )
        linhas = custos.linhas(fila, None, None, "all")
        self.assertEqual([linha["jobId"] for linha in linhas], ["dia-20-mais-tarde", "dia-20", "dia-19", "sem-data"])


if __name__ == "__main__":
    unittest.main()

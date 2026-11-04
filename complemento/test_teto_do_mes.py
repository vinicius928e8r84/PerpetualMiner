"""O teto do mês (#160), visto de fora: vem ligado com US$ 10, conta o gasto da chave no mês (inclusive a imagem gerada quando o texto
foi pelo plano), pausa o Envio antes do próximo Cartão quando chega, e o Envio continua sozinho quando a pessoa sobe o teto ou o mês
vira. O teto é deste computador: fica na pasta de dados da Conexão. O desenho: `docs/design/teto-do-mes.md`.

    python3.9 complemento/test_teto_do_mes.py
"""

import copy
import json
import os
import sys
import tempfile
import time
import unittest
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.test_envio import ID, OUTRO_ID, EnvioNoTeste, chats, pedido  # noqa: E402
from complemento.test_envio_retomada import TRES_FRASES  # noqa: E402
from complemento.test_servidor import ConexaoNoTeste, ler_o_contrato, semear_a_fila  # noqa: E402

DUAS_FRASES = ("give up : She gave up smoking", "keep running : They keep running")
NO_TETO = {"reason": "monthly_cap"}
DIA_20 = date(2026, 10, 20)
FILA_DO_PLANO = "um Envio de dois Cartões feitos pelo plano do ChatGPT"


def registro(dia, tipo, custo, **campos):
    return dict({"date": dia, "type": tipo, "cost_usd": custo, "keyword": "1760270400001-0"}, **campos)


def fila_com_gasto(*registros):
    """Um Envio de outro dia, já terminado, com os registros de custo dados (a base é a fila do contrato)."""
    fila = copy.deepcopy(ler_o_contrato()["filas"][FILA_DO_PLANO])
    fila[0]["custos"] = list(registros)
    return fila


def teto_de(conexao):
    status, _, corpo = conexao.pedir("POST", "/custos/teto", corpo={})
    return status, json.loads(corpo)


def definir_o_teto(conexao, valor):
    status, _, corpo = conexao.pedir("POST", "/custos/teto/definir", corpo={"limitUsd": valor})
    return status, json.loads(corpo)


def esperando_o_teto(estado):
    return estado.get("waiting") == NO_TETO


class Relogio:
    """O dia de hoje da Conexão, que o teste vira."""

    def __init__(self, dia):
        self.dia = dia

    def __call__(self):
        return self.dia


class EnvioNoTetoDoMes(EnvioNoTeste):
    """Uma Conexão com a thread de trabalho ligada, a espera do teto curta e `teto` dólares já postos (sem ele, vale o padrão)."""

    def __init__(self, pasta, **argumentos):
        argumentos.setdefault("espera_do_teto", 0.02)
        super().__init__(pasta, **argumentos)


class OTetoDoMesVemLigado(unittest.TestCase):
    def test_o_teto_vem_ligado_com_dez_dolares_e_ainda_nao_ha_gasto(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, hoje=Relogio(DIA_20)) as conexao:
            resposta = teto_de(conexao)
            arquivos = os.listdir(pasta)
        self.assertEqual(resposta, (200, {"limitUsd": 10.0, "spentUsd": 0.0, "month": "2026-10"}))
        self.assertNotIn("teto-do-mes.json", arquivos)  # o padrão não é gravado: só o que a pessoa escolhe

    def test_o_gasto_e_o_da_chave_no_mes_e_o_mes_anterior_nao_conta(self):
        gastos = fila_com_gasto(registro("2026-10-12", "tokens", 8.3), registro("2026-09-30", "tokens", 5.0))
        with tempfile.TemporaryDirectory() as pasta:
            semear_a_fila(pasta, gastos)
            with ConexaoNoTeste(pasta, hoje=Relogio(DIA_20)) as conexao:
                resposta = teto_de(conexao)
        self.assertEqual(resposta, (200, {"limitUsd": 10.0, "spentUsd": 8.3, "month": "2026-10"}))

    def test_o_teto_conta_a_imagem_gerada_quando_o_texto_vai_pelo_plano_e_nao_conta_o_que_o_plano_nao_cobra(self):
        gastos = fila_com_gasto(
            registro("2026-10-12", "plan_tokens", 0.0, would_cost_usd=0.5), registro("2026-10-12", "image", 0.04, source="dalle"),
            registro("2026-10-12", "image", 0.0, source="google"),
        )
        with tempfile.TemporaryDirectory() as pasta:
            semear_a_fila(pasta, gastos)
            with ConexaoNoTeste(pasta, hoje=Relogio(DIA_20)) as conexao:
                resposta = teto_de(conexao)
        self.assertEqual(resposta, (200, {"limitUsd": 10.0, "spentUsd": 0.04, "month": "2026-10"}))

    def test_o_gasto_de_varios_envios_do_mes_soma(self):
        um, outro = fila_com_gasto(registro("2026-10-03", "tokens", 1.25))[0], copy.deepcopy(fila_com_gasto(registro("2026-10-10", "tokens", 2.5))[0])
        outro["job"].update(jobId="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")
        outro["state"].update(jobId="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")
        with tempfile.TemporaryDirectory() as pasta:
            semear_a_fila(pasta, [um, outro])
            with ConexaoNoTeste(pasta, hoje=Relogio(DIA_20)) as conexao:
                _, resposta = teto_de(conexao)
        self.assertEqual(resposta["spentUsd"], 3.75)


class SubirOTeto(unittest.TestCase):
    def test_subir_o_teto_fica_guardado_neste_computador_e_vale_depois_de_a_conexao_reiniciar(self):
        with tempfile.TemporaryDirectory() as pasta:
            with ConexaoNoTeste(pasta, hoje=Relogio(DIA_20)) as conexao:
                resposta = definir_o_teto(conexao, 15)
            with open(os.path.join(pasta, "teto-do-mes.json"), encoding="utf-8") as arquivo:
                guardado = json.load(arquivo)
            with ConexaoNoTeste(pasta, hoje=Relogio(DIA_20)) as conexao:
                depois = teto_de(conexao)
        self.assertEqual(resposta, (200, {"limitUsd": 15.0, "spentUsd": 0.0, "month": "2026-10"}))
        self.assertEqual((guardado, depois[1]["limitUsd"]), ({"limitUsd": 15.0}, 15.0))

    def test_o_valor_que_nao_e_positivo_e_recusado_e_o_teto_guardado_nao_muda(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, teto=12) as conexao:
            recusas = [definir_o_teto(conexao, valor) for valor in (0, -3, "dez", None, True, float("inf"), 1e12)]
            sem_valor = conexao.pedir("POST", "/custos/teto/definir", corpo={})[0]
            depois = teto_de(conexao)[1]["limitUsd"]
        self.assertEqual(recusas, [(400, {"error": "invalid_request"})] * 7)
        self.assertEqual((sem_valor, depois), (400, 12.0))

    def test_o_teto_fica_com_dois_decimais(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            _, resposta = definir_o_teto(conexao, 12.345)
        self.assertEqual(resposta["limitUsd"], 12.35)


class NoTetoOEnvioPausaAntesDoProximoCartao(unittest.TestCase):
    def test_ao_chegar_no_teto_o_envio_pausa_sem_falhar_antes_de_gastar_a_chave_com_o_proximo_cartao(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTetoDoMes(pasta, teto=0.04) as conexao:
            conexao.criar(pedido(ID, *DUAS_FRASES))
            pausado = conexao.esperar(ID, esperando_o_teto)
            time.sleep(0.2)
            pedidos, notas = len(chats(conexao.openai)), len(conexao.conexao.colecao.gravadas)
            ainda = conexao.estado(ID)
        self.assertEqual((pausado["status"], pausado["lastError"], ainda["waiting"]), ("running", None, NO_TETO))
        self.assertEqual(sorted(c["status"] for c in ainda["cards"].values()), ["added", "pending"])
        self.assertEqual((pedidos, notas), (1, 1))  # o primeiro Cartão foi feito; o segundo nem foi pedido

    def test_abaixo_do_teto_o_envio_segue_sem_esperar(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTetoDoMes(pasta) as conexao:
            conexao.criar(pedido(ID, *DUAS_FRASES))
            fim = conexao.esperar(ID)
        self.assertEqual((fim["status"], "waiting" in fim), ("completed", False))

    def test_o_teto_ja_cheio_pausa_o_envio_antes_do_primeiro_cartao(self):
        gastos = fila_com_gasto(registro("2026-10-12", "tokens", 10.0))
        with tempfile.TemporaryDirectory() as pasta:
            semear_a_fila(pasta, gastos)
            with EnvioNoTetoDoMes(pasta, hoje=Relogio(DIA_20)) as conexao:
                conexao.criar(pedido(OUTRO_ID, DUAS_FRASES[0]))
                pausado = conexao.esperar(OUTRO_ID, esperando_o_teto)
                pedidos = len(chats(conexao.openai))
        self.assertEqual((pausado["status"], pedidos), ("running", 0))

    def test_subir_o_teto_retoma_o_envio_sozinho_sem_refazer_o_cartao_pronto(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTetoDoMes(pasta, teto=0.04, espera_do_teto=300) as conexao:
            conexao.criar(pedido(ID, *DUAS_FRASES))
            conexao.esperar(ID, esperando_o_teto)
            resposta = definir_o_teto(conexao, 5)
            fim = conexao.esperar(ID)
            pedidos, notas = len(chats(conexao.openai)), len(conexao.conexao.colecao.gravadas)
        self.assertEqual(resposta[0], 200)
        self.assertEqual((fim["status"], fim["lastError"], "waiting" in fim), ("completed", None, False))
        self.assertEqual((pedidos, notas), (2, 2))

    def test_subir_o_teto_para_menos_do_que_ja_gastou_mantem_o_envio_pausado(self):
        gastos = fila_com_gasto(registro("2026-10-12", "tokens", 20.0))
        with tempfile.TemporaryDirectory() as pasta:
            semear_a_fila(pasta, gastos)
            with EnvioNoTetoDoMes(pasta, hoje=Relogio(DIA_20)) as conexao:
                conexao.criar(pedido(OUTRO_ID, DUAS_FRASES[0]))
                conexao.esperar(OUTRO_ID, esperando_o_teto)
                definir_o_teto(conexao, 15)
                time.sleep(0.3)
                ainda = conexao.estado(OUTRO_ID)
                pedidos = len(chats(conexao.openai))
        self.assertEqual((ainda["status"], ainda["waiting"], pedidos), ("running", NO_TETO, 0))

    def test_quando_o_mes_vira_o_envio_pausado_continua_sozinho(self):
        gastos = fila_com_gasto(registro("2026-10-12", "tokens", 10.0))
        relogio = Relogio(DIA_20)
        with tempfile.TemporaryDirectory() as pasta:
            semear_a_fila(pasta, gastos)
            with EnvioNoTetoDoMes(pasta, hoje=relogio) as conexao:
                conexao.criar(pedido(OUTRO_ID, DUAS_FRASES[0]))
                conexao.esperar(OUTRO_ID, esperando_o_teto)
                antes = teto_de(conexao)[1]
                relogio.dia = date(2026, 11, 1)
                fim = conexao.esperar(OUTRO_ID)
                depois = teto_de(conexao)[1]
        self.assertEqual((antes["spentUsd"], antes["month"]), (10.0, "2026-10"))
        self.assertEqual((fim["status"], "waiting" in fim), ("completed", False))
        self.assertEqual((depois["month"], depois["limitUsd"]), ("2026-11", 10.0))  # o teto fica; a conta do mês é que recomeça

    def test_o_apagar_tudo_encerra_o_envio_pausado_pelo_teto(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTetoDoMes(pasta, teto=0.04, espera_do_teto=300) as conexao:
            conexao.criar(pedido(ID, *DUAS_FRASES))
            conexao.esperar(ID, esperando_o_teto)
            pedidos = len(chats(conexao.openai))
            conexao.pedir("POST", "/jobs/apagar-frases", corpo={})
            fim = conexao.esperar(ID)
            time.sleep(0.2)
            depois = len(chats(conexao.openai))
        self.assertEqual((fim["status"], fim["lastError"], "waiting" in fim), ("failed", "frases_apagadas", False))
        self.assertEqual(depois, pedidos)

    def test_se_a_conexao_cai_com_o_envio_pausado_ela_volta_a_pausar_antes_de_gastar(self):
        with tempfile.TemporaryDirectory() as pasta:
            with EnvioNoTetoDoMes(pasta, teto=0.04, espera_do_teto=300) as conexao:
                conexao.criar(pedido(ID, *TRES_FRASES))
                conexao.esperar(ID, esperando_o_teto)
            with EnvioNoTetoDoMes(pasta, teto=0.04) as conexao:
                pausado = conexao.esperar(ID, esperando_o_teto)
                pedidos = len(chats(conexao.openai))
        self.assertEqual((pausado["status"], pedidos), ("running", 0))  # o gasto do mês ficou nos custos: a segunda Conexão nem pede o texto


if __name__ == "__main__":
    unittest.main()

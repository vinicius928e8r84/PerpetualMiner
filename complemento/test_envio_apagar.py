"""O Apagar tudo no Envio dentro da Conexão, visto de fora (complemento de `test_envio.py`): o que a thread de trabalho faz quando o
Apagar tudo chega com o Anki fechado ou no meio do Envio.

    python3.9 complemento/test_envio_apagar.py
"""

import os
import sys
import json
import tempfile
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.test_colecao_em_memoria import ColecaoEmMemoria  # noqa: E402
from complemento.test_envio import (  # noqa: E402
    FIM, ID, INGLES, LINHA, EnvioNoTeste, apagar_as_frases, chats, pedido,
)


class AConexaoQueSobeEsperaAExtensao(unittest.TestCase):
    """O Apagar tudo que não chegou à Conexão (o Anki estava fechado) chega antes de ela retomar o Envio: depois de subir,
    a thread espera um pedido de Envio da extensão (ou a espera acabar). `/health` não conta: o painel o pergunta antes de
    mandar o `apagar-frases` marcado."""

    def com_o_envio_parado_porque_o_anki_fechou(self, pasta, colecao):
        colecao.fechar()
        with EnvioNoTeste(pasta, colecao=colecao) as conexao:
            conexao.criar(pedido(ID, LINHA))
            conexao.esperar(ID, lambda estado: estado["stage"] == "wait_anki")
        colecao.abrir()  # o Anki reabre: é o que sobe a Conexão de novo

    def estado_no_disco(self, pasta):
        with open(os.path.join(pasta, "estado", ID + ".json"), encoding="utf-8") as arquivo:
            return json.load(arquivo)

    def test_o_apagar_tudo_que_chega_depois_da_subida_para_o_envio_antes_de_gastar_a_chave_e_de_criar_notas(self):
        colecao = ColecaoEmMemoria(INGLES)
        with tempfile.TemporaryDirectory() as pasta:
            self.com_o_envio_parado_porque_o_anki_fechou(pasta, colecao)
            with EnvioNoTeste(pasta, colecao=colecao, espera_do_contato=60.0) as conexao:
                conexao.pedir("GET", "/health")
                time.sleep(0.4)
                esperando = (self.estado_no_disco(pasta)["status"], len(chats(conexao.openai)), len(colecao.gravadas))
                apagar_as_frases(conexao)
                time.sleep(0.6)  # a thread, solta pelo apagar-frases, já podia ter retomado
                estado = self.estado_no_disco(pasta)
                gastos, notas = len(chats(conexao.openai)), len(colecao.gravadas)
        self.assertEqual(esperando, ("queued", 0, 0))
        self.assertEqual((estado["status"], estado["lastError"], estado["wiped"], gastos, notas), ("failed", "frases_apagadas", True, 0, 0))

    def test_sem_nenhum_pedido_da_extensao_o_envio_interrompido_retoma_sozinho_quando_a_espera_acaba(self):
        colecao = ColecaoEmMemoria(INGLES)
        with tempfile.TemporaryDirectory() as pasta:
            self.com_o_envio_parado_porque_o_anki_fechou(pasta, colecao)
            with EnvioNoTeste(pasta, colecao=colecao, espera_do_contato=0.5) as conexao:
                inicio = time.monotonic()
                while self.estado_no_disco(pasta)["status"] not in FIM and time.monotonic() - inicio < 15:
                    time.sleep(0.02)
                estado = self.estado_no_disco(pasta)
                notas = len(colecao.gravadas)
        self.assertEqual((estado["status"], notas), ("completed", 1))

    def test_um_pedido_de_envio_da_extensao_solta_a_espera_na_hora(self):
        colecao = ColecaoEmMemoria(INGLES)
        with tempfile.TemporaryDirectory() as pasta:
            self.com_o_envio_parado_porque_o_anki_fechou(pasta, colecao)
            with EnvioNoTeste(pasta, colecao=colecao, espera_do_contato=60.0) as conexao:
                time.sleep(0.3)
                parado = self.estado_no_disco(pasta)["status"]
                conexao.pedir("POST", "/jobs/list", corpo={})
                estado = conexao.esperar(ID)
        self.assertEqual(parado, "queued")
        self.assertEqual(estado["status"], "completed")


class OApagarTudoNoMeioDoEnvio(unittest.TestCase):
    def test_o_apagar_tudo_com_o_cartao_pago_esperando_o_anki_nao_conta_como_falha_ao_gravar(self):
        colecao = ColecaoEmMemoria(INGLES)
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao) as conexao:
            conexao.openai.antes_de_responder = lambda metodo, autorizacao: colecao.fechar()
            conexao.criar(pedido(ID, LINHA))
            conexao.esperar(ID, lambda estado: estado["stage"] == "wait_anki")
            apagar_as_frases(conexao)
            time.sleep(0.3)
            estado = conexao.estado(ID)
            registrado = conexao.log()
        erros = {cartao["error"] for cartao in estado["cards"].values()}
        self.assertEqual((estado["status"], estado["lastError"], estado["wiped"]), ("failed", "frases_apagadas", True))
        self.assertNotIn("anki_write_failed", erros)
        self.assertNotIn("o Anki não gravou o Cartão", registrado)


if __name__ == "__main__":
    unittest.main()

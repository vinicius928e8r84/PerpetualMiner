"""O Envio que parou porque a pessoa fechou o Anki, visto de fora (complemento de `test_envio.py`, #151): ao abrir, ele continua
sozinho; Continuar envio e Tentar de novo fazem só o que falta e nunca pagam a OpenAI por um Cartão que já está pronto.

    python3.9 complemento/test_envio_retomada.py
"""

import json
import os
import sys
import tempfile
import time
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.test_colecao_em_memoria import ColecaoEmMemoria  # noqa: E402
from complemento.test_envio import ID, INGLES, EnvioNoTeste, chats, pedido  # noqa: E402
from complemento.test_openai_de_mentira import _palavra_do_pedido  # noqa: E402

TRES_FRASES = (
    "give up : She gave up smoking",
    "keep running : They keep running",
    "better late : Better late than never",
)


class AnkiQueFechaDepoisDeNotasGravadas(ColecaoEmMemoria):
    """O Anki que a pessoa fecha no meio do Envio: depois de `notas` gravadas, a coleção deixa de estar disponível."""

    def __init__(self, descricao, notas):
        super().__init__(descricao)
        self.notas_ate_fechar = notas

    def gravar_cartao(self, *argumentos, **nomeados):
        resultado = super().gravar_cartao(*argumentos, **nomeados)
        if len(self.gravadas) >= self.notas_ate_fechar:
            self.fechar()
        return resultado


def esperar_ate(condicao, limite=15):
    fim = time.monotonic() + limite
    while time.monotonic() < fim:
        if condicao():
            return
        time.sleep(0.02)
    raise AssertionError("a condição não veio")


def palavras_pedidas(openai):
    """A Palavra de cada pedido de texto feito à OpenAI de mentira, na ordem."""
    return [_palavra_do_pedido(corpo["messages"]) for _, corpo in chats(openai)]


class OEnvioQueOAnkiFechadoParou(unittest.TestCase):
    def test_ao_abrir_o_anki_o_envio_continua_sozinho_sem_pagar_de_novo_um_cartao_pronto(self):
        colecao = AnkiQueFechaDepoisDeNotasGravadas(INGLES, notas=1)
        with tempfile.TemporaryDirectory() as pasta:
            with EnvioNoTeste(pasta, colecao=colecao) as conexao:
                conexao.criar(pedido(ID, *TRES_FRASES))
                parado = conexao.esperar(ID, lambda estado: estado["stage"] == "wait_anki")
                antes = palavras_pedidas(conexao.openai)
            # A Conexão morreu com o Anki. A pessoa o abre de novo: a Conexão sobe, com a mesma pasta de dados.
            colecao.notas_ate_fechar = 99
            colecao.abrir()
            with EnvioNoTeste(pasta, colecao=colecao) as conexao:
                final = conexao.esperar(ID)
                depois = palavras_pedidas(conexao.openai)
        self.assertEqual((parado["status"], antes), ("running", ["give up"]))  # um Cartão no Anki, o seguinte espera o Anki antes de pagar
        self.assertEqual((final["status"], len(colecao.gravadas)), ("completed", 3))
        self.assertEqual(depois, ["keep running", "better late"])  # só o que faltava: o Cartão que já estava no Anki não paga de novo

    def test_continuar_envio_com_o_envio_parado_so_diz_o_estado_e_nao_paga_a_openai(self):
        colecao = ColecaoEmMemoria(INGLES)
        colecao.fechar()
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao) as conexao:
            conexao.criar(pedido(ID, *TRES_FRASES))
            conexao.esperar(ID, lambda estado: estado["stage"] == "wait_anki")
            antes = len(chats(conexao.openai))
            status, _, resposta = conexao.pedir("POST", "/jobs/retry", corpo={"jobId": ID})
            time.sleep(0.2)
            depois = len(chats(conexao.openai))
        self.assertEqual((status, json.loads(resposta)), (200, {"jobId": ID, "status": "running"}))
        self.assertEqual(depois, antes)

    def test_tentar_de_novo_depois_da_retomada_refaz_so_o_cartao_que_falhou(self):
        colecao = AnkiQueFechaDepoisDeNotasGravadas(INGLES, notas=1)
        with tempfile.TemporaryDirectory() as pasta:
            with EnvioNoTeste(pasta, colecao=colecao) as conexao:
                conexao.criar(pedido(ID, *TRES_FRASES))
                esperar_ate(lambda: colecao.gravadas)
            colecao.notas_ate_fechar = 99
            colecao.abrir()
            with EnvioNoTeste(pasta, colecao=colecao) as conexao:
                conexao.openai.recusar_o_chat_de("keep running", 429, "rate_limit_exceeded")
                parcial = conexao.esperar(ID)
                antes = len(chats(conexao.openai))
                conexao.openai.recusar_o_chat_de("keep running", None, None)
                conexao.pedir("POST", "/jobs/retry", corpo={"jobId": ID})
                final = conexao.esperar(ID, lambda estado: estado["status"] == "completed")
                refeitos = palavras_pedidas(conexao.openai)[antes:]
        self.assertEqual((parcial["status"], len(parcial["failedPhraseIds"])), ("partial", 1))
        self.assertEqual(refeitos, ["keep running"])
        self.assertEqual((final["status"], len(colecao.gravadas)), ("completed", 3))


class APalavraDoCartaoFicaComoOCriarDecidiu(unittest.TestCase):
    def test_trocar_o_parser_entre_duas_voltas_nao_muda_a_palavra_do_cartao(self):
        colecao = ColecaoEmMemoria(INGLES)
        colecao.fechar()
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao) as conexao:
            conexao.criar(pedido(ID, "give up | quit : She gave up smoking"))
            conexao.esperar(ID, lambda estado: estado["stage"] == "wait_anki")
            parser = conexao.conexao.fila.motor.parser
            le = parser.parse_line
            le_ao_contrario = lambda entrada, linha: _com_as_palavras_ao_contrario(le(entrada, linha))  # noqa: E731
            with mock.patch.object(parser, "parse_line", side_effect=le_ao_contrario):  # uma atualização do complemento muda o parser
                colecao.abrir()
                final = conexao.esperar(ID)
            pedidas = palavras_pedidas(conexao.openai)
        self.assertEqual((final["status"], final["lastError"]), ("completed", None))
        self.assertEqual(pedidas, ["give up", "quit"])


def _com_as_palavras_ao_contrario(entrada):
    if entrada is not None:
        entrada.keywords = list(reversed(entrada.keywords))
    return entrada


if __name__ == "__main__":
    unittest.main()

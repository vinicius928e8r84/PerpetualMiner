"""A correção da Criação (#169, C4) sem a thread do Envio: ela pede à porta presa ao Envio (o pagador com a etapa da correção e o teto) e grava
na nota. A coleção é a em memória com uma frase escrita na Criação; o caminho inteiro, com o HTTP e o custo, está em `test_envio_correcao.py`.

    python3.9 complemento/test_correcao_da_criacao.py
"""

import logging
import os
import sys
import unittest
from types import SimpleNamespace

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import motor_do_envio
from complemento.correcao_da_criacao import CorrecaoDaCriacao, palavra_sem_a_pronuncia
from complemento.envio import EnvioEmAndamento
from complemento.ia_do_envio import SemQuemPague
from complemento.test_envio_correcao import CORRIGIDA, ESCRITA, campos, colecao_com_a_criacao

LOGGER = logging.getLogger("test_correcao_da_criacao")
LOGGER.addHandler(logging.NullHandler())
LOGGER.propagate = False


class PortaDeRoteiro:
    """A porta presa ao Envio de um teste: responde a correção com `resposta`, ou ninguém paga (`parado`), ou o teto chegou."""

    def __init__(self, resposta=CORRIGIDA, parado=None, teto=False):
        self.resposta, self.parado, self.teto, self.pedidos = resposta, parado, teto, []

    def teto_chegou(self):
        return self.teto

    def pedido_do_texto(self, config, etapa="texto"):
        self.pedidos.append(etapa)
        if self.parado:
            raise SemQuemPague(self.parado)
        return lambda sistema, mensagem, rotulo: self.resposta


def corrigir(colecao, porta, apagado=False, parada=None):
    motor = motor_do_envio.motor_do_complemento()
    pedido = {"lang": "en", "deckName": "Inglês", "jobId": "j1", "tts": {}}
    fila = SimpleNamespace(dados=SimpleNamespace(raiz="sem-pasta-do-dono"), pasta_dos_textos=lambda job_id: "textos",
                           pasta_dos_custos=lambda job_id: "custos", estado=lambda job_id: {"wiped": apagado})
    config = motor_do_envio.configuracao_do_motor(motor, fila, pedido)
    CorrecaoDaCriacao(fila, colecao, motor, LOGGER).corrigir(EnvioEmAndamento("j1", pedido, config, porta, None), parada)


class ACorrecaoPelaPortaDoEnvio(unittest.TestCase):
    def test_a_correcao_pede_a_porta_do_envio_com_a_etapa_da_correcao_e_grava_a_frase_corrigida_na_nota(self):
        colecao, porta = colecao_com_a_criacao(), PortaDeRoteiro()
        corrigir(colecao, porta)
        self.assertEqual(porta.pedidos, ["correcao"])
        self.assertEqual((campos(colecao)["Escrito antes"], campos(colecao)["Correção"]), (ESCRITA, CORRIGIDA))

    def test_sem_quem_pague_a_correcao_pula_sem_erro_e_a_nota_fica_como_estava(self):
        colecao = colecao_com_a_criacao()
        antes = dict(campos(colecao))
        corrigir(colecao, PortaDeRoteiro(parado="openai_key_missing"))
        self.assertEqual(campos(colecao), antes)

    def test_no_teto_com_as_frases_apagadas_ou_depois_de_uma_parada_nada_e_pedido(self):
        for caso, argumentos in (("teto", {"porta": PortaDeRoteiro(teto=True)}), ("apagado", {"porta": PortaDeRoteiro(), "apagado": True}),
                                 ("parada", {"porta": PortaDeRoteiro(), "parada": "openai_key_rejected"})):
            with self.subTest(caso=caso):
                colecao = colecao_com_a_criacao()
                antes = dict(campos(colecao))
                corrigir(colecao, **argumentos)
                self.assertEqual((argumentos["porta"].pedidos, campos(colecao)), ([], antes))

    def test_a_palavra_pedida_a_ia_vem_sem_a_pronuncia_que_o_campo_traz_depois_dela(self):
        self.assertEqual(palavra_sem_a_pronuncia("give up - /ɡɪv ʌp/"), "give up")
        self.assertEqual(palavra_sem_a_pronuncia("give up"), "give up")


if __name__ == "__main__":
    unittest.main()

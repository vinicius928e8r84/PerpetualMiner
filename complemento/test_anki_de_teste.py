import http.client
import json
import os
import socket
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import anki_de_teste, configuracao, inicio
from complemento.test_anki_de_mentira import AnkiDeMentira
from complemento.test_pareamento_de_mentira import ao_carregar_pareado, travar_o_item_de_login_do_computador

PORTA_DO_TESTE = anki_de_teste.VARIAVEL_DA_PORTA


def setUpModule():
    travar_o_item_de_login_do_computador()


def porta_livre():
    with socket.socket() as soquete:
        soquete.bind(("127.0.0.1", 0))
        return soquete.getsockname()[1]


def saude(porta):
    ligacao = http.client.HTTPConnection("127.0.0.1", porta, timeout=5)
    try:
        ligacao.request("GET", "/health")
        resposta = ligacao.getresponse()
        return resposta.status, json.loads(resposta.read())
    finally:
        ligacao.close()


def pasta_de_anki_de_teste(testcase, marcada=True):
    pasta = tempfile.TemporaryDirectory()
    testcase.addCleanup(pasta.cleanup)
    base = os.path.join(pasta.name, "base")
    os.makedirs(base)
    if marcada:
        open(os.path.join(base, anki_de_teste.MARCA), "w").close()
    return pasta.name, base


class APortaDoAnkiDeTeste(unittest.TestCase):
    def test_um_anki_sem_a_marca_na_pasta_de_dados_nunca_muda_de_porta_mesmo_com_a_variavel_no_ambiente(self):
        _, base = pasta_de_anki_de_teste(self, marcada=False)
        porta = anki_de_teste.porta_da_conexao({PORTA_DO_TESTE: "9123"}, base, configuracao.PORTA)
        self.assertEqual(porta, configuracao.PORTA)

    def test_um_anki_sem_pasta_de_dados_conhecida_fica_na_porta_do_dono(self):
        self.assertEqual(anki_de_teste.porta_da_conexao({PORTA_DO_TESTE: "9123"}, None, configuracao.PORTA), configuracao.PORTA)

    def test_o_anki_de_teste_usa_a_porta_que_a_prova_deu(self):
        _, base = pasta_de_anki_de_teste(self)
        self.assertEqual(anki_de_teste.porta_da_conexao({PORTA_DO_TESTE: "9123"}, base, configuracao.PORTA), 9123)

    def test_o_anki_de_teste_sem_porta_boa_nao_cai_na_8766(self):
        _, base = pasta_de_anki_de_teste(self)
        for ruim in (None, "", "abc", "0", "80", "70000", "-5", str(configuracao.PORTA), " 8766 "):
            with self.subTest(ruim=ruim):
                ambiente = {} if ruim is None else {PORTA_DO_TESTE: ruim}
                with self.assertRaises(anki_de_teste.PortaDeTesteInvalida):
                    anki_de_teste.porta_da_conexao(ambiente, base, configuracao.PORTA)


class OAnkiDeTesteAoIniciar(unittest.TestCase):
    def test_a_conexao_sobe_na_porta_dada_e_a_passagem_olha_so_para_ela(self):
        pasta, base = pasta_de_anki_de_teste(self)
        porta = porta_livre()
        vistas = []
        with patch.dict(os.environ, {PORTA_DO_TESTE: str(porta)}), patch(
            "complemento.do_computador.passagem", side_effect=lambda escolhida, p: vistas.append(p)
        ):
            conexao = inicio.iniciar(pasta, lambda: None, inicio.Arredores(abridor=None, pasta_base_do_anki=base))
        try:
            self.assertEqual((conexao.porta, saude(porta)[0], vistas), (porta, 200, [porta]))
        finally:
            conexao.parar()

    def test_o_abridor_do_anki_de_teste_conserta_so_o_que_ouve_a_porta_dele(self):
        pasta, base = pasta_de_anki_de_teste(self)
        porta = porta_livre()
        with patch.dict(os.environ, {PORTA_DO_TESTE: str(porta)}), patch("complemento.abridor.deste_computador", return_value=None) as deste:
            conexao = inicio.iniciar(pasta, lambda: None, inicio.Arredores(abridor=inicio.ABRIDOR_DESTE_COMPUTADOR, pasta_base_do_anki=base))
        try:
            self.assertEqual(deste.call_args.kwargs["porta"], porta)
        finally:
            conexao.parar()

    def test_o_anki_de_teste_sem_porta_boa_nao_sobe_a_conexao_e_o_log_diz_por_que(self):
        pasta, base = pasta_de_anki_de_teste(self)
        with patch.dict(os.environ, {PORTA_DO_TESTE: str(configuracao.PORTA)}), patch("socket.socket.bind", side_effect=AssertionError("não pode abrir porta")):
            conexao = inicio.iniciar(pasta, lambda: None, inicio.Arredores(abridor=None, pasta_base_do_anki=base))
        self.assertIsNone(conexao)
        with open(os.path.join(pasta, "user_files", "logs", "complemento.log"), encoding="utf-8") as log:
            self.assertIn("PortaDeTesteInvalida", log.read())

    def test_o_anki_do_dono_ignora_a_variavel_e_segue_a_porta_dos_arredores(self):
        pasta, base = pasta_de_anki_de_teste(self, marcada=False)
        porta_do_dono = porta_livre()
        with patch.dict(os.environ, {PORTA_DO_TESTE: str(porta_livre())}):
            conexao = inicio.iniciar(pasta, lambda: None, inicio.Arredores(porta=porta_do_dono, abridor=None, pasta_base_do_anki=base))
        try:
            self.assertEqual(conexao.porta, porta_do_dono)
        finally:
            conexao.parar()

    def test_o_anki_entrega_a_pasta_de_dados_dele_e_o_complemento_a_usa(self):
        pasta, base = pasta_de_anki_de_teste(self)
        porta = porta_livre()
        anki = AnkiDeMentira()
        anki.pm.base = base
        with patch.dict(os.environ, {PORTA_DO_TESTE: str(porta)}):
            conexao = ao_carregar_pareado(anki, pasta, abridor=None)
        try:
            self.assertEqual(conexao.porta, porta)
        finally:
            conexao.parar()


if __name__ == "__main__":
    unittest.main()

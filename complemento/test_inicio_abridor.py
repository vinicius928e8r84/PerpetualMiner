import json
import os
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import inicio
from complemento.test_colecao_em_memoria import ColecaoEmMemoria
from complemento.test_contrato_da_criacao import SO_O_DEFAULT
from complemento.test_pareamento_de_mentira import travar_o_item_de_login_do_computador


def setUpModule():
    travar_o_item_de_login_do_computador()


class AbridorDeMentira:
    def __init__(self, quebra=None):
        self.escritos = []
        self.quebra = quebra

    def escrever(self, perfil):
        if self.quebra is not None:
            raise self.quebra
        self.escritos.append(perfil)


def marcar(raiz, perfil):
    pasta = os.path.join(raiz, "complemento", "user_files")
    os.makedirs(pasta)
    with open(os.path.join(pasta, "perfil.json"), "w", encoding="utf-8") as arquivo:
        json.dump({"perfil": perfil}, arquivo)


def log_de(raiz):
    with open(os.path.join(raiz, "complemento", "user_files", "logs", "complemento.log"), encoding="utf-8") as log:
        return log.read()


class OAbridorAcompanhaOPerfil(unittest.TestCase):
    def iniciar(self, raiz, colecao, abridor, perfil_aberto=lambda: "Beto"):
        return inicio.iniciar(os.path.join(raiz, "complemento"), perfil_aberto, inicio.Arredores(porta=0, colecao=colecao, abridor=abridor))

    def test_ao_subir_o_abridor_recebe_o_perfil_marcado_e_cada_perfil_que_abre_o_escreve_de_novo(self):
        colecao = ColecaoEmMemoria(SO_O_DEFAULT, perfis=("Ana", "Beto"), perfil_aberto="Beto")
        abridor, ganchos = AbridorDeMentira(), []
        with tempfile.TemporaryDirectory() as raiz:
            conexao = inicio.iniciar(os.path.join(raiz, "complemento"), lambda: "Beto", inicio.Arredores(porta=0, colecao=colecao, abridor=abridor, ao_abrir_o_perfil=ganchos.append))
            subiu = list(abridor.escritos)
            ganchos[0]()
            conexao.ao_mudar_o_perfil()
            conexao.parar()
        self.assertEqual((subiu, abridor.escritos, len(ganchos)), (["Beto"], ["Beto", "Beto", "Beto"], 1))

    def test_o_perfil_marcado_que_o_anki_ja_nao_tem_deixa_o_abridor_sem_perfil(self):
        colecao = ColecaoEmMemoria(SO_O_DEFAULT, perfis=("Ana", "Beto"), perfil_aberto="Beto")
        abridor = AbridorDeMentira()
        with tempfile.TemporaryDirectory() as raiz:
            marcar(raiz, "Sumido")
            self.iniciar(raiz, colecao, abridor).parar()
        self.assertEqual(abridor.escritos, [None])

    def test_sem_a_lista_de_perfis_o_abridor_recebe_o_marcado_como_esta(self):
        colecao = ColecaoEmMemoria(SO_O_DEFAULT, perfis=("Ana", "Beto"), perfil_aberto="Beto")
        abridor = AbridorDeMentira()
        with patch.object(colecao, "perfis", side_effect=RuntimeError("o Anki não diz")), tempfile.TemporaryDirectory() as raiz:
            marcar(raiz, "Sumido")
            self.iniciar(raiz, colecao, abridor).parar()
        self.assertEqual(abridor.escritos, ["Sumido"])

    def test_com_a_lista_de_perfis_vazia_o_abridor_recebe_o_marcado_como_esta(self):
        colecao = ColecaoEmMemoria(SO_O_DEFAULT, perfis=("Ana",), perfil_aberto="Ana")
        abridor = AbridorDeMentira()
        with patch.object(colecao, "perfis", return_value=[]), tempfile.TemporaryDirectory() as raiz:
            marcar(raiz, "Sumido")
            self.iniciar(raiz, colecao, abridor).parar()
        self.assertEqual(abridor.escritos, ["Sumido"])

    def test_o_abridor_que_nao_escreve_e_dito_no_log_e_a_conexao_sobe(self):
        colecao = ColecaoEmMemoria(SO_O_DEFAULT, perfis=("Beto",), perfil_aberto="Beto")
        with tempfile.TemporaryDirectory() as raiz:
            conexao = self.iniciar(raiz, colecao, AbridorDeMentira(quebra=OSError("disco cheio")))
            subiu = conexao is not None
            if subiu:
                conexao.parar()
            registrado = log_de(raiz)
        self.assertTrue(subiu)
        self.assertIn("O abridor não foi escrito: disco cheio", registrado)

    def test_o_perfil_aberto_que_nao_se_le_e_dito_no_log_e_nem_a_colecao_nem_o_abridor_sao_tocados(self):
        colecao = ColecaoEmMemoria(SO_O_DEFAULT)
        abridor = AbridorDeMentira()

        def sem_perfil():
            raise RuntimeError("sem perfil")

        with tempfile.TemporaryDirectory() as raiz:
            conexao = self.iniciar(raiz, colecao, abridor, perfil_aberto=sem_perfil)
            subiu = conexao is not None
            if subiu:
                conexao.parar()
            registrado = log_de(raiz)
        self.assertTrue(subiu)
        self.assertIn("O perfil aberto não foi marcado: sem perfil", registrado)
        self.assertEqual((abridor.escritos, colecao.nomes_dos_baralhos()), ([], ["Default"]))

    def test_sem_abridor_a_colecao_e_preparada_e_nada_e_escrito(self):
        colecao = ColecaoEmMemoria(SO_O_DEFAULT)
        with tempfile.TemporaryDirectory() as raiz:
            self.iniciar(raiz, colecao, None, perfil_aberto=lambda: "Usuário 1").parar()
            registrado = log_de(raiz)
        self.assertEqual(sorted(colecao.nomes_dos_baralhos()), ["Default", "PerpetualMiner::Inglês", "PerpetualMiner::Russo"])
        self.assertNotIn("O abridor não foi escrito", registrado)

    def test_o_gancho_do_anki_que_quebra_e_dito_no_log_e_a_conexao_sobe(self):
        colecao = ColecaoEmMemoria(SO_O_DEFAULT)

        def gancho_que_quebra(_):
            raise RuntimeError("o Anki mudou")

        with tempfile.TemporaryDirectory() as raiz:
            conexao = inicio.iniciar(os.path.join(raiz, "complemento"), lambda: "Usuário 1", inicio.Arredores(porta=0, colecao=colecao, abridor=None, ao_abrir_o_perfil=gancho_que_quebra))
            subiu = conexao is not None
            if subiu:
                conexao.parar()
            registrado = log_de(raiz)
        self.assertTrue(subiu)
        self.assertIn("O perfil e o abridor não vão acompanhar o perfil que abrir", registrado)


if __name__ == "__main__":
    unittest.main()

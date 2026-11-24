"""A montagem das peças da Conexão: cada peça nasce uma vez, no ambiente pedido, e a `Conexao` as recebe prontas.

    python3.9 complemento/test_montagem_da_conexao.py
"""

import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import pasta_de_dados, registro, servidor
from complemento.colecao_vazia import SemColecao
from complemento.esperas import Esperas
from complemento.montagem_da_conexao import Ambiente, Fronteiras, Porta, montar
from complemento.servicos_de_fora import ServicosDeFora
from complemento.test_colecao_em_memoria import ColecaoEmMemoria


class AsPecasDaConexao(unittest.TestCase):
    def setUp(self):
        pasta = tempfile.TemporaryDirectory()
        self.addCleanup(pasta.cleanup)
        self.dados = pasta_de_dados.preparar(pasta.name)
        self.logger = registro.criar(self.dados.logs)
        self.addCleanup(lambda: [handler.close() for handler in list(self.logger.handlers)])
        self.ambiente = Ambiente(self.dados, self.logger, "9.9.9")

    def montar(self, **fronteiras):
        return montar(self.ambiente, ServicosDeFora(openai="http://127.0.0.1:1"), Esperas(), Fronteiras(**fronteiras))

    def test_as_esperas_levam_o_teto_do_mes_que_a_conexao_confere(self):
        pecas = self.montar()
        self.assertIs(pecas.esperas.teto, pecas.teto)

    def test_a_cada_montagem_as_esperas_cortam_so_o_trabalho_dela(self):
        primeira, segunda = self.montar(), self.montar()
        primeira.esperas.parar.set()
        self.assertFalse(segunda.esperas.parar.is_set())

    def test_sem_colecao_a_conexao_nasce_sem_colecao(self):
        self.assertIsInstance(self.montar().colecao, SemColecao)

    def test_a_colecao_que_o_anki_da_fica_com_o_perfil_marcado_da_conexao(self):
        colecao = ColecaoEmMemoria({"baralhos": []})
        pecas = self.montar(colecao=colecao)
        self.assertIs(pecas.colecao, colecao)

    def test_a_atualizacao_que_a_fronteira_traz_vale_no_lugar_da_do_computador(self):
        propria = object()
        self.assertIs(self.montar(atualizacao=propria).atualizacao, propria)

    def test_sem_trabalhador_so_a_fila_para(self):
        pecas = self.montar()
        parada = pecas.sem_trabalhador()
        self.assertIsNotNone(pecas.trabalhador)
        self.assertIsNone(parada.trabalhador)
        self.assertIs(parada.fila, pecas.fila)

    def test_a_conexao_recebe_as_pecas_e_responde_no_endereco_dos_servicos(self):
        pecas = self.montar()
        conexao = servidor.Conexao(Porta(0), pecas.sem_trabalhador(), lambda: "Usuário 1")
        self.assertEqual((conexao.versao, conexao.openai_base, conexao.fila, conexao.cofre), ("9.9.9", "http://127.0.0.1:1", pecas.fila, pecas.cofre))


if __name__ == "__main__":
    unittest.main()

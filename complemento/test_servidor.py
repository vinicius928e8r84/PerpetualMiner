import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import configuracao
from test_harness import ORIGEM, CONTRATO, ConexaoNoTeste, conexao_do_exemplo, deve_repetir, exemplos_do_contrato
from complemento.test_comparar_com_o_contrato import igual_ao_do_contrato
from complemento.test_estado_guardado import PedidoFeito, confere_a_repeticao, estado_guardado
from complemento.test_pareamento_de_mentira import pedir_como_o_exemplo
from test_harness import tearDownModule


def grava_onde_a_pasta_e_so_de_leitura():
    return os.name == "nt" or os.geteuid() == 0


class ContratoDaConexao(unittest.TestCase):
    def test_cada_exemplo_do_contrato_tem_a_resposta_combinada(self):
        for exemplo in exemplos_do_contrato():
            with self.subTest(exemplo["nome"]), tempfile.TemporaryDirectory() as pasta:
                contexto = exemplo["contexto"]
                if contexto.get("cofre") == "sem_escrita" and grava_onde_a_pasta_e_so_de_leitura():
                    self.skipTest("quem é root, ou o Windows, grava onde a pasta é só de leitura")
                with conexao_do_exemplo(pasta, exemplo) as conexao:
                    pedido = exemplo["pedido"]
                    resposta = pedir_como_o_exemplo(conexao, pedido)
                    status, _, corpo = resposta
                    repetir = deve_repetir(exemplo)
                    primeiro = PedidoFeito(resposta, estado_guardado(conexao)) if repetir else None
                    segundo = PedidoFeito(pedir_como_o_exemplo(conexao, pedido), estado_guardado(conexao)) if repetir else None
                self.assertEqual(status, exemplo["resposta"]["status"])
                self.assertTrue(
                    igual_ao_do_contrato(json.loads(corpo), exemplo["resposta"]["json"]),
                    'O complemento e o contrato (complemento/contrato/exemplos.json) se separaram no exemplo "%s". '
                    "Se a mudança é de propósito, atualize o exemplo; o fake da Conexão do e2e lê o mesmo arquivo."
                    % exemplo["nome"] + " Obtido: %s" % corpo.decode("utf-8"),
                )
                if segundo:
                    confere_a_repeticao(self, exemplo, primeiro, segundo)

    def test_o_contrato_tem_a_origem_da_extensao_que_o_complemento_aceita(self):
        with open(CONTRATO, encoding="utf-8") as arquivo:
            self.assertEqual(json.load(arquivo)["origemDaExtensao"], ORIGEM)


class SaudeDaConexao(unittest.TestCase):
    def test_saude_traz_a_versao_do_complemento_e_o_perfil_aberto(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, perfil="Maria") as conexao:
            status, _, corpo = conexao.pedir("GET", "/health")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(corpo), {"ok": True, "versao": configuracao.VERSAO, "perfil": "Maria"})

    def test_saude_acompanha_o_perfil_que_o_anki_abre_depois(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, perfil=None) as conexao:
            antes = json.loads(conexao.pedir("GET", "/health")[2])["perfil"]
            conexao.perfil = "Maria"
            depois = json.loads(conexao.pedir("GET", "/health")[2])["perfil"]
        self.assertEqual((antes, depois), (None, "Maria"))


if __name__ == "__main__":
    unittest.main()

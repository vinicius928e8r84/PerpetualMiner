import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import baralhos
from complemento.test_colecao_em_memoria import ColecaoEmMemoria
from complemento.test_conserto import PID, Mundo
from complemento.test_harness import ConexaoNoTeste

CURL_DE_VERDADE = "/usr/bin/curl"


class AnkiSemResposta(ColecaoEmMemoria):
    def perfis(self):
        raise baralhos.ColecaoIndisponivel("anki_busy")


@unittest.skipUnless(os.path.exists(CURL_DE_VERDADE), "o script do Mac roda num sh com o curl de verdade")
@unittest.skipIf(os.name == "nt", "o script do Mac roda num sh")
class ConsertarComAConexaoDeVerdade(unittest.TestCase):
    def setUp(self):
        self._raiz = tempfile.TemporaryDirectory()
        self.mundo = Mundo(self._raiz.name)
        self.mundo.programas["curl"] = CURL_DE_VERDADE

    def tearDown(self):
        self._raiz.cleanup()

    def consertar_com(self, colecao):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, perfil="Ana", colecao=colecao) as conexao:
            situacao = self.mundo.consertar(porta=conexao.conexao.porta)
            marcado = os.path.exists(os.path.join(pasta, "perfil.json"))
        return situacao, marcado

    def test_anki_saudavel_responde_e_nao_e_fechado_nem_aberto_de_novo(self):
        situacao, _ = self.consertar_com(ColecaoEmMemoria(None, perfis=("Ana", "Beto"), perfil_aberto="Ana"))
        self.assertEqual(situacao, {"situacao": "respondeu"})
        self.assertEqual(self.mundo.passos(), [])

    def test_perguntar_se_a_conexao_responde_nao_marca_o_perfil_fixo(self):
        _, marcado = self.consertar_com(ColecaoEmMemoria(None, perfis=("Ana", "Beto"), perfil_aberto="Ana"))
        self.assertFalse(marcado)

    def test_anki_com_a_thread_principal_travada_espera_30_s_e_so_entao_e_fechado_e_aberto(self):
        situacao, _ = self.consertar_com(AnkiSemResposta(None, perfis=("Ana",), perfil_aberto="Ana"))
        self.assertEqual(situacao, {"situacao": "reiniciado"})
        self.assertEqual(self.mundo.passos()[0], "esperou 30 s")
        self.assertEqual([p for p in self.mundo.passos() if p.startswith("kill ")], ["kill -KILL %d" % PID])


if __name__ == "__main__":
    unittest.main()

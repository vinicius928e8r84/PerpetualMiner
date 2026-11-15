"""O abridor que conserta sozinho (#152) falando com a Conexão **de verdade**: o `curl` do Mac é o de verdade e a Conexão é o servidor real.

    python3.9 complemento/test_conserto_conexao_real.py

Os outros testes do consertar usam um `curl` de mentira que responde o que o teste mandar, e por isso nunca viram que a pergunta "a Conexão
responde?" voltava 401 do porteiro (o pedido não é assinado: o script não é um navegador pareado). Aqui o script do Mac (`sh`) pergunta
a um `servidor.Conexao` real, numa porta livre; só o `ps`, o `lsof`, o `kill`, o `sleep`, o `date` e o `open` seguem de mentira (nenhum processo
de verdade é fechado, nenhum Anki é aberto).
"""

import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import baralhos  # noqa: E402
from complemento.test_colecao_em_memoria import ColecaoEmMemoria  # noqa: E402
from complemento.test_conserto import PID, Mundo  # noqa: E402
from complemento.test_servidor import ConexaoNoTeste  # noqa: E402

CURL_DE_VERDADE = "/usr/bin/curl"


class AnkiSemResposta(ColecaoEmMemoria):
    """O Anki com a thread principal travada: a leitura de perfis estoura o tempo, como o `no_anki.py` faz."""

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

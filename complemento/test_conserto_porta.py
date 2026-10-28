"""O abridor que conserta sozinho (#152), a porta da Conexão: só se fecha à força o Anki que é dono dela, e só os pids que a ouvem.

    python3.9 complemento/test_conserto_porta.py

O mundo de mentira (`Mundo`) é o de `test_conserto.py`: `lsof` de mentira diz quem ouve a porta e o `ps` lista o Anki (e, se o teste
quiser, mais um processo que roda o mesmo programa). Nenhum processo de verdade é fechado, nenhum Anki é aberto.
"""

import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.test_conserto import PID, Mundo  # noqa: E402


@unittest.skipIf(os.name == "nt", "o script do Mac roda num sh")
class NoMacComAPorta(unittest.TestCase):
    def setUp(self):
        self._raiz = tempfile.TemporaryDirectory()
        self.mundo = Mundo(self._raiz.name)

    def tearDown(self):
        self._raiz.cleanup()

    def test_porta_ocupada_por_outro_programa_nao_mata_o_anki_saudavel_e_diz_que_a_conexao_esta_fora(self):
        self.mundo.porta_ouvida_por(9999)
        self.assertEqual(self.mundo.consertar(), {"situacao": "falhou", "motivo": "conexao_fora"})
        self.assertEqual(self.mundo.passos(), ["esperou 30 s"])

    def test_ninguem_ouvindo_na_porta_tambem_nao_mata_o_anki(self):
        self.mundo.porta_ouvida_por()
        self.assertEqual(self.mundo.consertar(), {"situacao": "falhou", "motivo": "conexao_fora"})
        self.assertNotIn("kill", " ".join(self.mundo.passos()))

    def test_so_mata_o_anki_depois_de_ver_que_e_ele_quem_ouve_a_porta_da_conexao(self):
        self.assertEqual(self.mundo.consertar(), {"situacao": "reiniciado"})
        lsof = [linha for linha in self.mundo.eventos() if linha.startswith("lsof ")]
        self.assertEqual(lsof, ["lsof -nP -iTCP:8766 -sTCP:LISTEN -t"])
        self.assertLess(self.mundo.eventos().index(lsof[0]), self.mundo.eventos().index("kill -KILL %d" % PID))

    def test_porta_dividida_entre_o_anki_e_outro_programa_nao_mata_o_anki_porque_nem_todos_os_ouvintes_sao_dele(self):
        self.mundo.porta_ouvida_por(9999, PID)
        self.assertEqual(self.mundo.consertar(), {"situacao": "falhou", "motivo": "conexao_fora"})
        self.assertEqual(self.mundo.passos(), ["esperou 30 s"])

    def test_o_mesmo_pid_ouvindo_em_ipv4_e_ipv6_ainda_e_so_o_anki_e_recebe_um_kill_so(self):
        self.mundo.porta_ouvida_por(PID, PID)
        self.assertEqual(self.mundo.consertar(), {"situacao": "reiniciado"})
        self.assertEqual([p for p in self.mundo.passos() if p.startswith("kill ")], ["kill -KILL %d" % PID])

    def test_mata_so_o_pid_que_ouve_a_porta_e_nao_os_outros_processos_que_rodam_o_mesmo_programa(self):
        self.mundo.outro_processo_do_anki(7777)
        self.assertEqual(self.mundo.consertar(), {"situacao": "reiniciado"})
        self.assertEqual([p for p in self.mundo.passos() if p.startswith("kill ")], ["kill -KILL %d" % PID])

    def test_anki_que_some_entre_a_ultima_conferencia_e_a_do_dono_da_porta_e_dado_como_fechou_e_nao_como_conexao_fora(self):
        # Com espera 0 o consertar lê o ps: 1) no começo, 2) no laço, 3) depois dele, 4) para achar quem ouve a porta.
        self.mundo.anki_some_na_chamada_do_ps(4)
        self.assertEqual(self.mundo.consertar(espera_s=0), {"situacao": "fechou"})
        self.assertNotIn("kill", " ".join(self.mundo.passos()))
        self.assertNotIn("open", " ".join(self.mundo.passos()))


if __name__ == "__main__":
    unittest.main()

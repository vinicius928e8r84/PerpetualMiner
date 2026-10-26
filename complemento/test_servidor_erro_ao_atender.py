"""Os erros de um pedido que o servidor da Conexão não deve pôr no log do Anki (complemento de `test_servidor.py`).

    python3.9 complemento/test_servidor_erro_ao_atender.py
"""

import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.test_servidor import ConexaoNoTeste  # noqa: E402


class OErroAoAtender(unittest.TestCase):
    def erro_ao_atender(self, conexao, erro):
        """Entrega ao servidor real um erro de pedido, como o `socketserver` faz, e devolve o que o log ganhou."""
        antes = conexao.log()
        try:
            raise erro
        except Exception:
            conexao.conexao._servidor.handle_error(None, ("127.0.0.1", 50000))
        return conexao.log()[len(antes):]

    def test_o_anki_fechando_nao_enche_o_log_de_erros(self):
        original = sys.excepthook
        with tempfile.TemporaryDirectory() as pasta:
            with ConexaoNoTeste(pasta) as conexao:
                sys.excepthook = None  # o interpretador no fim: nenhuma thread nova nasce
                try:
                    acrescentado = self.erro_ao_atender(conexao, RuntimeError("sys.excepthook is None"))
                finally:
                    sys.excepthook = original
        self.assertEqual(acrescentado, "")

    def test_cliente_que_fecha_a_conexao_antes_da_resposta_nao_vira_erro_com_traceback(self):
        with tempfile.TemporaryDirectory() as pasta:
            with ConexaoNoTeste(pasta) as conexao:
                acrescentado = self.erro_ao_atender(conexao, BrokenPipeError(32, "Broken pipe"))
        self.assertNotIn("Traceback", acrescentado)
        self.assertNotIn("ERROR", acrescentado)

    def test_erro_de_verdade_ao_atender_continua_no_log_com_o_traceback(self):
        with tempfile.TemporaryDirectory() as pasta:
            with ConexaoNoTeste(pasta) as conexao:
                acrescentado = self.erro_ao_atender(conexao, ValueError("falha de verdade"))
        self.assertIn("ERROR Erro ao atender", acrescentado)
        self.assertIn("falha de verdade", acrescentado)


if __name__ == "__main__":
    unittest.main()

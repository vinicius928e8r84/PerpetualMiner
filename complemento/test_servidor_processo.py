"""Dentro do Anki a Conexão não mexe no processo (complemento de `test_servidor.py`).

    python3.9 complemento/test_servidor_processo.py
"""

import contextlib
import io
import os
import socket
import sys
import tempfile
import threading
import unittest
import warnings

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.test_servidor import ConexaoNoTeste  # noqa: E402

VARIAVEIS_DE_PROXY = ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "all_proxy", "no_proxy")


class ProcessoDoAnki(unittest.TestCase):
    """Dentro do Anki a Conexão não mexe no processo e nenhum erro abre o diálogo dele."""

    def estado_do_processo(self):
        return {
            "proxy": {nome: os.environ.get(nome) for nome in VARIAVEIS_DE_PROXY},
            "stdout": sys.stdout,
            "stderr": sys.stderr,
            "excepthook": sys.excepthook,
            "thread_excepthook": threading.excepthook,
            "avisos": list(warnings.filters),
            "mostrar_aviso": warnings.showwarning,
            "tempo_do_socket": socket.getdefaulttimeout(),
        }

    def test_subir_atender_e_parar_nao_troca_proxy_stdout_stderr_excepthook_nem_avisos(self):
        antes = self.estado_do_processo()
        with tempfile.TemporaryDirectory() as pasta:
            with ConexaoNoTeste(pasta) as conexao:
                conexao.pedir("GET", "/health")
                conexao.pedir("GET", "/nao-existe")
                conexao.pedir("GET", "/health", origem="https://exemplo.com")
        self.assertEqual(self.estado_do_processo(), antes)

    def test_erro_dentro_de_uma_rota_vai_ao_log_do_complemento_e_a_nenhum_outro_lugar(self):
        chamadas_do_excepthook = []
        original = sys.excepthook
        sys.excepthook = lambda *dados: chamadas_do_excepthook.append(dados)
        saida, erro = io.StringIO(), io.StringIO()
        try:
            with tempfile.TemporaryDirectory() as pasta:
                with contextlib.redirect_stdout(saida), contextlib.redirect_stderr(erro):
                    with ConexaoNoTeste(pasta, falha_no_perfil=True) as conexao:
                        conexao.pedir("GET", "/health")  # a resposta 500 é o exemplo do contrato
                        registrado = conexao.log()
        finally:
            sys.excepthook = original
        self.assertIn("perfil ilegível", registrado)
        self.assertEqual((saida.getvalue(), erro.getvalue(), chamadas_do_excepthook), ("", "", []))

    def test_pedido_quebrado_vai_ao_log_e_nao_ao_stderr(self):
        erro = io.StringIO()
        with tempfile.TemporaryDirectory() as pasta, contextlib.redirect_stderr(erro):
            with ConexaoNoTeste(pasta) as conexao:
                bruto = socket.create_connection(("127.0.0.1", conexao.conexao.porta), timeout=5)
                bruto.sendall(b"\x16\x03\x01 isto nao e http\r\n\r\n")
                bruto.recv(4096)
                bruto.close()
                conexao.pedir("GET", "/health")
                registrado = conexao.log()
        self.assertEqual(erro.getvalue(), "")
        self.assertIn("http: code 400, message Bad Request", registrado)  # o texto da biblioteca, sem a linha do pedido
        self.assertNotIn("isto nao e http", registrado)


if __name__ == "__main__":
    unittest.main()

"""A origem dos pedidos à Conexão, vista de fora (parte de `test_servidor.py`): só a extensão é atendida, e o resto recebe 403.

    python3.9 complemento/test_servidor_origem.py
"""

import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.test_servidor import ORIGEM, ConexaoNoTeste  # noqa: E402


class OrigemDosPedidos(unittest.TestCase):
    def test_a_extensao_recebe_a_resposta_com_a_origem_dela_liberada(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            _, cabecalhos, _ = conexao.pedir("GET", "/health")
        self.assertEqual(cabecalhos.get("Access-Control-Allow-Origin"), ORIGEM)

    def test_saude_sem_origem_responde_so_a_versao_e_o_perfil(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            status, cabecalhos, corpo = conexao.pedir("GET", "/health", origem=None)
        self.assertEqual(status, 200)
        self.assertEqual(sorted(json.loads(corpo)), ["ok", "perfil", "versao"])
        self.assertNotIn("Access-Control-Allow-Origin", cabecalhos)

    def test_sem_origem_nada_alem_da_saude_e_atendido_com_ou_sem_sec_fetch_site(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            for cabecalhos in ({}, {"Sec-Fetch-Site": "none"}):
                for metodo, caminho in (("GET", "/jobs"), ("GET", "/health/"), ("POST", "/health"), ("POST", "/jobs"), ("OPTIONS", "/health")):
                    with self.subTest("%s %s %s" % (metodo, caminho, cabecalhos)):
                        status, _, corpo = conexao.pedir(metodo, caminho, origem=None, cabecalhos=cabecalhos)
                        self.assertEqual((status, json.loads(corpo) if corpo else None), (403, {"error": "origin_not_allowed"}))

    def test_todo_verbo_passa_pela_mesma_autorizacao_de_origem(self):
        verbos = ("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "TRACE", "FOO")
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            for verbo in verbos:
                for descricao, origem in (("sem origem", None), ("com origem de outro site", "https://exemplo.com")):
                    with self.subTest("%s %s" % (verbo, descricao)):
                        status, cabecalhos, corpo = conexao.pedir(verbo, "/jobs", origem=origem)
                        self.assertEqual(status, 403)
                        self.assertEqual(corpo, b"" if verbo == "HEAD" else b'{"error": "origin_not_allowed"}')
                        self.assertNotIn("text/html", cabecalhos.get("Content-Type", ""))
                with self.subTest("%s com a origem da extensão numa rota que não existe" % verbo):
                    status, _, _ = conexao.pedir(verbo, "/nao-existe")
                    self.assertEqual(status, 404 if verbo != "OPTIONS" else 204)

    def test_com_a_origem_de_outra_extensao_nada_e_atendido_nem_a_saude(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            outra = "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            respostas = [conexao.pedir(m, c, origem=outra)[0] for m, c in (("GET", "/health"), ("GET", "/jobs"), ("POST", "/jobs"))]
        self.assertEqual(respostas, [403, 403, 403])

    def test_origem_de_outro_site_nao_recebe_a_origem_liberada_nem_dado_algum(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            status, cabecalhos, corpo = conexao.pedir("GET", "/health", origem="https://exemplo.com")
        self.assertEqual(status, 403)
        self.assertNotIn("Access-Control-Allow-Origin", cabecalhos)
        self.assertNotIn(b"versao", corpo)

    def test_pedido_de_verificacao_previa_da_extensao_e_respondido(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            status, cabecalhos, _ = conexao.pedir(
                "OPTIONS",
                "/health",
                cabecalhos={"Access-Control-Request-Method": "POST", "Access-Control-Request-Private-Network": "true"},
            )
        self.assertEqual(status, 204)
        self.assertEqual(cabecalhos.get("Access-Control-Allow-Origin"), ORIGEM)
        self.assertIn("POST", cabecalhos.get("Access-Control-Allow-Methods", ""))
        self.assertEqual(cabecalhos.get("Access-Control-Allow-Private-Network"), "true")

    def test_pedido_de_verificacao_previa_de_outro_site_e_recusado(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            status, cabecalhos, _ = conexao.pedir("OPTIONS", "/health", origem="https://exemplo.com")
        self.assertEqual(status, 403)
        self.assertNotIn("Access-Control-Allow-Origin", cabecalhos)


if __name__ == "__main__":
    unittest.main()

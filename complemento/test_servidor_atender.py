import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import servidor
from complemento.test_harness import ConexaoNoTeste, ORIGEM


def rota_que_quebra(conexao, corpo):
    raise RuntimeError("rota quebrada")


class AVerificacaoPrevia(unittest.TestCase):
    def previa(self, cabecalhos):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            return conexao.pedir("OPTIONS", "/health", cabecalhos=cabecalhos)

    def test_sem_pedir_nada_a_extensao_ouve_os_metodos_o_content_type_e_o_prazo(self):
        status, cabecalhos, corpo = self.previa({"Access-Control-Request-Method": "POST"})
        self.assertEqual(
            (status, corpo, cabecalhos.get("Access-Control-Allow-Origin"), cabecalhos.get("Access-Control-Allow-Methods"),
             cabecalhos.get("Access-Control-Allow-Headers"), cabecalhos.get("Access-Control-Max-Age"), cabecalhos.get("Vary")),
            (204, b"", ORIGEM, "GET, POST, DELETE, OPTIONS", "Content-Type", "600", "Origin"),
        )
        self.assertNotIn("Access-Control-Allow-Private-Network", cabecalhos)
        self.assertNotIn("Content-Type", cabecalhos)

    def test_os_cabecalhos_que_a_extensao_pede_voltam_como_permitidos(self):
        _, cabecalhos, _ = self.previa({"Access-Control-Request-Headers": "content-type, x-perpetualminer-nonce"})
        self.assertEqual(cabecalhos.get("Access-Control-Allow-Headers"), "content-type, x-perpetualminer-nonce")

    def test_so_a_rede_privada_pedida_e_permitida(self):
        for pedido, permitido in (("true", "true"), ("false", None), ("", None)):
            with self.subTest(pedido):
                _, cabecalhos, _ = self.previa({"Access-Control-Request-Private-Network": pedido})
                self.assertEqual(cabecalhos.get("Access-Control-Allow-Private-Network"), permitido)


class OContatoDoEnvio(unittest.TestCase):
    def contato_depois_de(self, metodo, caminho, **pedido):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            conexao.conexao.contato.clear()
            status, _, _ = conexao.pedir(metodo, caminho, **pedido)
            return status, conexao.conexao.contato.is_set()

    def test_um_pedido_de_envio_acorda_o_trabalho_mesmo_quando_a_rota_recusa(self):
        status, acordou = self.contato_depois_de("POST", "/jobs", corpo={})
        self.assertEqual((status, acordou), (400, True))

    def test_outro_pedido_nao_acorda_o_trabalho(self):
        self.assertEqual(self.contato_depois_de("GET", "/health"), (200, False))
        self.assertEqual(self.contato_depois_de("GET", "/jobs"), (404, False))

    def test_a_rota_que_quebra_responde_500_e_nao_acorda_o_trabalho(self):
        with mock.patch.dict(servidor.ROTAS, {("POST", "/jobs"): rota_que_quebra}):
            status, acordou = self.contato_depois_de("POST", "/jobs", corpo={})
        self.assertEqual((status, acordou), (500, False))


if __name__ == "__main__":
    unittest.main()

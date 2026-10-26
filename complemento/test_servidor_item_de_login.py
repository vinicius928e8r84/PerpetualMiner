"""“Abrir o Anki com o computador” pelo HTTP: o que o pedido deixa no disco (o item de login escrito ou apagado), e só a extensão o pede.

    python3.9 complemento/test_servidor_item_de_login.py
"""

import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.test_servidor import ConexaoNoTeste  # noqa: E402


class AbrirOAnkiComOComputador(unittest.TestCase):
    ROTA = "/abrir-com-o-computador"

    def itens(self, conexao):
        pasta = conexao.item.pasta
        return sorted(os.listdir(pasta)) if os.path.isdir(pasta) else []

    def test_ligar_escreve_o_item_e_desligar_o_apaga(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            antes = self.itens(conexao)
            conexao.pedir("POST", self.ROTA, corpo={"ligado": True})
            ligado = self.itens(conexao)
            estado = json.loads(conexao.pedir("POST", self.ROTA + "/estado", corpo={})[2])
            conexao.pedir("POST", self.ROTA, corpo={"ligado": False})
            depois = self.itens(conexao)
        self.assertEqual((antes, ligado, depois), ([], ["com.perpetualminer.abrir-o-anki.plist"], []))
        self.assertEqual(estado, {"ok": True, "ligado": True})

    def test_a_pergunta_pelo_estado_nao_escreve_nem_apaga_nada(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, item="ligado") as conexao:
            conexao.pedir("POST", self.ROTA + "/estado", corpo={})
            ainda = self.itens(conexao)
        self.assertEqual(ainda, ["com.perpetualminer.abrir-o-anki.plist"])

    def test_outro_site_ou_outra_extensao_nao_liga_nada(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            for origem in (None, "https://exemplo.com", "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"):
                with self.subTest(origem):
                    status, _, _ = conexao.pedir("POST", self.ROTA, origem=origem, corpo={"ligado": True})
                    self.assertEqual(status, 403)
            self.assertEqual(self.itens(conexao), [])

    def test_ler_o_estado_exige_a_origem_da_extensao(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            status, _, _ = conexao.pedir("GET", self.ROTA + "/estado", origem=None)
        self.assertEqual(status, 403)

    def test_corpo_que_nao_e_json_e_recusado_sem_escrever_nada(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            status, _, corpo = conexao.pedir("POST", self.ROTA, corpo=b"isto nao e json")
            itens = self.itens(conexao)
        self.assertEqual((status, json.loads(corpo), itens), (400, {"error": "invalid_json"}, []))

    def test_corpo_sem_ligado_e_recusado_sem_escrever_nada(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            for corpo in ({}, {"ligado": 1}, {"ligado": None}):
                with self.subTest(corpo):
                    status, _, resposta = conexao.pedir("POST", self.ROTA, corpo=corpo)
                    self.assertEqual((status, json.loads(resposta)), (400, {"error": "invalid_request"}))
            self.assertEqual(self.itens(conexao), [])

    def test_a_falha_ao_escrever_vai_ao_log_do_complemento(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, item="falha") as conexao:
            conexao.pedir("POST", self.ROTA, corpo={"ligado": True})
            registrado = conexao.log()
        self.assertIn("Abrir o Anki com o computador", registrado)


if __name__ == "__main__":
    unittest.main()

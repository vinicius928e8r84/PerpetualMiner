import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.test_envio import CHAVE, ID, OUTRO_ID, EnvioNoTeste, chats, pedido
from complemento.test_limite_do_plano import DUAS_FRASES, ESPERANDO_O_PLANO, EnvioNoLimite, PlanoNoLimite, em_espera


def com_a_chave_de(conta, conexao):
    with open(os.path.join(conexao.chaves, "openai.json"), "w", encoding="utf-8") as arquivo:
        json.dump({"chave": CHAVE, "conta": conta, "versao": 1, "em": 1, "naoEnviada": True}, arquivo)
    return conexao


class AChaveGuardadaPorOutraConta(unittest.TestCase):
    def test_a_chave_guardada_por_outra_conta_nao_e_gasta_e_o_envio_pede_a_chave_desta_conta(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            com_a_chave_de("conta-b", conexao)
            conexao.criar(dict(pedido(ID, "give up : She gave up smoking"), conta="conta-a"))
            estado = conexao.esperar(ID)
            pedidos = chats(conexao.openai)
        self.assertEqual((estado["status"], estado["lastError"], pedidos), ("failed", "openai_key_missing", []))

    def test_duas_contas_no_mesmo_computador_so_a_dona_da_chave_envia_e_a_outra_nao_gasta_nada(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            com_a_chave_de("conta-b", conexao)
            conexao.criar(dict(pedido(ID, "give up : She gave up smoking"), conta="conta-a"))
            da_outra = conexao.esperar(ID)
            sem_gastar = chats(conexao.openai)
            conexao.criar(dict(pedido(OUTRO_ID, "give up : She gave up smoking"), conta="conta-b"))
            da_dona = conexao.esperar(OUTRO_ID)
            autorizacoes = {p[0] for p in chats(conexao.openai)}
        self.assertEqual((da_outra["status"], da_outra["lastError"], sem_gastar), ("failed", "openai_key_missing", []))
        self.assertEqual((da_dona["status"], da_dona["lastError"]), ("completed", None))
        self.assertEqual(autorizacoes, {"Bearer " + CHAVE})

    def test_a_chave_sem_conta_serve_a_qualquer_conta_e_o_envio_sem_conta_serve_com_a_chave_de_qualquer_uma(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.criar(dict(pedido(ID, "give up : She gave up smoking"), conta="conta-a"))
            da_conta = conexao.esperar(ID)
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            com_a_chave_de("conta-b", conexao)
            conexao.criar(pedido(ID, "give up : She gave up smoking"))
            sem_conta = conexao.esperar(ID)
        self.assertEqual((da_conta["status"], sem_conta["status"]), ("completed", "completed"))

    def test_usar_a_minha_chave_de_uma_conta_nao_segue_o_envio_de_outra_conta_e_nao_gasta_a_chave(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoLimite(pasta, espera_do_plano=300) as conexao:
            com_a_chave_de("conta-b", conexao)
            PlanoNoLimite(conexao)
            conexao.criar(dict(pedido(ID, *DUAS_FRASES), conta="conta-a"))
            conexao.esperar(ID, em_espera)
            status, _, resposta = conexao.pedir("POST", "/jobs/usar-a-chave", corpo={"jobId": ID})
            ainda = conexao.estado(ID)
            gastos = chats(conexao.openai)
        self.assertEqual((status, json.loads(resposta)), (409, {"error": "openai_key_missing"}))
        self.assertEqual((ainda.get("usingKey", False), ainda["waiting"], gastos), (False, ESPERANDO_O_PLANO, []))


if __name__ == "__main__":
    unittest.main()

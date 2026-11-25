import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.test_envio import ID, EnvioNoTeste, chats, pedido


class ARecusaPassageira(unittest.TestCase):
    def test_o_texto_que_a_openai_recusou_uma_vez_por_excesso_de_pedidos_e_pedido_de_novo_e_o_cartao_entra(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.openai.recusar_o_chat_de("give up", 429, "rate_limit_exceeded", vezes=1)
            conexao.criar(pedido(ID, "give up : She gave up smoking"))
            estado = conexao.esperar(ID)
            pedidos = len(chats(conexao.openai))
            gravadas = len(conexao.conexao.colecao.gravadas)
        self.assertEqual(
            (estado["status"], [c["status"] for c in estado["cards"].values()], estado["lastError"], pedidos, gravadas),
            ("completed", ["added"], None, 2, 1),
        )


if __name__ == "__main__":
    unittest.main()

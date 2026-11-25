import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.test_envio import ID, EnvioNoTeste, chats, pedido

SEM_PALAVRA = "He gave in at last. [Contexto: Manual - Minha frase - ]"


class AFraseSemPalavraMarcada(unittest.TestCase):
    def test_a_frase_sem_palavra_marcada_nao_vai_a_openai_e_o_envio_diz_que_falta_marcar_a_palavra(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.criar(pedido(ID, SEM_PALAVRA, "give up : She gave up smoking"))
            estado = conexao.esperar(ID)
            retomada = json.loads(conexao.pedir("POST", "/jobs/retry", corpo={"jobId": ID})[2])
            de_novo = conexao.esperar(ID)
            pedidos = chats(conexao.openai)
            notas = conexao.conexao.colecao.gravadas
        self.assertEqual(
            (estado["status"], estado["successfulPhraseIds"], estado["failedPhraseIds"], estado["lastError"]),
            ("partial", [1760000000001], [1760000000000], "keyword_missing"),
        )
        self.assertEqual((retomada["status"], de_novo["status"], de_novo["lastError"]), ("queued", "partial", "keyword_missing"))
        self.assertEqual((len(pedidos), len(notas)), (1, 1))

    def test_so_com_a_frase_sem_palavra_marcada_o_envio_falha_dizendo_que_falta_marcar_a_palavra(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.criar(pedido(ID, "She gave up smoking last year. [Contexto: Manual - Minha frase - ]"))
            estado = conexao.esperar(ID)
            pedidos = chats(conexao.openai)
        self.assertEqual(
            (estado["status"], estado["failedPhraseIds"], estado["lastError"], estado["cards"]), ("failed", [1760000000000], "keyword_missing", {}))
        self.assertEqual(pedidos, [])

    def test_a_frase_que_falhou_com_palavra_marcada_continua_dizendo_o_motivo_do_cartao(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.openai.recusar_o_chat_de("run", 429, "rate_limit_exceeded")
            conexao.criar(pedido(ID, SEM_PALAVRA, "run : They run every day"))
            estado = conexao.esperar(ID)
        self.assertEqual((estado["status"], estado["lastError"]), ("failed", "openai_rate_limited"))


if __name__ == "__main__":
    unittest.main()

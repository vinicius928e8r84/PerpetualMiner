"""A fala do quiz de nível (#170), vista de fora: `POST /voz/falar` no servidor real, com a voz do Google de mentira na fronteira HTTP.
O que o teste confere é a resposta, o que atravessa o HTTP até o Google e o que a Conexão deixa no log.

    python3.9 complemento/test_falar_a_frase.py
"""

import base64
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.test_servidor import ConexaoNoTeste  # noqa: E402
from complemento.test_voz_de_mentira import dito  # noqa: E402

FRASE = "Could you tell me where the nearest pharmacy is?"


def falar(conexao, **corpo):
    status, _, resposta = conexao.pedir("POST", "/voz/falar", corpo=corpo)
    return status, json.loads(resposta)


class FalarAFraseDoQuiz(unittest.TestCase):
    def test_a_frase_pedida_volta_como_audio_dita_no_idioma_e_no_sotaque_pedidos(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            status, resposta = falar(conexao, lang="en", sotaque="co.uk", texto=FRASE)
            pedidos = list(conexao.voz.pedidos)
        self.assertEqual(status, 200)
        self.assertEqual(pedidos, [("co.uk", "en", FRASE)])
        self.assertEqual(dito(base64.b64decode(resposta["audio"])), [("co.uk", "en", FRASE)])

    def test_o_russo_e_dito_em_russo(self):
        frase = "Завтра мы поедем к бабушке на поезде."
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            status, _ = falar(conexao, lang="ru", sotaque="ru", texto=frase)
            pedidos = list(conexao.voz.pedidos)
        self.assertEqual((status, pedidos), (200, [("ru", "ru", frase)]))

    def test_o_google_que_recusa_o_pedido_responde_o_codigo_sem_audio_e_o_log_nao_guarda_a_frase(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            conexao.voz.recusar("*", 400)
            with self.assertLogs("perpetualminer", level="WARNING") as log:
                status, resposta = falar(conexao, lang="en", sotaque="com", texto=FRASE)
        self.assertEqual((status, resposta), (502, {"error": "tts_rejected"}))
        self.assertNotIn("pharmacy", "\n".join(log.output))

    def test_o_google_fora_do_ar_responde_o_codigo_que_manda_tentar_de_novo(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            conexao.voz.recusar("*", 503)
            status, resposta = falar(conexao, lang="en", sotaque="com", texto=FRASE)
        self.assertEqual((status, resposta), (502, {"error": "tts_unreachable"}))

    def test_um_pedido_que_nao_serve_e_recusado_sem_pedir_nada_ao_google(self):
        bons = {"lang": "en", "sotaque": "com", "texto": FRASE}
        ruins = [
            {"sotaque": "evil.example/x"}, {"sotaque": None}, {"lang": "fr"}, {"lang": ["en"]},
            {"texto": ""}, {"texto": "   "}, {"texto": 7}, {"texto": "a" * 201}, {"texto": None},
        ]
        for ruim in ruins:
            with self.subTest(ruim=ruim), tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
                status, resposta = falar(conexao, **{**bons, **ruim})
                self.assertEqual((status, resposta, conexao.voz.pedidos), (400, {"error": "invalid_request"}, []))

    def test_uma_frase_do_tamanho_do_limite_ainda_e_dita(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            status, _ = falar(conexao, lang="en", sotaque="com", texto="a" * 200)
        self.assertEqual(status, 200)


if __name__ == "__main__":
    unittest.main()

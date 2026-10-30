"""O Ouvir dos Ajustes de envio (#174), visto de fora: `POST /voz/ouvir` no servidor real, com a voz do Google e a OpenAI de mentira
na fronteira HTTP. O que o teste confere é a resposta, o que atravessa o HTTP e o que a Conexão deixa no log.

    python3.9 complemento/test_ouvir_a_voz.py
"""

import base64
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.test_envio import CHAVE, EnvioNoTeste  # noqa: E402
from complemento.test_openai_de_mentira import audio_da_openai  # noqa: E402
from complemento.test_servidor import ConexaoNoTeste  # noqa: E402
from complemento.test_voz_de_mentira import dito  # noqa: E402


def ouvir(conexao, **corpo):
    status, _, resposta = conexao.pedir("POST", "/voz/ouvir", corpo=corpo)
    return status, json.loads(resposta)


def tocado(resposta):
    return base64.b64decode(resposta["audio"])


class OuvirOSotaqueDoGoogle(unittest.TestCase):
    def test_a_voz_do_google_no_sotaque_pedido_volta_como_audio_e_o_google_foi_pedido_com_esse_sotaque(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            status, resposta = ouvir(conexao, lang="en", provedor="google", sotaque="com.au")
            pedidos = list(conexao.voz.pedidos)
            falas = list(conexao.openai.falas)
        self.assertEqual(status, 200)
        self.assertEqual([sotaque for sotaque, _, _ in dito(tocado(resposta))], ["com.au"])
        self.assertEqual([(sotaque, lang) for sotaque, lang, _ in pedidos], [("com.au", "en")])
        self.assertEqual(falas, [])

    def test_o_russo_e_dito_em_russo(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            _, resposta = ouvir(conexao, lang="ru", provedor="google", sotaque="ru")
            pedidos = list(conexao.voz.pedidos)
        self.assertEqual([(sotaque, lang) for sotaque, lang, _ in pedidos], [("ru", "ru")])
        self.assertTrue(any("\u0400" <= letra <= "\u04ff" for _, _, texto in pedidos for letra in texto))
        self.assertEqual(len(dito(tocado(resposta))), len(pedidos))

    def test_o_google_que_recusa_o_pedido_responde_o_codigo_sem_audio(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            conexao.voz.recusar("com", 400)
            status, resposta = ouvir(conexao, lang="en", provedor="google", sotaque="com")
        self.assertEqual((status, resposta), (502, {"error": "tts_rejected"}))

    def test_o_google_fora_do_ar_responde_o_codigo_que_manda_tentar_de_novo(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            conexao.voz.recusar("*", 503)
            status, resposta = ouvir(conexao, lang="en", provedor="google", sotaque="com")
        self.assertEqual((status, resposta), (502, {"error": "tts_unreachable"}))

    def test_um_sotaque_que_nao_e_de_um_endereco_do_google_e_recusado_sem_pedir_nada(self):
        for sotaque in ("evil.example/x", "com@evil", "", None, 7):
            with self.subTest(sotaque=sotaque), tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
                status, resposta = ouvir(conexao, lang="en", provedor="google", sotaque=sotaque)
                self.assertEqual((status, resposta, conexao.voz.pedidos), (400, {"error": "invalid_request"}, []))


class OuvirAVozDaOpenAI(unittest.TestCase):
    def test_a_voz_da_openai_volta_como_audio_e_gasta_a_chave_so_neste_pedido(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            status, resposta = ouvir(conexao, lang="en", provedor="openai")
            falas = list(conexao.openai.falas)
            google = list(conexao.voz.pedidos)
        self.assertEqual(status, 200)
        self.assertEqual([(autorizacao, corpo["voice"]) for autorizacao, corpo in falas], [("Bearer " + CHAVE, "alloy")])
        self.assertEqual(tocado(resposta), audio_da_openai("alloy", falas[0][1]["input"]))
        self.assertEqual(google, [])

    def test_sem_a_chave_responde_que_falta_a_chave_e_a_openai_nem_e_chamada(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, chave=None) as conexao:
            status, resposta = ouvir(conexao, lang="en", provedor="openai")
            falas = list(conexao.openai.falas)
        self.assertEqual((status, resposta, falas), (409, {"error": "openai_key_missing"}, []))

    def test_so_com_o_login_do_chatgpt_a_voz_da_openai_diz_que_falta_a_chave_porque_o_plano_nao_cobre_voz(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, chave=None, chatgpt="conectada") as conexao:
            status, resposta = ouvir(conexao, lang="en", provedor="openai")
            falas = list(conexao.openai.falas)
        self.assertEqual((status, resposta, falas), (409, {"error": "openai_key_missing"}, []))

    def test_a_chave_recusada_pela_openai_responde_o_codigo_e_nem_o_log_nem_a_resposta_levam_a_chave(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.openai.recusa_da_fala = (401, "invalid_api_key")
            status, resposta = ouvir(conexao, lang="en", provedor="openai")
            log = conexao.log()
        self.assertEqual((status, resposta), (502, {"error": "openai_key_rejected"}))
        self.assertNotIn(CHAVE, log + json.dumps(resposta))

    def test_a_conta_sem_credito_responde_o_codigo_de_sem_credito(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.openai.recusa_da_fala = (429, "insufficient_quota")
            status, resposta = ouvir(conexao, lang="en", provedor="openai")
        self.assertEqual((status, resposta), (502, {"error": "openai_no_credit"}))


class UmPedidoQueNaoServe(unittest.TestCase):
    def test_idioma_ou_provedor_fora_da_lista_e_recusado_sem_pedir_nada_a_ninguem(self):
        for corpo in ({}, {"lang": "fr", "provedor": "google", "sotaque": "com"}, {"lang": "en", "provedor": "outro"}, {"lang": "en"},
                      {"lang": "en", "provedor": ["openai"]}):
            with self.subTest(corpo=corpo), tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
                status, resposta = ouvir(conexao, **corpo)
                self.assertEqual((status, resposta, conexao.voz.pedidos, conexao.openai.falas), (400, {"error": "invalid_request"}, [], []))


if __name__ == "__main__":
    unittest.main()

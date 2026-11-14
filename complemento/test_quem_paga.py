"""Quem paga o Envio: o plano do ChatGPT, a chave da OpenAI, ou ninguém (o Envio para), transição por transição.

O login é uma de três coisas guardadas (sem login, conectada, acabou) e o pagador de cada Cartão sai dele e da escolha da pessoa
(`quem_paga`): do `parado` só se sai por escolha, entrando de novo ou saindo do login para usar a chave. Visto de fora, com o
servidor real da Conexão, o servidor de login de mentira e a OpenAI de mentira, como em `test_plano_do_chatgpt.py`.
O desenho: `docs/design/login-do-chatgpt.md` § 2.

    python3.9 complemento/test_quem_paga.py
"""

import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.login_do_chatgpt import ACABOU, CONECTADA, SEM_LOGIN  # noqa: E402
from complemento.modelo_dos_cartoes import CHAVE, PARADO, PLANO, quem_paga  # noqa: E402
from complemento.test_envio import CHAVE as CHAVE_GUARDADA, ID, EnvioNoTeste, pedido  # noqa: E402
from complemento.test_login_do_chatgpt import arquivo_do_login, entrar, entrar_e_voltar, estado, json_de, voltar  # noqa: E402

SAIU = "chatgpt_signed_out"
FRASE = "gave up : She gave up smoking"


class OPagadorDeCadaCartao(unittest.TestCase):
    def test_cada_login_com_cada_escolha_da_um_pagador_so(self):
        # (o login, o motivo dele, a pessoa escolheu a chave neste Envio, há chave guardada) → (quem paga, por que parou)
        linhas = [
            ((SEM_LOGIN, None, False, True), (CHAVE, None)),
            ((SEM_LOGIN, None, False, False), (PARADO, "openai_key_missing")),
            ((SEM_LOGIN, None, True, True), (CHAVE, None)),
            ((SEM_LOGIN, None, True, False), (PARADO, "openai_key_missing")),
            ((CONECTADA, None, False, True), (PLANO, None)),
            ((CONECTADA, None, False, False), (PLANO, None)),
            ((CONECTADA, None, True, True), (CHAVE, None)),
            ((CONECTADA, None, True, False), (PARADO, "openai_key_missing")),
            ((ACABOU, SAIU, False, True), (PARADO, SAIU)),  # a chave está lá, e o Envio não a gasta sozinho
            ((ACABOU, SAIU, False, False), (PARADO, SAIU)),
            ((ACABOU, SAIU, True, True), (CHAVE, None)),  # Usar a minha chave, no Envio: a escolha é da pessoa
            ((ACABOU, SAIU, True, False), (PARADO, "openai_key_missing")),
        ]
        for entrada, esperado in linhas:
            with self.subTest(entrada):
                self.assertEqual(quem_paga(*entrada), esperado)


def acabar_o_login(conexao, frase=FRASE):
    """A pessoa entrou, e a renovação do token passa a ser recusada: o primeiro Envio acha o login acabado. Devolve o fim dele."""
    conexao.servidor_de_login.validade = 60  # abaixo da margem: o token é renovado antes de cada Cartão
    entrar_e_voltar(conexao)
    conexao.servidor_de_login.renovacao = "invalid_grant"
    conexao.criar(pedido(ID, frase))
    return conexao.esperar(ID)


def tentar_de_novo(conexao):
    status, _, corpo = conexao.pedir("POST", "/jobs/retry", corpo={"jobId": ID})
    assert status == 200, corpo
    return conexao.esperar(ID)


def pedidos(conexao):
    """(os pedidos de texto pela chave, os pedidos de texto pelo plano)."""
    return len(conexao.openai.chats), len(conexao.openai.respostas)


class OLoginQueAcabou(unittest.TestCase):
    def test_o_login_que_acabou_fica_dito_no_estado_e_o_tentar_de_novo_para_de_novo_sem_gastar_a_chave(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            fim = acabar_o_login(conexao)
            dito = estado(conexao)
            de_novo = tentar_de_novo(conexao)
            gastos = pedidos(conexao)
            depois = estado(conexao)
        self.assertEqual((fim["status"], fim["lastError"]), ("failed", SAIU))
        self.assertEqual(dito, {"conectada": False, "entrando": False, "falha": None, "acabou": SAIU})
        self.assertEqual((de_novo["status"], de_novo["lastError"]), ("failed", SAIU))
        self.assertEqual(gastos, (0, 0))
        self.assertEqual(depois, dito)

    def test_um_envio_novo_com_o_login_acabado_tambem_para_sem_gastar_a_chave(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            acabar_o_login(conexao)
            outro = "22222222-2222-4222-8222-222222222222"
            conexao.criar(pedido(outro, "give in : They gave in"))
            fim = conexao.esperar(outro)
            gastos = pedidos(conexao)
        self.assertEqual((fim["status"], fim["lastError"]), ("failed", SAIU))
        self.assertEqual(gastos, (0, 0))

    def test_o_login_acabado_continua_acabado_depois_de_a_conexao_reiniciar(self):
        with tempfile.TemporaryDirectory() as pasta:
            with EnvioNoTeste(pasta) as conexao:
                acabar_o_login(conexao)
            with EnvioNoTeste(pasta) as conexao:
                dito = estado(conexao)
                de_novo = tentar_de_novo(conexao)
                gastos = pedidos(conexao)
        self.assertEqual(dito, {"conectada": False, "entrando": False, "falha": None, "acabou": SAIU})
        self.assertEqual((de_novo["status"], de_novo["lastError"]), ("failed", SAIU))
        self.assertEqual(gastos, (0, 0))

    def test_o_arquivo_do_login_acabado_nao_guarda_token_nenhum(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            acabar_o_login(conexao)
            with open(arquivo_do_login(conexao), encoding="utf-8") as arquivo:
                guardado = json.load(arquivo)
            emitidos = list(conexao.servidor_de_login.emitidos)
        self.assertEqual(sorted(guardado), ["acabou", "em"])
        self.assertEqual(guardado["acabou"], SAIU)
        self.assertGreaterEqual(len(emitidos), 2)
        for token in emitidos:
            self.assertNotIn(token, json.dumps(guardado))

    def test_com_o_login_acabado_ninguem_paga_e_o_modelo_dos_cartoes_nao_diz_que_e_a_chave(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            acabar_o_login(conexao)
            status, _, corpo = conexao.pedir("POST", "/ia/modelo/estado", corpo={})
        self.assertEqual(status, 200)
        self.assertEqual((json.loads(corpo)["paga"], json.loads(corpo)["modelos"]), (None, []))

    def test_a_renovacao_fora_do_ar_nao_acaba_o_login(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.servidor_de_login.validade = 60
            entrar_e_voltar(conexao)
            conexao.servidor_de_login.renovacao = "fora_do_ar"
            conexao.criar(pedido(ID, FRASE))
            fim = conexao.esperar(ID)
            dito = estado(conexao)
            gastos = pedidos(conexao)
        self.assertEqual(fim["cards"]["1760000000000-0"]["error"], "openai_unreachable")
        self.assertEqual(dito, {"conectada": True, "entrando": False, "falha": None, "acabou": None})
        self.assertEqual(gastos, (0, 0))


class DoParadoSoSeSaiPorEscolha(unittest.TestCase):
    def test_entrar_de_novo_volta_ao_plano_e_o_tentar_de_novo_termina_o_envio_por_ele(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            acabar_o_login(conexao)
            conexao.servidor_de_login.renovacao = "aceita"
            entrar_e_voltar(conexao)
            dito = estado(conexao)
            fim = tentar_de_novo(conexao)
            gastos = pedidos(conexao)
        self.assertEqual(dito, {"conectada": True, "entrando": False, "falha": None, "acabou": None})
        self.assertEqual((fim["status"], fim["lastError"]), ("completed", None))
        self.assertEqual(gastos, (0, 1))

    def test_sair_do_login_acabado_e_escolher_a_chave_e_o_tentar_de_novo_termina_o_envio_por_ela(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            acabar_o_login(conexao)
            saiu = json_de(conexao.pedir("POST", "/ia/chatgpt/sair", corpo={}))
            dito = estado(conexao)
            existe = os.path.exists(arquivo_do_login(conexao))
            fim = tentar_de_novo(conexao)
            gastos = pedidos(conexao)
            [(autorizacao, _)] = conexao.openai.chats
        self.assertEqual(saiu, {"ok": True, "revogada": True})
        self.assertEqual((dito, existe), ({"conectada": False, "entrando": False, "falha": None, "acabou": None}, False))
        self.assertEqual((fim["status"], fim["lastError"]), ("completed", None))
        self.assertEqual(gastos, (1, 0))
        self.assertEqual(autorizacao, "Bearer " + CHAVE_GUARDADA)

    def test_usar_a_minha_chave_num_envio_que_espera_o_plano_vale_com_o_login_acabado(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.openai.recusa_das_respostas = (429, "subscription_sharing_usage_limit_exceeded")
            entrar_e_voltar(conexao)
            conexao.criar(pedido(ID, FRASE))
            conexao.esperar(ID, lambda estado: estado.get("waiting"))
            with open(arquivo_do_login(conexao), "w", encoding="utf-8") as arquivo:
                json.dump({"acabou": SAIU, "em": 1}, arquivo)  # o login acabou enquanto o Envio esperava
            status, _, _ = conexao.pedir("POST", "/jobs/usar-a-chave", corpo={"jobId": ID})
            fim = conexao.esperar(ID)
            pela_chave = len(conexao.openai.chats)
        self.assertEqual(status, 200)
        self.assertEqual((fim["status"], fim["lastError"], pela_chave), ("completed", None, 1))

    def test_uma_tentativa_de_entrar_que_nao_da_certo_deixa_o_login_acabado_e_o_envio_parado(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            acabar_o_login(conexao)
            url, _ = entrar(conexao)
            entrando = estado(conexao)
            voltar(conexao, conexao.servidor_de_login.autorizar(url, erro="access_denied"))
            recusou = estado(conexao)
            fim = tentar_de_novo(conexao)
            gastos = pedidos(conexao)
        self.assertEqual(entrando, {"conectada": False, "entrando": True, "falha": None, "acabou": SAIU})
        self.assertEqual(recusou, {"conectada": False, "entrando": False, "falha": "chatgpt_access_denied", "acabou": SAIU})
        self.assertEqual((fim["status"], fim["lastError"]), ("failed", SAIU))
        self.assertEqual(gastos, (0, 0))


if __name__ == "__main__":
    unittest.main()

"""Quem paga cada pedido (C5), pela porta da IA dos cartões e sem montar um Envio: a tabela etapa × situação de
`docs/design/ia-dos-cartoes.md`, o que a porta lê do login e do cofre guardados (os arquivos reais, numa pasta temporária) e a
credencial que ela entrega a cada etapa, e o texto do Cartão pedido por ela à OpenAI de mentira (quem paga e o custo que fica). O caminho inteiro, com o servidor e a OpenAI de mentira, segue em `test_quem_paga.py`,
`test_imagem_pelo_plano.py`, `test_voz_de_reserva.py` e `test_ouvir_a_voz.py`.

    python3.9 complemento/test_ia_dos_cartoes.py
"""

import base64
import json
import logging
import os
import sys
import tempfile
import time
import unittest
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import envio
from complemento.chaves import Cofre
from complemento.ia_dos_cartoes import CORRECAO, ETAPAS, IMAGEM, JUIZ, OUVIR, TEXTO, VOZ, IaDosCartoes, quem_paga_a_etapa
from complemento.login_do_chatgpt import ACABOU, CONECTADA, SAIU, SEM_LOGIN, ErroDoPlano, LoginDoChatGPT
from complemento.modelo_dos_cartoes import CHAVE, PARADO, PLANO, ModeloDosCartoes, lista_nossa
from complemento.test_correcao_de_mentira import COMECO_DO_PROMPT
from complemento.test_imagens_de_mentira import png_de
from complemento.test_openai_de_mentira import OpenAIDeMentira

CHAVE_GUARDADA = "sk-test-ia-dos-cartoes-0000"
SEM_CHAVE = "openai_key_missing"

SITUACOES = {
    "com login": (CONECTADA, None, False, True),
    "com login, sem chave": (CONECTADA, None, False, False),
    "login acabado": (ACABOU, SAIU, False, True),
    "sem login": (SEM_LOGIN, None, False, True),
    "Usar a minha chave": (CONECTADA, None, True, True),
    "Usar a minha chave, login acabado": (ACABOU, SAIU, True, True),
    "sem chave": (SEM_LOGIN, None, False, False),
}
PELO_PLANO = [(PLANO, None), (PLANO, None), (PARADO, SAIU), (CHAVE, None), (CHAVE, None), (CHAVE, None), (PARADO, SEM_CHAVE)]
SO_PELA_CHAVE = [(CHAVE, None), (PARADO, SEM_CHAVE), (CHAVE, None), (CHAVE, None), (CHAVE, None), (CHAVE, None), (PARADO, SEM_CHAVE)]
TABELA = {TEXTO: PELO_PLANO, CORRECAO: PELO_PLANO, JUIZ: PELO_PLANO, IMAGEM: SO_PELA_CHAVE, VOZ: SO_PELA_CHAVE, OUVIR: SO_PELA_CHAVE}


def guardar(pasta, login, tem_chave, api="http://127.0.0.1:9"):
    """Os arquivos do login e da chave de uma situação, como a Conexão os deixa em `user_files/chaves`."""
    if login == CONECTADA:
        guardado = {"client_id": "cliente", "access_token": "acesso-do-teste", "refresh_token": "renovar", "expira_em": time.time() + 3600}
    else:
        guardado = {"acabou": SAIU, "em": 1} if login == ACABOU else None
    if guardado is not None:
        with open(os.path.join(pasta, "chatgpt.json"), "w", encoding="utf-8") as arquivo:
            json.dump(guardado, arquivo)
    cofre = Cofre(pasta)
    if tem_chave:
        cofre.guardar("openai", CHAVE_GUARDADA)
    return LoginDoChatGPT(pasta, logging.getLogger("teste"), base="http://127.0.0.1:9", api=api), cofre


def porta(pasta, situacao):
    login, _, _, tem_chave = SITUACOES[situacao]
    return IaDosCartoes(*guardar(pasta, login, tem_chave), modelos=None, motor=envio.motor_do_complemento(), openai_base="http://127.0.0.1:9")


class ATabelaDeQuemPaga(unittest.TestCase):
    def test_a_tabela_tem_cada_etapa_paga_do_envio_e_do_ouvir(self):
        self.assertEqual(sorted(ETAPAS), sorted(TABELA))

    def test_cada_etapa_em_cada_situacao_tem_um_pagador_so(self):
        for etapa, esperados in TABELA.items():
            for situacao, esperado in zip(SITUACOES, esperados):
                with self.subTest(etapa=etapa, situacao=situacao):
                    self.assertEqual(quem_paga_a_etapa(etapa, *SITUACOES[situacao]), esperado)

    def test_uma_etapa_fora_da_tabela_e_recusada(self):
        with self.assertRaises(ValueError):
            quem_paga_a_etapa("legenda", SEM_LOGIN, None, False, True)


class APortaLeOQueEstaGuardado(unittest.TestCase):
    def test_a_porta_responde_pela_tabela_com_o_login_e_a_chave_guardados_agora(self):
        for situacao, (_, _, pela_chave, _) in SITUACOES.items():
            with tempfile.TemporaryDirectory() as pasta:
                ia = porta(pasta, situacao)
                vistos = {etapa: ia.pagador(etapa, pela_chave) for etapa in TABELA}
            for etapa, esperados in TABELA.items():
                with self.subTest(etapa=etapa, situacao=situacao):
                    self.assertEqual(vistos[etapa], esperados[list(SITUACOES).index(situacao)])

    def test_a_chave_apagada_depois_de_a_porta_nascer_ja_nao_paga(self):
        with tempfile.TemporaryDirectory() as pasta:
            ia = porta(pasta, "sem login")
            antes = ia.pagador(VOZ)
            os.remove(os.path.join(pasta, "openai.json"))
            depois = ia.pagador(VOZ), ia.para_a_fala()
        self.assertEqual(antes, (CHAVE, None))
        self.assertEqual(depois, ((PARADO, SEM_CHAVE), None))


class ACredencialDeCadaEtapa(unittest.TestCase):
    def test_a_voz_e_o_ouvir_recebem_a_chave_em_qualquer_login_e_nada_sem_ela(self):
        for situacao, (_, _, _, tem_chave) in SITUACOES.items():
            with tempfile.TemporaryDirectory() as pasta:
                chave = porta(pasta, situacao).para_a_fala()
            with self.subTest(situacao=situacao):
                self.assertEqual(chave, CHAVE_GUARDADA if tem_chave else None)

    def test_o_texto_que_ninguem_paga_para_com_o_motivo_da_tabela(self):
        for situacao, motivo in (("login acabado", SAIU), ("sem chave", SEM_CHAVE)):
            _, _, pela_chave, _ = SITUACOES[situacao]
            with tempfile.TemporaryDirectory() as pasta:
                pagador = porta(pasta, situacao).para_o_texto(pela_chave)
            with self.subTest(situacao=situacao):
                self.assertEqual((pagador.quem, pagador.config, pagador.motivo), (PARADO, None, motivo))

    def test_usar_a_minha_chave_sem_chave_guardada_para_o_texto_mesmo_com_o_login(self):
        with tempfile.TemporaryDirectory() as pasta:
            ia = IaDosCartoes(*guardar(pasta, CONECTADA, False), modelos=None)
            pagador = ia.para_o_texto(True)
        self.assertEqual((pagador.quem, pagador.motivo), (PARADO, SEM_CHAVE))

    def test_a_imagem_sem_login_vai_so_pela_chave_presa(self):
        with tempfile.TemporaryDirectory() as pasta:
            juiz, presa = porta(pasta, "sem login").para_a_imagem(False)
        self.assertEqual((type(juiz).__name__, type(presa).__name__), ("JuizDaImagem", "PelaChave"))
        self.assertNotIn(CHAVE_GUARDADA, repr(presa))

    def test_a_imagem_com_usar_a_minha_chave_nao_pede_o_token_do_login_acabado(self):
        with tempfile.TemporaryDirectory() as pasta:
            juiz, presa = porta(pasta, "Usar a minha chave, login acabado").para_a_imagem(True)
        self.assertEqual((type(juiz).__name__, type(presa).__name__), ("JuizDaImagem", "PelaChave"))

    def test_a_imagem_sem_chave_nao_tem_o_que_a_chave_paga(self):
        with tempfile.TemporaryDirectory() as pasta:
            self.assertEqual(porta(pasta, "sem chave").para_a_imagem(False), (None, None))

    def test_a_imagem_com_o_login_acabado_para_como_o_texto(self):
        with tempfile.TemporaryDirectory() as pasta:
            ia = porta(pasta, "login acabado")
            with self.assertRaises(ErroDoPlano) as parou:
                ia.para_a_imagem(False)
        self.assertEqual(parou.exception.codigo, SAIU)


def porta_na_openai(pasta, situacao, openai):
    """A porta como a Conexão a monta (`servidor.Conexao`), com o login, o cofre, o modelo dos cartões e o motor, falando com a OpenAI de mentira."""
    motor = envio.motor_do_complemento()
    login, cofre = guardar(pasta, SITUACOES[situacao][0], SITUACOES[situacao][3], api=openai.base)
    modelos = ModeloDosCartoes(os.path.join(pasta, "modelo-dos-cartoes.json"), lista_nossa(), date.today, logging.getLogger("teste"), login, cofre,
                               openai.base, lambda: motor.config_loader.base_config()["openai"]["chat_model"])
    config = motor.config_loader.base_config()
    config["paths"]["log_dir"] = os.path.join(pasta, "custos")
    return IaDosCartoes(login, cofre, modelos, motor=motor, openai_base=openai.base), config


def custos(config):
    with open(os.path.join(config["paths"]["log_dir"], "costs.jsonl"), encoding="utf-8") as arquivo:
        return [json.loads(linha) for linha in arquivo]


class OTextoPelaPorta(unittest.TestCase):
    def test_pela_chave_o_texto_vai_com_a_chave_e_o_custo_dos_tokens_fica_com_o_nome_do_cartao(self):
        with tempfile.TemporaryDirectory() as pasta, OpenAIDeMentira() as openai:
            ia, config = porta_na_openai(pasta, "sem login", openai)
            pedir = ia.pedido_do_texto(ia.para_o_texto(), config)
            texto = pedir("o prompt", "give up : She gave up smoking", "17-0")
            registros = custos(config)
            [(autorizacao, corpo)] = openai.chats
        self.assertIn("Front:", texto)
        self.assertEqual((autorizacao, corpo["model"], corpo["messages"][0]), ("Bearer " + CHAVE_GUARDADA, "gpt-4o", {"role": "system", "content": "o prompt"}))
        self.assertEqual([(r["type"], r["model"], r["input_tokens"], r["output_tokens"], r["cost_usd"], r["keyword"]) for r in registros],
                         [("tokens", "gpt-4o", 1000, 200, 0.0045, "17-0")])
        self.assertEqual(openai.respostas, [])

    def test_pelo_plano_o_texto_vai_pela_responses_api_sem_custo_em_dolar_e_com_o_que_a_chave_teria_cobrado(self):
        with tempfile.TemporaryDirectory() as pasta, OpenAIDeMentira() as openai:
            ia, config = porta_na_openai(pasta, "com login", openai)
            pedir = ia.pedido_do_texto(ia.para_o_texto(), config)
            texto = pedir("o prompt", "give up : She gave up smoking", "17-0")
            registros = custos(config)
            [(autorizacao, corpo)] = openai.respostas
        self.assertIn("Front:", texto)
        self.assertEqual((autorizacao, corpo["model"], corpo["instructions"]), ("Bearer acesso-do-teste", "gpt-6-luna", "o prompt"))
        self.assertEqual([(r["type"], r["model"], r["cost_usd"], r["would_cost_usd"], r["keyword"]) for r in registros],
                         [("plan_tokens", "gpt-6-luna", 0.0, 0.0045, "17-0")])
        self.assertNotIn("acesso-do-teste", json.dumps(registros))
        self.assertEqual(openai.chats, [])

    def test_a_recusa_da_openai_chega_a_quem_pediu_como_o_codigo_e_nada_fica_no_custo(self):
        with tempfile.TemporaryDirectory() as pasta, OpenAIDeMentira() as openai:
            openai.recusar_o_chat_de("*", 401, "invalid_api_key")
            ia, config = porta_na_openai(pasta, "sem login", openai)
            pedir = ia.pedido_do_texto(ia.para_o_texto(), config)
            with self.assertRaises(envio.motor_do_complemento().provedores.ErroDoProvedor) as recusa:
                pedir("o prompt", "give up : She gave up smoking", "17-0")
            ficou = os.path.exists(os.path.join(config["paths"]["log_dir"], "costs.jsonl"))
        self.assertEqual(recusa.exception.codigo, "openai_key_rejected")
        self.assertFalse(ficou)


class AImagemPelaChavePresa(unittest.TestCase):
    def test_a_triagem_e_a_imagem_gerada_vao_com_a_chave_guardada_sem_o_motor_a_receber(self):
        with tempfile.TemporaryDirectory() as pasta, OpenAIDeMentira() as openai:
            ia, _ = porta_na_openai(pasta, "sem login", openai)
            _, presa = ia.para_a_imagem(False)
            veredito, _ = presa.texto("gpt-4o-mini", "You are a classifier.", "bicycle", temperatura=0, max_tokens=1)
            imagem = presa.imagem("gpt-image-1", "a bicycle", "1024x1024")
            [autorizacao_da_imagem] = [autorizacao for metodo, caminho, autorizacao in openai.pedidos if caminho == "/v1/images/generations"]
        self.assertEqual((veredito, openai.triagens), ("C", [("Bearer " + CHAVE_GUARDADA, "bicycle")]))
        self.assertTrue(imagem)
        self.assertEqual(autorizacao_da_imagem, "Bearer " + CHAVE_GUARDADA)


FOTO = "data:image/png;base64," + base64.b64encode(png_de("olho")).decode("ascii")
PEDIDO_AO_JUIZ = ("gpt-4.1-mini", "You are an expert visual selector.", [
    {"type": "text", "text": "Mode: real_only\nKeyword: eye"}, {"type": "text", "text": "Candidate 0\ntitle=olho\nkind=real"},
    {"type": "image_url", "image_url": {"url": FOTO}}], "1760000000000-0")


def julgar(situacao, preparar=lambda openai: None):
    """(o veredito, se a chave pagou, quem a OpenAI de mentira viu julgar) de um pedido ao juiz da porta na `situacao`."""
    with tempfile.TemporaryDirectory() as pasta, OpenAIDeMentira() as openai:
        preparar(openai)
        ia, _ = porta_na_openai(pasta, situacao, openai)
        juiz, _ = ia.para_a_imagem(False)
        texto, _, pela_chave = juiz.julgar(*PEDIDO_AO_JUIZ)
        return json.loads(texto), pela_chave, [autorizacao for autorizacao, _, _ in openai.juizes]


def recusar_o_juiz_do_plano(status, codigo):
    def preparar(openai):
        openai.recusa_do_juiz_do_plano = (status, codigo)
    return preparar


class OJuizDaImagemPelaPorta(unittest.TestCase):
    def test_com_o_login_o_juiz_vai_pelo_plano_e_a_chave_nao_paga(self):
        veredito, pela_chave, juizes = julgar("com login")
        self.assertEqual((veredito["best_index"], pela_chave, juizes), (0, False, ["Bearer acesso-do-teste"]))

    def test_sem_o_login_o_juiz_vai_pela_chave_presa_e_ela_paga(self):
        _, pela_chave, juizes = julgar("sem login")
        self.assertEqual((pela_chave, juizes), (True, ["Bearer " + CHAVE_GUARDADA]))

    def test_o_plano_que_recusa_de_passagem_deixa_o_juiz_da_chave_decidir(self):
        _, pela_chave, juizes = julgar("com login", recusar_o_juiz_do_plano(503, "server_error"))
        self.assertEqual((pela_chave, juizes[-1]), (True, "Bearer " + CHAVE_GUARDADA))

    def test_o_plano_no_limite_nao_cai_para_a_chave_e_para_o_envio(self):
        with self.assertRaises(envio.motor_do_complemento().provedores.ErroDoProvedor) as parou:
            julgar("com login", recusar_o_juiz_do_plano(429, "subscription_sharing_usage_limit_exceeded"))
        self.assertEqual(parou.exception.codigo, "chatgpt_usage_limit")

    def test_sem_chave_o_plano_que_recusa_de_passagem_nao_tem_para_onde_cair(self):
        with self.assertRaises(envio.motor_do_complemento().provedores.ErroDoProvedor):
            julgar("com login, sem chave", recusar_o_juiz_do_plano(503, "server_error"))


PEDIDO_DE_CORRECAO = (COMECO_DO_PROMPT + ".", "Word: give up\nExample sentence: She gave up smoking\nLearner's sentence: She give up the job", "")


class ACorrecaoPelaPorta(unittest.TestCase):
    def test_pela_chave_a_correcao_vai_com_a_chave_e_o_custo_fica_a_parte_do_dos_cartoes(self):
        with tempfile.TemporaryDirectory() as pasta, OpenAIDeMentira() as openai:
            ia, config = porta_na_openai(pasta, "sem login", openai)
            corrigida = ia.pedido_do_texto(ia.para_o_texto(), config, CORRECAO)(*PEDIDO_DE_CORRECAO)
            registros = custos(config)
        self.assertEqual(corrigida, "She give up the job")
        self.assertEqual(openai.correcoes, [("Bearer " + CHAVE_GUARDADA, "She give up the job", "give up")])
        self.assertEqual([(r["type"], r["model"], r["input_tokens"], r["output_tokens"], r["cost_usd"]) for r in registros],
                         [("correction_tokens", "gpt-4o", 300, 40, 0.00115)])

    def test_pelo_plano_a_correcao_nao_gasta_a_chave_e_custa_zero(self):
        with tempfile.TemporaryDirectory() as pasta, OpenAIDeMentira() as openai:
            ia, config = porta_na_openai(pasta, "com login", openai)
            corrigida = ia.pedido_do_texto(ia.para_o_texto(), config, CORRECAO)(*PEDIDO_DE_CORRECAO)
            registros = custos(config)
        self.assertEqual(corrigida, "She give up the job")
        self.assertEqual([autorizacao for autorizacao, _, _ in openai.correcoes], ["Bearer acesso-do-teste"])
        self.assertEqual([(r["type"], r["model"], r["cost_usd"]) for r in registros], [("correction_tokens", "gpt-6-luna", 0.0)])
        self.assertNotIn("acesso-do-teste", json.dumps(registros))

    def test_so_o_texto_e_a_correcao_sao_pedidos_pela_porta(self):
        with self.assertRaises(ValueError):
            IaDosCartoes(None, None, None).pedido_do_texto(None, {"paths": {"log_dir": "."}}, IMAGEM)


if __name__ == "__main__":
    unittest.main()

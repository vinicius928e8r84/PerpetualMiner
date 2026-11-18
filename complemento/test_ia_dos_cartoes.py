"""Quem paga cada pedido (C5), pela porta da IA dos cartões e sem montar um Envio: a tabela etapa × situação de
`docs/design/ia-dos-cartoes.md`, o que a porta lê do login e do cofre guardados (os arquivos reais, numa pasta temporária) e a
credencial que ela entrega a cada etapa. O caminho inteiro, com o servidor e a OpenAI de mentira, segue em `test_quem_paga.py`,
`test_imagem_pelo_plano.py`, `test_voz_de_reserva.py` e `test_ouvir_a_voz.py`.

    python3.9 complemento/test_ia_dos_cartoes.py
"""

import json
import logging
import os
import sys
import tempfile
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.chaves import Cofre
from complemento.ia_dos_cartoes import CORRECAO, ETAPAS, IMAGEM, JUIZ, OUVIR, TEXTO, VOZ, IaDosCartoes, quem_paga_a_etapa
from complemento.login_do_chatgpt import ACABOU, CONECTADA, SAIU, SEM_LOGIN, ErroDoPlano, LoginDoChatGPT
from complemento.modelo_dos_cartoes import CHAVE, PARADO, PLANO

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


def guardar(pasta, login, tem_chave):
    """Os arquivos do login e da chave de uma situação, como a Conexão os deixa em `user_files/chaves`."""
    if login == CONECTADA:
        guardado = {"client_id": "cliente", "access_token": "token", "refresh_token": "renovar", "expira_em": time.time() + 3600}
    else:
        guardado = {"acabou": SAIU, "em": 1} if login == ACABOU else None
    if guardado is not None:
        with open(os.path.join(pasta, "chatgpt.json"), "w", encoding="utf-8") as arquivo:
            json.dump(guardado, arquivo)
    cofre = Cofre(pasta)
    if tem_chave:
        cofre.guardar("openai", CHAVE_GUARDADA)
    return LoginDoChatGPT(pasta, logging.getLogger("teste"), base="http://127.0.0.1:9", api="http://127.0.0.1:9"), cofre


def porta(pasta, situacao):
    login, _, _, tem_chave = SITUACOES[situacao]
    return IaDosCartoes(*guardar(pasta, login, tem_chave), modelos=None)


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

    def test_a_imagem_sem_login_vai_so_pela_chave(self):
        with tempfile.TemporaryDirectory() as pasta:
            par = porta(pasta, "sem login").para_a_imagem(False)
        self.assertEqual(par, (None, CHAVE_GUARDADA))

    def test_a_imagem_com_usar_a_minha_chave_nao_pede_o_token_do_login_acabado(self):
        with tempfile.TemporaryDirectory() as pasta:
            par = porta(pasta, "Usar a minha chave, login acabado").para_a_imagem(True)
        self.assertEqual(par, (None, CHAVE_GUARDADA))

    def test_a_imagem_com_o_login_acabado_para_como_o_texto(self):
        with tempfile.TemporaryDirectory() as pasta:
            ia = porta(pasta, "login acabado")
            with self.assertRaises(ErroDoPlano) as parou:
                ia.para_a_imagem(False)
        self.assertEqual(parou.exception.codigo, SAIU)


if __name__ == "__main__":
    unittest.main()

import json
import logging
import os
import sys
import tempfile
import unittest
from collections import namedtuple
from datetime import date
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import openai_api
from complemento.login_do_chatgpt import ACABOU, CONECTADA, SAIU, SEM_LOGIN, ErroDoPlano
from complemento.modelo_dos_cartoes import CHAVE, PARADO, PLANO, SEM_CHAVE, Conta, ListaDosModelos, ModeloDosCartoes, Pagador, credencial

HOJE = date(2026, 11, 20)
CHAVE_GUARDADA = "sk-test-credencial-0000"
LISTA = [
    {"modelo": "gpt-4o", "texto": True, "foto": True, "saida": None},
    {"modelo": "gpt-4.1", "texto": True, "foto": True, "saida": ""},
    {"modelo": "gpt-4.1-mini", "texto": True, "foto": True, "saida": "2026-12-01"},
    {"modelo": "gpt-3.5", "texto": True, "foto": False, "saida": None},
    {"modelo": "gpt-vision", "texto": False, "foto": True, "saida": None},
    {"modelo": "gpt-velho", "texto": True, "foto": True, "saida": "2026-11-20"},
    {"modelo": "gpt-torto", "texto": True, "foto": True, "saida": "20 de novembro"},
]
MODELO_DO_MOTOR = "gpt-4o"
LOGGER = logging.getLogger("teste_modelo_credencial")
LOGGER.addHandler(logging.NullHandler())
LOGGER.propagate = False
DA_CONTA = ("gpt-4o", "gpt-4.1", "gpt-4.1-mini", "gpt-3.5")
OpenAIDaConta = namedtuple("OpenAIDaConta", "modelos modelo_do_motor", defaults=(DA_CONTA, MODELO_DO_MOTOR))


class LoginDeMentira:
    def __init__(self, situacao=(CONECTADA, None), token="acesso-do-teste", erro_do_token=None, erro_da_lista=None):
        self._situacao, self._token, self._erro_do_token, self._erro_da_lista = situacao, token, erro_do_token, erro_da_lista
        self.listagens = 0

    def situacao(self):
        return self._situacao

    def token(self):
        if self._erro_do_token:
            raise self._erro_do_token
        return self._token

    def modelos(self, token):
        self.listagens += 1
        if self._erro_da_lista:
            raise self._erro_da_lista
        return ["gpt-6-luna", "gpt-6-sol"]


class CofreDeMentira:
    def __init__(self, chave):
        self._chave = chave

    def ler(self, nome, conta=""):
        return self._chave


class UmaConta:
    def __init__(self, teste, chave=CHAVE_GUARDADA, login=None, openai=OpenAIDaConta()):
        pasta = tempfile.TemporaryDirectory()
        teste.addCleanup(pasta.cleanup)
        self.arquivo = os.path.join(pasta.name, "modelo-dos-cartoes.json")
        self.conta = Conta(login, CofreDeMentira(chave), "http://127.0.0.1:9")
        lista = ListaDosModelos(LISTA, lambda: HOJE, lambda: openai.modelo_do_motor, LOGGER)
        self.modelos = ModeloDosCartoes(self.arquivo, lista, self.conta, LOGGER)
        self.listagens_da_chave = []
        self.da_conta = openai.modelos

    def credencial(self, plano=None, so_a_chave=False):
        plano = {} if plano is None else plano
        with mock.patch.object(openai_api, "modelos_da_conta", side_effect=self._listar):
            return credencial(self.conta, plano, self.modelos, so_a_chave)

    def _listar(self, base, chave):
        self.listagens_da_chave.append(chave)
        if isinstance(self.da_conta, Exception):
            raise self.da_conta
        return list(self.da_conta)

    def escolher(self, escolha, paga):
        with open(self.arquivo, "w", encoding="utf-8") as arquivo:
            json.dump({"escolha": escolha, "trocou": None, "paga": paga}, arquivo)

    def guardado(self):
        with open(self.arquivo, encoding="utf-8") as arquivo:
            return json.load(arquivo)


def da_chave(modelo):
    return Pagador(CHAVE, {"provedor": "openai", "segredo": CHAVE_GUARDADA, "modelo": modelo}, None)


def do_plano(modelo):
    return Pagador(PLANO, {"provedor": "openai", "via": "plano", "segredo": "acesso-do-teste", "modelo": modelo}, None)


def parado(motivo):
    return Pagador(PARADO, None, motivo)


class AListaDosModelos(unittest.TestCase):
    def lista(self, hoje=HOJE, do_motor=MODELO_DO_MOTOR):
        return ListaDosModelos(LISTA, lambda: hoje, lambda: do_motor, LOGGER)

    def test_a_chave_so_oferece_quem_faz_texto_e_foto_na_ordem_da_lista(self):
        self.assertEqual(self.lista().com_foto, ["gpt-4o", "gpt-4.1", "gpt-4.1-mini", "gpt-velho", "gpt-torto"])

    def test_um_modelo_sai_no_dia_da_saida_e_nao_antes(self):
        antes, no_dia = self.lista(date(2026, 11, 19)), self.lista()
        self.assertEqual([antes.saiu("gpt-velho"), no_dia.saiu("gpt-velho")], [False, True])
        self.assertEqual([no_dia.saiu(modelo) for modelo in ("gpt-4o", "gpt-4.1", "gpt-torto", "gpt-desconhecido")], [False] * 4)

    def test_o_aviso_da_saida_vale_so_ate_a_vespera(self):
        lista = self.lista()
        self.assertEqual(lista.aviso_da_saida("gpt-4.1-mini"), {"modelo": "gpt-4.1-mini", "saida": "2026-12-01"})
        self.assertEqual([lista.aviso_da_saida(modelo) for modelo in ("gpt-velho", "gpt-4o", "gpt-4.1", "gpt-desconhecido")], [None] * 4)

    def test_a_lista_diz_se_o_modelo_do_motor_saiu(self):
        self.assertEqual([self.lista(do_motor=modelo).o_do_motor_saiu() for modelo in ("gpt-velho", "gpt-4o")], [True, False])

    def test_uma_data_que_nao_e_um_dia_e_avisada_no_log_e_o_modelo_nao_sai(self):
        with self.assertLogs(LOGGER, "WARNING") as registro:
            lista = self.lista()
        self.assertEqual(registro.output, ["WARNING:teste_modelo_credencial:Modelo dos cartões: a data de saída de gpt-torto não é um dia (AAAA-MM-DD)"])
        self.assertFalse(lista.saiu("gpt-torto"))


class ACredencialDaChave(unittest.TestCase):
    def test_sem_login_a_chave_paga_e_o_modelo_fica_no_automatico_sem_nome(self):
        self.assertEqual(UmaConta(self).credencial(), da_chave(None))

    def test_o_automatico_da_chave_vira_o_primeiro_da_oferta_so_quando_o_do_motor_saiu(self):
        conta = UmaConta(self, openai=OpenAIDaConta(("gpt-4.1", "gpt-4o", "gpt-velho"), "gpt-velho"))
        self.assertEqual(conta.credencial(), da_chave("gpt-4o"))

    def test_o_modelo_que_a_pessoa_escolheu_vale_se_a_conta_o_oferece(self):
        conta = UmaConta(self)
        conta.escolher("gpt-4.1", CHAVE)
        self.assertEqual(conta.credencial(), da_chave("gpt-4.1"))

    def test_o_modelo_escolhido_que_a_conta_nao_oferece_volta_ao_automatico_e_fica_anotado(self):
        conta = UmaConta(self, openai=OpenAIDaConta(("gpt-4o",)))
        conta.escolher("gpt-4.1", CHAVE)
        self.assertEqual(conta.credencial(), da_chave(None))
        self.assertEqual(conta.guardado(), {"escolha": "automatico", "trocou": {"de": "gpt-4.1"}, "paga": CHAVE})

    def test_a_chave_que_a_openai_recusa_na_lista_segue_sem_oferta_e_com_a_escolha_da_pessoa(self):
        conta = UmaConta(self, openai=OpenAIDaConta(openai_api.ErroDaChave(openai_api.RECUSADA)))
        conta.escolher("gpt-4.1", CHAVE)
        self.assertEqual(conta.credencial(), da_chave("gpt-4.1"))

    def test_a_lista_da_conta_e_pedida_uma_vez_por_envio(self):
        conta = UmaConta(self)
        plano = {}
        primeira, segunda = conta.credencial(plano), conta.credencial(plano)
        self.assertEqual((primeira, segunda, conta.listagens_da_chave, plano), (da_chave(None), da_chave(None), [CHAVE_GUARDADA], {"modelo_da_chave": None}))

    def test_usar_a_minha_chave_passa_por_cima_do_login_conectado(self):
        login = LoginDeMentira()
        self.assertEqual(UmaConta(self, login=login).credencial(so_a_chave=True), da_chave(None))
        self.assertEqual(login.listagens, 0)


class ACredencialDoPlano(unittest.TestCase):
    def test_com_o_login_o_plano_paga_com_o_token_e_o_primeiro_modelo_da_oferta(self):
        conta = UmaConta(self, login=LoginDeMentira())
        plano = {}
        self.assertEqual(conta.credencial(plano), do_plano("gpt-6-luna"))
        self.assertEqual((plano, conta.listagens_da_chave), ({"automatico": "gpt-6-luna", "modelo": "gpt-6-luna"}, []))

    def test_o_modelo_do_plano_que_a_pessoa_escolheu_vale_se_o_plano_o_oferece(self):
        conta = UmaConta(self, login=LoginDeMentira())
        conta.escolher("gpt-6-sol", PLANO)
        self.assertEqual(conta.credencial(), do_plano("gpt-6-sol"))

    def test_a_oferta_do_plano_e_pedida_uma_vez_por_envio(self):
        login = LoginDeMentira()
        conta = UmaConta(self, login=login)
        plano = {}
        conta.credencial(plano)
        conta.credencial(plano)
        self.assertEqual(login.listagens, 1)

    def test_o_login_sem_token_cai_para_a_chave_como_se_nao_houvesse_login(self):
        login = LoginDeMentira(token=None)
        self.assertEqual(UmaConta(self, login=login).credencial(), da_chave(None))
        self.assertEqual(login.listagens, 0)

    def test_o_login_sem_token_e_sem_chave_para_com_o_motivo_da_chave_ausente(self):
        self.assertEqual(UmaConta(self, chave=None, login=LoginDeMentira(token=None)).credencial(), parado(SEM_CHAVE))

    def test_o_erro_do_plano_ao_pedir_o_token_para_com_o_codigo_dele(self):
        login = LoginDeMentira(erro_do_token=ErroDoPlano("chatgpt_not_eligible"))
        self.assertEqual(UmaConta(self, login=login).credencial(), parado("chatgpt_not_eligible"))

    def test_o_erro_do_plano_ao_listar_os_modelos_para_com_o_codigo_dele(self):
        login = LoginDeMentira(erro_da_lista=ErroDoPlano("chatgpt_unreachable"))
        self.assertEqual(UmaConta(self, login=login).credencial(), parado("chatgpt_unreachable"))

    def test_o_login_acabado_para_com_o_motivo_dele_e_so_a_chave_ainda_paga(self):
        conta = UmaConta(self, login=LoginDeMentira(situacao=(ACABOU, SAIU)))
        self.assertEqual((conta.credencial(), conta.credencial(so_a_chave=True)), (parado(SAIU), da_chave(None)))

    def test_sem_login_e_sem_chave_ninguem_paga(self):
        conta = UmaConta(self, chave=None, login=LoginDeMentira(situacao=(SEM_LOGIN, None)))
        self.assertEqual(conta.credencial(), parado(SEM_CHAVE))


if __name__ == "__main__":
    unittest.main()

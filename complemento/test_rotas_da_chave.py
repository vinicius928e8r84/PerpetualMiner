"""As rotas da chave da OpenAI (`rotas_da_chave.py`) chamadas direto, com o cofre e a OpenAI de mentira nas bordas.

Cada corpo tem a resposta `(status, json)` de hoje e os pedidos que chegam ao cofre e à OpenAI, na ordem:

    python3.9 complemento/test_rotas_da_chave.py
"""

import os
import sys
import types
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import openai_api, rotas_da_chave
from complemento.chaves import Cofre, LegadoNaoVinculado, OutraContaNaoEnviada
from complemento.nuvem_da_chave import NuvemDaChave, NuvemIndisponivel

CHAVE = 'sk-proj-ChaveDeTeste0123456789-abcd'
MAIOR_INTEIRO_DO_JS = 9007199254740991
OPENAI_BASE = 'http://openai.de-mentira'
FIRESTORE_BASE = 'http://firestore.de-mentira/v1'
LOGGER = object()
INVALIDO = (400, {'error': 'invalid_request'})
VERSAO_VELHA = (409, {'error': 'stale_key_version'})
ACEITA = (200, {'ok': True, 'ultimos4': 'abcd'})


class MesmaNuvem:
    def __init__(self, uid, token):
        self.esperada = vars(NuvemDaChave(FIRESTORE_BASE, uid, token))

    def __eq__(self, outra):
        return isinstance(outra, NuvemDaChave) and vars(outra) == self.esperada

    def __repr__(self):
        return 'MesmaNuvem(%r)' % (self.esperada,)


def cofre_de_mentira(respostas):
    cofre = mock.create_autospec(Cofre, instance=True)
    for nome, resposta in respostas.items():
        metodo = getattr(cofre, nome)
        if isinstance(resposta, Exception):
            metodo.side_effect = resposta
        else:
            metodo.return_value = resposta
    return cofre


def pedir(rota, corpo, cofre=None, openai=None):
    """(resposta, pedidos ao cofre, chaves conferidas na OpenAI) de `rota(conexao, corpo)`."""
    cofre = cofre_de_mentira(cofre or {})
    conexao = types.SimpleNamespace(cofre=cofre, openai_base=OPENAI_BASE, firestore_base=FIRESTORE_BASE, logger=LOGGER)
    conferidas = []

    def conferir(base, chave, logger):
        conferidas.append((base, chave, logger is LOGGER))
        if openai:
            raise openai_api.ErroDaChave(openai)

    with mock.patch.object(openai_api, 'conferir', conferir):
        resposta = rota(conexao, corpo)
    return resposta, cofre.mock_calls, conferidas


class Caracterizacao(unittest.TestCase):
    rota = None

    def conferir_casos(self, casos):
        for nome, corpo, respostas, openai, esperado, pedidos, conferidas in casos:
            with self.subTest(nome):
                self.assertEqual(pedir(type(self).rota, corpo, respostas, openai), (esperado, pedidos, conferidas))


def reentrega(chave=CHAVE, versao=0, conta=''):
    return mock.call.reentrega('openai', chave, versao, conta)


def guardou(chave=CHAVE, versao=0, conta=''):
    return mock.call.guardar('openai', chave, versao=versao, conta=conta)


CONFERIU = [(OPENAI_BASE, CHAVE, True)]


class GuardarAChave(Caracterizacao):
    rota = staticmethod(rotas_da_chave.guardar_chave_da_openai)

    def test_corpo_fora_da_forma_e_invalido_sem_pedir_nada_ao_cofre_nem_a_openai(self):
        self.conferir_casos([
            ('versão negativa', {'chave': CHAVE, 'versao': -1}, {}, None, INVALIDO, [], []),
            ('versão acima do maior inteiro do JS', {'chave': CHAVE, 'versao': MAIOR_INTEIRO_DO_JS + 1}, {}, None, INVALIDO, [], []),
            ('versão booleana', {'chave': CHAVE, 'versao': True}, {}, None, INVALIDO, [], []),
            ('versão com fração', {'chave': CHAVE, 'versao': 1.0}, {}, None, INVALIDO, [], []),
            ('versão em texto', {'chave': CHAVE, 'versao': '1'}, {}, None, INVALIDO, [], []),
            ('conta que não é texto', {'chave': CHAVE, 'conta': 5}, {}, None, INVALIDO, [], []),
            ('conta nula', {'chave': CHAVE, 'conta': None}, {}, None, INVALIDO, [], []),
            ('conta de 129 caracteres', {'chave': CHAVE, 'conta': 'c' * 129}, {}, None, INVALIDO, [], []),
            ('sem chave', {}, {}, None, INVALIDO, [], []),
            ('chave que não é texto', {'chave': 12345678}, {}, None, INVALIDO, [], []),
            ('chave vazia', {'chave': ''}, {}, None, INVALIDO, [], []),
            ('chave só de espaços', {'chave': ' \t\n '}, {}, None, INVALIDO, [], []),
            ('versão e conta erradas', {'chave': 5, 'versao': -1, 'conta': 5}, {}, None, INVALIDO, [], []),
        ])

    def test_a_reentrega_da_mesma_chave_responde_sem_ir_a_openai(self):
        self.conferir_casos([
            ('repetida na versão atual', {'chave': CHAVE, 'versao': 7, 'conta': 'uid-a'}, {'reentrega': True}, None,
             ACEITA, [reentrega(versao=7, conta='uid-a')], []),
            ('repetida com a versão velha', {'chave': CHAVE, 'versao': 6}, {'reentrega': False}, None,
             VERSAO_VELHA, [reentrega(versao=6)], []),
            ('a versão e a conta que faltam são 0 e vazia', {'chave': CHAVE}, {'reentrega': True}, None,
             ACEITA, [reentrega()], []),
            ('conta de 128 caracteres e a maior versão do JS', {'chave': CHAVE, 'versao': MAIOR_INTEIRO_DO_JS, 'conta': 'c' * 128},
             {'reentrega': True}, None, ACEITA, [reentrega(versao=MAIOR_INTEIRO_DO_JS, conta='c' * 128)], []),
            ('o espaço em volta sai antes da reentrega', {'chave': '  %s\n' % CHAVE}, {'reentrega': True}, None,
             ACEITA, [reentrega()], []),
        ])

    def test_chave_fora_da_forma_e_recusada_sem_ir_a_openai(self):
        recusada = (401, {'error': openai_api.RECUSADA})
        self.conferir_casos([
            ('curta demais', {'chave': 'sk-1234'}, {}, None, recusada, [reentrega(chave='sk-1234')], []),
            ('espaço no meio', {'chave': 'sk-proj abcd1234'}, {}, None, recusada, [reentrega(chave='sk-proj abcd1234')], []),
            ('longa demais', {'chave': 'k' * 257}, {}, None, recusada, [reentrega(chave='k' * 257)], []),
            ('caractere fora da forma', {'chave': 'sk-proj+abcd1234'}, {}, None, recusada, [reentrega(chave='sk-proj+abcd1234')], []),
        ])

    def test_cada_recusa_da_openai_tem_o_seu_status_e_nada_e_guardado(self):
        self.conferir_casos([
            (codigo, {'chave': CHAVE}, {}, codigo, (status, {'error': codigo}), [reentrega()], CONFERIU)
            for codigo, status in [(openai_api.RECUSADA, 401), (openai_api.SEM_CREDITO, 402),
                                   (openai_api.ORGANIZACAO_NAO_VERIFICADA, 403), (openai_api.FORA_DO_AR, 502)]
        ])

    def test_a_chave_conferida_e_guardada_na_versao_e_na_conta_do_corpo(self):
        self.conferir_casos([
            ('guardada', {'chave': ' %s ' % CHAVE, 'versao': 3, 'conta': 'uid-a'}, {'guardar': True}, None,
             ACEITA, [reentrega(versao=3, conta='uid-a'), guardou(versao=3, conta='uid-a')], CONFERIU),
            ('o cofre recusa a versão', {'chave': CHAVE, 'versao': 3}, {'guardar': False}, None,
             VERSAO_VELHA, [reentrega(versao=3), guardou(versao=3)], CONFERIU),
            ('chave de 8 caracteres', {'chave': 'abc.-_9d'}, {'guardar': True}, None,
             (200, {'ok': True, 'ultimos4': '-_9d'}), [reentrega(chave='abc.-_9d'), guardou(chave='abc.-_9d')],
             [(OPENAI_BASE, 'abc.-_9d', True)]),
        ])


class ApagarAChave(Caracterizacao):
    rota = staticmethod(rotas_da_chave.apagar_chave_da_openai)

    def test_cada_corpo_recebe_a_resposta_e_o_pedido_ao_cofre_de_hoje(self):
        self.conferir_casos([
            ('versão negativa', {'versao': -1}, {}, None, INVALIDO, [], []),
            ('versão booleana', {'versao': False}, {}, None, INVALIDO, [], []),
            ('conta que não é texto', {'conta': ['a']}, {}, None, INVALIDO, [], []),
            ('conta de 129 caracteres', {'conta': 'c' * 129}, {}, None, INVALIDO, [], []),
            ('apagada', {'versao': 4, 'conta': 'uid-a'}, {'apagar': True}, None, (200, {'ok': True}),
             [mock.call.apagar('openai', versao=4, conta='uid-a')], []),
            ('a versão e a conta que faltam são 0 e vazia', {}, {'apagar': True}, None, (200, {'ok': True}),
             [mock.call.apagar('openai', versao=0, conta='')], []),
            ('o cofre recusa a versão', {'versao': 2}, {'apagar': False}, None, VERSAO_VELHA, [mock.call.apagar('openai', versao=2, conta='')], []),
        ])


def legado(**mudancas):
    corpo = {'versao': 1, 'chave': CHAVE, 'conta': 'uid-a', 'em': 1700000000000}
    corpo.update(mudancas)
    return {campo: valor for campo, valor in corpo.items() if valor is not ...}


class VincularOLegado(Caracterizacao):
    rota = staticmethod(rotas_da_chave.vincular_legado_da_openai)

    def test_corpo_fora_da_forma_e_invalido_sem_pedir_nada_ao_cofre(self):
        self.conferir_casos([(nome, corpo, {}, None, INVALIDO, [], []) for nome, corpo in [
            ('versão negativa', legado(versao=-1)),
            ('chave que não é texto', legado(chave=None)),
            ('sem chave', legado(chave=...)),
            ('sem conta', legado(conta=...)),
            ('conta que não é texto', legado(conta=7)),
            ('conta de 129 caracteres', legado(conta='c' * 129)),
            ('sem a hora', legado(em=...)),
            ('hora booleana', legado(em=True)),
            ('hora com fração', legado(em=1.5)),
            ('hora negativa', legado(em=-1)),
            ('hora acima do maior inteiro do JS', legado(em=MAIOR_INTEIRO_DO_JS + 1)),
        ]])

    def test_o_cofre_vincula_ou_recusa_o_legado_do_corpo(self):
        self.conferir_casos([
            ('vinculado', legado(), {'vincular_legado': True}, None, (200, {'ok': True}),
             [mock.call.vincular_legado('openai', CHAVE, 'uid-a', 1700000000000, 1)], []),
            ('sem versão, chave e conta vazias, hora 0', legado(versao=..., chave='', conta='', em=0), {'vincular_legado': True}, None,
             (200, {'ok': True}), [mock.call.vincular_legado('openai', '', '', 0, 0)], []),
            ('conta de 128 caracteres e a maior hora do JS', legado(conta='c' * 128, em=MAIOR_INTEIRO_DO_JS),
             {'vincular_legado': True}, None, (200, {'ok': True}),
             [mock.call.vincular_legado('openai', CHAVE, 'c' * 128, MAIOR_INTEIRO_DO_JS, 1)], []),
            ('o cofre recusa', legado(), {'vincular_legado': False}, None, (409, {'error': 'legacy_key_mismatch'}),
             [mock.call.vincular_legado('openai', CHAVE, 'uid-a', 1700000000000, 1)], []),
        ])


def sincronia(**mudancas):
    corpo = {'versao': 2, 'uid': 'uid_A-1', 'token': 'token-do-google'}
    corpo.update(mudancas)
    return {campo: valor for campo, valor in corpo.items() if valor is not ...}


def sincronizou(uid='uid_A-1', token='token-do-google', versao=2):
    return [mock.call.sincronizar('openai', uid, MesmaNuvem(uid, token), versao)]


class SincronizarAChave(Caracterizacao):
    rota = staticmethod(rotas_da_chave.sincronizar_chave_da_openai)

    def test_corpo_fora_da_forma_e_invalido_sem_pedir_nada_ao_cofre(self):
        self.conferir_casos([(nome, corpo, {}, None, INVALIDO, [], []) for nome, corpo in [
            ('versão negativa', sincronia(versao=-1)),
            ('versão booleana', sincronia(versao=True)),
            ('sem uid', sincronia(uid=...)),
            ('uid que não é texto', sincronia(uid=12)),
            ('uid vazio', sincronia(uid='')),
            ('uid com espaço', sincronia(uid='uid a')),
            ('uid com barra', sincronia(uid='uid/a')),
            ('uid com acento', sincronia(uid='uidç')),
            ('uid com quebra de linha no fim', sincronia(uid='uid\n')),
            ('uid de 129 caracteres', sincronia(uid='u' * 129)),
            ('sem token', sincronia(token=...)),
            ('token que não é texto', sincronia(token=5)),
            ('token vazio', sincronia(token='')),
            ('token com \\r', sincronia(token='tok\ren')),
            ('token com \\n', sincronia(token='tok\nen')),
        ]])

    def test_o_cofre_sincroniza_com_a_nuvem_da_conta_do_corpo(self):
        self.conferir_casos([
            ('sincronizada', sincronia(), {'sincronizar': {'versao': 3, 'naoEnviada': False}}, None,
             (200, {'ok': True, 'versao': 3, 'naoEnviada': False}), sincronizou(), []),
            ('sem versão, uid de 128 caracteres', sincronia(versao=..., uid='u' * 128), {'sincronizar': {}}, None,
             (200, {'ok': True}), sincronizou(uid='u' * 128, versao=0), []),
            ('token com espaço passa', sincronia(token=' a b '), {'sincronizar': {}}, None, (200, {'ok': True}),
             sincronizou(token=' a b '), []),
            ('o cofre recusa a versão', sincronia(), {'sincronizar': None}, None, VERSAO_VELHA, sincronizou(), []),
        ])

    def test_cada_recusa_do_cofre_e_da_nuvem_tem_a_sua_resposta(self):
        self.conferir_casos([
            ('outra conta não enviada', sincronia(), {'sincronizar': OutraContaNaoEnviada()}, None,
             (409, {'error': 'other_account_unsent'}), sincronizou(), []),
            ('legado não vinculado', sincronia(), {'sincronizar': LegadoNaoVinculado()}, None,
             (409, {'error': 'legacy_key_unbound'}), sincronizou(), []),
            ('nuvem responde 401', sincronia(), {'sincronizar': NuvemIndisponivel(401)}, None,
             (401, {'error': 'cloud_sync_failed', 'status': 401}), sincronizou(), []),
            ('nuvem fora do ar', sincronia(), {'sincronizar': NuvemIndisponivel(418)}, None,
             (503, {'error': 'cloud_sync_failed', 'status': 503}), sincronizou(), []),
        ])


class EstadoDaIa(Caracterizacao):
    rota = staticmethod(rotas_da_chave.estado_da_ia)

    def test_o_estado_diz_o_documento_do_cofre_sem_a_chave_inteira(self):
        documento = [mock.call.documento('openai')]
        self.conferir_casos([
            ('nunca houve chave', {}, {'documento': {}}, None,
             (200, {'openai': {'configurada': False, 'conta': '', 'versao': 0, 'naoEnviada': False}}), documento, []),
            ('chave sem conta', {'qualquer': 1}, {'documento': {'chave': CHAVE}}, None,
             (200, {'openai': {'configurada': True, 'conta': None, 'versao': 0, 'naoEnviada': True, 'ultimos4': 'abcd'}}),
             documento, []),
            ('chave enviada da conta', {}, {'documento': {'chave': CHAVE, 'conta': 'uid-a', 'versao': 9, 'naoEnviada': False}}, None,
             (200, {'openai': {'configurada': True, 'conta': 'uid-a', 'versao': 9, 'naoEnviada': False, 'ultimos4': 'abcd'}}),
             documento, []),
            ('apagada com a versão guardada', {}, {'documento': {'chave': '', 'conta': 'uid-a', 'versao': 4}}, None,
             (200, {'openai': {'configurada': False, 'conta': 'uid-a', 'versao': 4, 'naoEnviada': False}}), documento, []),
        ])


if __name__ == '__main__':
    unittest.main()

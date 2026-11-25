import http.client
import json
import os
import socket
import sys
import tempfile
import threading
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from test_chave_da_openai import CHAVE, ORIGEM, ConexaoNoTeste, tudo_em_disco
from complemento.test_pareamento_de_mentira import cabecalhos_assinados


PEDIDO_DA_CHAVE = {'chave': CHAVE, 'versao': 0, 'conta': 'A'}


def chave_no_cofre_a_tempo(cofre, limite_s=5):
    limite = time.monotonic() + limite_s
    while cofre.ler('openai') != CHAVE and time.monotonic() < limite: time.sleep(0.01)
    return cofre.ler('openai') == CHAVE


class AutoridadeVersionadaPerdida(unittest.TestCase):
    def perder_a_resposta_do_pedido_da_chave(self, conexao):
        entrou, liberar = threading.Event(), threading.Event()
        def esperar(metodo, _auth):
            if metodo == 'GET':
                entrou.set()
                self.assertTrue(liberar.wait(5))
        conexao.openai.antes_de_responder = esperar
        cliente = http.client.HTTPConnection('127.0.0.1', conexao.conexao.porta, timeout=0.2)
        pedido_da_chave = json.dumps(PEDIDO_DA_CHAVE)
        cliente.request('POST', '/ia/openai/chave', body=pedido_da_chave, headers={
            'Origin': ORIGEM, 'Content-Type': 'application/json',
            **cabecalhos_assinados(conexao.conexao.pareamento.sessao, 'POST', '/ia/openai/chave', pedido_da_chave.encode('utf-8'))})
        self.assertTrue(entrou.wait(5))
        try:
            with self.assertRaises(socket.timeout): cliente.getresponse()
        finally:
            cliente.close()
            liberar.set()

    def conferir_que_o_replay_depois_do_reinicio_so_le(self, conexao):
        antes = conexao.conexao.cofre.documento('openai')
        status, _, corpo = conexao.pedir('POST', '/ia/openai/chave', corpo=PEDIDO_DA_CHAVE)
        self.assertEqual((status, json.loads(corpo)), (200, {'ok': True, 'ultimos4': 'abcd'}))
        self.assertEqual(conexao.openai.pedidos, [])
        self.assertTrue(conexao.conexao.cofre.documento('openai') == antes)
        self.assertEqual(json.loads(conexao.pedir('POST', '/ia/estado')[2])['openai'],
            {'configurada': True, 'ultimos4': 'abcd', 'conta': 'A', 'versao': 1, 'naoEnviada': True})
        self.assertEqual(conexao.pedir('POST', '/ia/openai/chave/apagar', corpo={'versao': 1, 'conta': 'A'})[0], 200)
        self.assertEqual(conexao.pedir('POST', '/ia/openai/chave', corpo=PEDIDO_DA_CHAVE)[0], 409)

    def test_R1_HTTP_perdido_aceita_tarde_e_replay_apos_reinicio_e_so_leitura(self):
        with tempfile.TemporaryDirectory() as pasta:
            with ConexaoNoTeste(pasta) as conexao:
                self.perder_a_resposta_do_pedido_da_chave(conexao)
                self.assertTrue(chave_no_cofre_a_tempo(conexao.conexao.cofre))
            with ConexaoNoTeste(pasta, openai='fora_do_ar') as conexao:
                self.conferir_que_o_replay_depois_do_reinicio_so_le(conexao)
                self.assertFalse(any(CHAVE.encode() in dados for _, dados in tudo_em_disco(pasta)))


if __name__ == "__main__":
    unittest.main()

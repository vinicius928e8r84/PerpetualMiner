"""A resposta HTTP perdida do `POST /ia/openai/chave` (R1): a Conexão aceita tarde, o replay depois do reinício e a leitura só lê (apoio de `test_chave_da_openai.py`).

Roda no Python 3.9 (o do Anki do Mac) e no 3.13:
    python3.9 complemento/test_chave_da_openai_perdida.py
"""

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

from test_chave_da_openai import CHAVE, ORIGEM, ConexaoNoTeste, tudo_em_disco  # noqa: E402
from complemento.test_pareamento_de_mentira import cabecalhos_assinados  # noqa: E402


class AutoridadeVersionadaPerdida(unittest.TestCase):
    def test_R1_HTTP_perdido_aceita_tarde_e_replay_apos_reinicio_e_so_leitura(self):
        entrou, liberar = threading.Event(), threading.Event()
        def esperar(metodo, _auth):
            if metodo == 'GET':
                entrou.set()
                self.assertTrue(liberar.wait(5))
        with tempfile.TemporaryDirectory() as pasta:
            with ConexaoNoTeste(pasta) as conexao:
                conexao.openai.antes_de_responder = esperar
                cliente = http.client.HTTPConnection('127.0.0.1', conexao.conexao.porta, timeout=0.2)
                pedido_da_chave = json.dumps({'chave': CHAVE, 'versao': 0, 'conta': 'A'})
                cliente.request('POST', '/ia/openai/chave', body=pedido_da_chave, headers={
                    'Origin': ORIGEM, 'Content-Type': 'application/json',
                    **cabecalhos_assinados(conexao.conexao.pareamento.sessao, 'POST', '/ia/openai/chave', pedido_da_chave.encode('utf-8'))})
                self.assertTrue(entrou.wait(5))
                try:
                    with self.assertRaises(socket.timeout): cliente.getresponse()
                finally:
                    cliente.close()
                    liberar.set()
                limite = time.monotonic() + 5
                while conexao.conexao.cofre.ler('openai') != CHAVE and time.monotonic() < limite: time.sleep(0.01)
                self.assertTrue(conexao.conexao.cofre.ler('openai') == CHAVE)
            with ConexaoNoTeste(pasta, openai='fora_do_ar') as conexao:
                antes = conexao.conexao.cofre.documento('openai')
                status, _, corpo = conexao.pedir('POST', '/ia/openai/chave', corpo={'chave': CHAVE, 'versao': 0, 'conta': 'A'})
                self.assertEqual((status, json.loads(corpo)), (200, {'ok': True, 'ultimos4': 'abcd'}))
                self.assertEqual(conexao.openai.pedidos, [])
                self.assertTrue(conexao.conexao.cofre.documento('openai') == antes)
                self.assertEqual(json.loads(conexao.pedir('POST', '/ia/estado')[2])['openai'],
                    {'configurada': True, 'ultimos4': 'abcd', 'conta': 'A', 'versao': 1, 'naoEnviada': True})
                self.assertEqual(conexao.pedir('POST', '/ia/openai/chave/apagar', corpo={'versao': 1, 'conta': 'A'})[0], 200)
                self.assertEqual(conexao.pedir('POST', '/ia/openai/chave', corpo={'chave': CHAVE, 'versao': 0, 'conta': 'A'})[0], 409)
                self.assertFalse(any(CHAVE.encode() in dados for _, dados in tudo_em_disco(pasta)))


if __name__ == "__main__":
    unittest.main()

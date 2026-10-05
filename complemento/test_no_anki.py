"""O adaptador que o `__init__.py` usa no Anki, com um `mw` de mentira, pelo HTTP.

    python3.9 complemento/test_no_anki.py
"""

import http.client
import json
import os
import sys
import tempfile
import types
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import configuracao, no_anki  # noqa: E402


class AnkiDeMentira:
    """O que o complemento lê do `mw`: `pm.name` (o perfil que o gerente guarda) e `col` (a coleção aberta)."""

    def __init__(self):
        self.pm = types.SimpleNamespace(name=None)
        self.col = None

    def selecionar_na_janela_de_perfis(self, nome):
        self.pm.name, self.col = nome, None  # `pm.load(nome)` guarda o nome sem abrir a coleção

    def abrir(self, nome):
        self.pm.name, self.col = nome, object()

    def fechar_o_perfil(self):
        self.col = None  # volta à janela de perfis; o gerente ainda lembra o nome


def perfil_na_saude(porta):
    pedido = http.client.HTTPConnection("127.0.0.1", porta, timeout=5)
    try:
        pedido.request("GET", "/health")
        return json.loads(pedido.getresponse().read())["perfil"]
    finally:
        pedido.close()


class PerfilQueOAnkiTemAberto(unittest.TestCase):
    def test_a_saude_so_diz_o_perfil_com_a_colecao_aberta_e_volta_a_null_ao_fechar(self):
        anki = AnkiDeMentira()
        with tempfile.TemporaryDirectory() as pasta:
            conexao = no_anki.ao_carregar(anki, pasta, porta=0)
            try:
                anki.selecionar_na_janela_de_perfis("Maria")
                na_janela = perfil_na_saude(conexao.porta)
                anki.abrir("Maria")
                aberto = perfil_na_saude(conexao.porta)
                anki.fechar_o_perfil()
                de_volta_na_janela = perfil_na_saude(conexao.porta)
            finally:
                conexao.parar()
        self.assertEqual((na_janela, aberto, de_volta_na_janela), (None, "Maria", None))

    def test_a_saude_traz_a_versao_do_complemento_com_o_perfil_do_adaptador(self):
        anki = AnkiDeMentira()
        anki.abrir("João")
        with tempfile.TemporaryDirectory() as pasta:
            conexao = no_anki.ao_carregar(anki, pasta, porta=0)
            try:
                pedido = http.client.HTTPConnection("127.0.0.1", conexao.porta, timeout=5)
                pedido.request("GET", "/health")
                corpo = json.loads(pedido.getresponse().read())
                pedido.close()
            finally:
                conexao.parar()
        self.assertEqual(corpo, {"ok": True, "versao": configuracao.VERSAO, "perfil": "João"})

    def test_ao_importar_fora_do_anki_nada_sobe(self):
        import complemento

        self.assertIsNone(complemento.mw)
        self.assertFalse(hasattr(complemento, "CONEXAO"))


if __name__ == "__main__":
    unittest.main()

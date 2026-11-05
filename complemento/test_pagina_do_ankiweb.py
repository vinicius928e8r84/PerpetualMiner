"""A página da Conexão com o Anki no AnkiWeb (#176): o `package` do arquivo, o código que o painel mostra e o `mod`.

    python3.9 complemento/test_pagina_do_ankiweb.py
"""

import json
import os
import re
import time
import unittest
import zipfile

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
ARQUIVO_NO_PACOTE_DA_EXTENSAO = os.path.join(RAIZ, "conexao", "perpetualminer.ankiaddon")


def codigo_do_ankiweb_da_extensao():
    """O `AnkiWeb.codigo` de `lib/ankiweb.js` (o que o painel mostra no Detalhes), ou `None` antes do primeiro upload."""
    with open(os.path.join(RAIZ, "lib", "ankiweb.js"), encoding="utf-8") as arquivo:
        achado = re.search(r"AnkiWeb\s*=\s*\{\s*codigo:\s*(null|'(\d+)')\s*\}", arquivo.read())
    assert achado, "lib/ankiweb.js mudou de forma: ajuste este teste"
    return achado.group(2)


class PaginaDoAnkiWeb(unittest.TestCase):
    """O `package` do arquivo é o id da página no AnkiWeb (o que a pessoa cola em Obter complementos) e o
    painel mostra esse mesmo código: os três têm de dizer o mesmo número (#176)."""

    def manifesto_entregue(self):
        with zipfile.ZipFile(ARQUIVO_NO_PACOTE_DA_EXTENSAO) as entregue:
            return json.loads(entregue.read("manifest.json"))

    def test_o_package_do_arquivo_e_o_codigo_que_o_painel_mostra(self):
        codigo = codigo_do_ankiweb_da_extensao()
        for manifesto in (self.manifesto_entregue(), json.load(open(os.path.join(AQUI, "manifest.json"), encoding="utf-8"))):
            if codigo is None:
                # Antes do primeiro upload o painel diz “vem em breve” e o `package` é o provisório.
                self.assertEqual(manifesto["package"], "perpetualminer")
            else:
                self.assertEqual(manifesto["package"], codigo)

    def test_com_o_codigo_publicado_o_arquivo_leva_o_mod_da_hora_do_upload(self):
        if codigo_do_ankiweb_da_extensao() is None:
            self.skipTest("o dono ainda não subiu o arquivo: sem código do AnkiWeb não há hora de upload")
        mod = self.manifesto_entregue()["mod"]
        self.assertGreater(mod, 1700000000)
        self.assertLessEqual(mod, time.time())

    def test_o_codigo_do_ankiweb_e_so_digitos(self):
        codigo = codigo_do_ankiweb_da_extensao()
        self.assertTrue(codigo is None or codigo.isdigit())



if __name__ == "__main__":
    unittest.main()

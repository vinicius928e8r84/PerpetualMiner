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
    with open(os.path.join(RAIZ, "lib", "ankiweb.js"), encoding="utf-8") as arquivo:
        achado = re.search(r"AnkiWeb\s*=\s*\{\s*codigo:\s*(null|'(\d+)')\s*\}", arquivo.read())
    assert achado, "lib/ankiweb.js mudou de forma: ajuste este teste"
    return achado.group(2)


class PaginaDoAnkiWeb(unittest.TestCase):
    def manifesto_entregue(self):
        with zipfile.ZipFile(ARQUIVO_NO_PACOTE_DA_EXTENSAO) as entregue:
            return json.loads(entregue.read("manifest.json"))

    def test_o_package_do_arquivo_e_o_codigo_que_o_painel_mostra(self):
        codigo = codigo_do_ankiweb_da_extensao()
        for manifesto in (self.manifesto_entregue(), json.load(open(os.path.join(AQUI, "manifest.json"), encoding="utf-8"))):
            if codigo is None:
                self.assertEqual(manifesto["package"], "perpetualminer")
            else:
                self.assertEqual(manifesto["package"], codigo)

    def test_com_o_codigo_publicado_o_arquivo_leva_um_mod_de_hora_real(self):
        if codigo_do_ankiweb_da_extensao() is None:
            self.skipTest("o dono ainda não subiu o arquivo: sem código do AnkiWeb não há hora de upload")
        mod = self.manifesto_entregue()["mod"]
        self.assertGreater(mod, 1700000000)
        self.assertLessEqual(mod, time.time())

    def test_o_passo_do_dono_manda_refazer_o_arquivo_com_o_mod_do_ankiweb_depois_do_upload(self):
        with open(os.path.join(RAIZ, "docs", "ankiweb", "LEIA-ME.md"), encoding="utf-8") as arquivo:
            passos = arquivo.read()
        self.assertIn("empacotar.py --mod-do-ankiweb conexao/perpetualminer.ankiaddon", passos)
        self.assertNotIn("SOURCE_DATE_EPOCH=<hora do upload", passos)

    def test_o_codigo_do_ankiweb_e_so_digitos(self):
        codigo = codigo_do_ankiweb_da_extensao()
        self.assertTrue(codigo is None or codigo.isdigit())



if __name__ == "__main__":
    unittest.main()

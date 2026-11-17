"""O `mod` do `.ankiaddon` é o que o AnkiWeb dá à página (#503): `empacotar.py --mod-do-ankiweb`, com um AnkiWeb de mentira.

    python3.9 complemento/test_mod_do_ankiweb.py
"""

import io
import json
import os
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from unittest import mock
import zipfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import empacotar


class AnkiWebDeMentira:
    """O download do AnkiWeb como ele é (conferido com `curl -sI`): HEAD em `/shared/download/<id>?v=2.1&p=250900` dá 303 com o `t=` (o `mod`
    da página) na Location; fora disso, 404. `pedidos` guarda o que chegou."""

    def __init__(self, mod=1794839727, pagina="1108882947"):
        pedidos = self.pedidos = []

        class Atende(BaseHTTPRequestHandler):
            def do_HEAD(self):
                pedidos.append(self.path)
                if self.path == "/shared/download/%s?v=2.1&p=250900" % pagina and mod:
                    self.send_response(303)
                    self.send_header("Location", "/svc/shared/download-addon/%s?t=%d&minpt=50&maxpt=260900&bidx=0" % (pagina, mod))
                else:
                    self.send_response(404)
                self.send_header("Content-Length", "0")
                self.end_headers()

            def log_message(self, *argumentos):
                pass

        self.servidor = HTTPServer(("127.0.0.1", 0), Atende)
        self.base = "http://127.0.0.1:%d" % self.servidor.server_address[1]

    def __enter__(self):
        threading.Thread(target=self.servidor.serve_forever, daemon=True).start()
        return self

    def __exit__(self, *erro):
        self.servidor.shutdown()
        self.servidor.server_close()


class ModDoAnkiWeb(unittest.TestCase):
    """O `mod` do arquivo é o que o AnkiWeb dá à página depois do upload, não a hora em que o arquivo foi feito (#503): com outro número,
    o Anki que instala pelo arquivo vê uma atualização para a mesma versão."""

    def test_o_mod_e_o_t_do_redirect_do_download_do_ankiweb(self):
        with AnkiWebDeMentira(mod=1794839727) as ankiweb:
            self.assertEqual(empacotar.mod_do_ankiweb("1108882947", ankiweb.base), 1794839727)
        self.assertEqual(ankiweb.pedidos, ["/shared/download/1108882947?v=2.1&p=250900"])

    def test_pagina_fora_do_ar_nao_da_mod(self):
        with AnkiWebDeMentira(mod=0) as ankiweb:
            with self.assertRaises(empacotar.ErroDoAnkiWeb):
                empacotar.mod_do_ankiweb("1108882947", ankiweb.base)

    def test_sem_rede_nao_da_mod(self):
        with AnkiWebDeMentira() as ankiweb:
            base = ankiweb.base
        with self.assertRaises(empacotar.ErroDoAnkiWeb):
            empacotar.mod_do_ankiweb("1108882947", base)

    def test_o_arquivo_refeito_leva_o_mod_do_ankiweb_e_o_resto_igual(self):
        with tempfile.TemporaryDirectory() as pasta, AnkiWebDeMentira(mod=1794839727) as ankiweb:
            antes = empacotar.empacotar(os.path.join(pasta, "antes.ankiaddon"), mod=1794836771)
            depois = os.path.join(pasta, "depois.ankiaddon")
            with mock.patch("sys.stdout", io.StringIO()):
                self.assertEqual(empacotar.main(["--mod-do-ankiweb", depois], base=ankiweb.base), 0)
            with zipfile.ZipFile(antes) as a, zipfile.ZipFile(depois) as b:
                self.assertEqual(json.loads(b.read("manifest.json"))["mod"], 1794839727)
                self.assertEqual(sorted(a.namelist()), sorted(b.namelist()))
                self.assertEqual([n for n in a.namelist() if a.read(n) != b.read(n)], ["manifest.json"])
            with open(depois, "rb") as arquivo:
                self.assertEqual(arquivo.read(), open(empacotar.empacotar(os.path.join(pasta, "igual.ankiaddon"), mod=1794839727), "rb").read())

    def test_sem_a_pagina_no_ar_o_script_para_sem_escrever_o_arquivo(self):
        with tempfile.TemporaryDirectory() as pasta, AnkiWebDeMentira(mod=0) as ankiweb:
            destino = os.path.join(pasta, "depois.ankiaddon")
            with mock.patch("sys.stderr", io.StringIO()) as erro:
                self.assertEqual(empacotar.main(["--mod-do-ankiweb", destino], base=ankiweb.base), 1)
            self.assertFalse(os.path.exists(destino))
            self.assertIn("1108882947", erro.getvalue())

    def test_sem_a_opcao_o_script_nao_vai_ao_ankiweb(self):
        with tempfile.TemporaryDirectory() as pasta, AnkiWebDeMentira() as ankiweb:
            with mock.patch("sys.stdout", io.StringIO()):
                self.assertEqual(empacotar.main([os.path.join(pasta, "a.ankiaddon")], base=ankiweb.base), 0)
        self.assertEqual(ankiweb.pedidos, [])


if __name__ == "__main__":
    unittest.main()

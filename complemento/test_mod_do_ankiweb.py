"""O `.ankiaddon` da extensão é o arquivo do AnkiWeb com o `mod` que o AnkiWeb dá à página (#503): `empacotar.py --mod-do-ankiweb`, com um AnkiWeb de mentira.

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


CODIGO = "1108882947"
MOD_DO_ANKIWEB = 1794839727
MOD_DO_UPLOAD = 1794836771


def zip_com(servidor, mod):
    saida = io.BytesIO()
    manifesto = {"package": CODIGO, "name": "PerpetualMiner", "mod": mod, "min_point_version": 50}
    with zipfile.ZipFile(saida, "w", zipfile.ZIP_DEFLATED) as pacote:
        pacote.writestr(empacotar._entrada("__init__.py"), b"")
        pacote.writestr(empacotar._entrada("servidor.py"), servidor)
        pacote.writestr(empacotar._entrada("manifest.json"), json.dumps(manifesto, indent=2) + "\n")
    return saida.getvalue()


class AnkiWebDeMentira:
    """O download do AnkiWeb como ele é (conferido com `curl -sI`): HEAD em `/shared/download/<id>?v=2.1&p=250900` dá 303 com o `t=` (o `mod`
    da página) na Location, que serve o zip enviado; fora disso, 404. `pedidos` guarda o que chegou."""

    def __init__(self, mod=MOD_DO_ANKIWEB, zip_do_ankiweb=b"", baixa=True):
        pedidos = self.pedidos = []
        local = "/svc/shared/download-addon/%s?t=%d&minpt=50&maxpt=260900&bidx=0" % (CODIGO, mod)

        class Atende(BaseHTTPRequestHandler):
            def responder(self, status, corpo=b"", local_do_redirect=None):
                pedidos.append(self.command + " " + self.path)
                self.send_response(status)
                if local_do_redirect:
                    self.send_header("Location", local_do_redirect)
                self.send_header("Content-Length", str(len(corpo)))
                self.end_headers()
                if self.command == "GET":
                    self.wfile.write(corpo)

            def atender(self):
                if self.path == "/shared/download/%s?v=2.1&p=250900" % CODIGO and mod:
                    self.responder(303, local_do_redirect=local)
                elif self.path == local and baixa:
                    self.responder(200, zip_do_ankiweb)
                else:
                    self.responder(404)

            do_HEAD = do_GET = atender

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


def ler(caminho):
    with open(caminho, "rb") as arquivo:
        return arquivo.read()


class ModDoAnkiWeb(unittest.TestCase):
    """O `mod` do arquivo é o que o AnkiWeb dá à página depois do upload, não a hora em que o arquivo foi feito (#503): com outro número,
    o Anki que instala pelo arquivo vê uma atualização para a mesma versão."""

    def test_o_mod_e_o_t_do_redirect_do_download_do_ankiweb(self):
        with AnkiWebDeMentira() as ankiweb:
            self.assertEqual(empacotar.mod_do_ankiweb(CODIGO, ankiweb.base), MOD_DO_ANKIWEB)
        self.assertEqual(ankiweb.pedidos, ["HEAD /shared/download/1108882947?v=2.1&p=250900"])

    def test_pagina_fora_do_ar_nao_da_mod(self):
        with AnkiWebDeMentira(mod=0) as ankiweb:
            with self.assertRaises(empacotar.ErroDoAnkiWeb):
                empacotar.mod_do_ankiweb(CODIGO, ankiweb.base)

    def test_sem_rede_nao_da_mod(self):
        with AnkiWebDeMentira() as ankiweb:
            base = ankiweb.base
        with self.assertRaises(empacotar.ErroDoAnkiWeb):
            empacotar.mod_do_ankiweb(CODIGO, base)

    def refazer(self, destino, ankiweb):
        with mock.patch("sys.stdout", io.StringIO()), mock.patch("sys.stderr", io.StringIO()) as erro:
            return empacotar.main(["--mod-do-ankiweb", destino], base=ankiweb.base), erro.getvalue()

    def test_o_arquivo_refeito_e_o_do_ankiweb_com_o_mod_dele_e_nao_as_fontes_de_hoje(self):
        servidor_do_upload = b"# o servidor.py que subiu ao AnkiWeb, que a main de hoje j\xc3\xa1 mudou\n"
        self.assertNotEqual(servidor_do_upload, ler(os.path.join(empacotar.PASTA, "servidor.py")))
        do_ankiweb = zip_com(servidor_do_upload, MOD_DO_UPLOAD)
        with tempfile.TemporaryDirectory() as pasta, AnkiWebDeMentira(zip_do_ankiweb=do_ankiweb) as ankiweb:
            destino = os.path.join(pasta, "perpetualminer.ankiaddon")
            with open(destino, "wb") as arquivo:
                arquivo.write(do_ankiweb)
            codigo, _ = self.refazer(destino, ankiweb)
            self.assertEqual(codigo, 0)
            with zipfile.ZipFile(destino) as feito, zipfile.ZipFile(io.BytesIO(do_ankiweb)) as original:
                self.assertEqual(feito.namelist(), original.namelist())
                self.assertEqual(json.loads(feito.read("manifest.json"))["mod"], MOD_DO_ANKIWEB)
                self.assertEqual([n for n in original.namelist() if feito.read(n) != original.read(n)], ["manifest.json"])
            self.assertEqual(ler(destino), zip_com(servidor_do_upload, MOD_DO_ANKIWEB))

    def test_sem_arquivo_no_destino_ele_nasce_do_arquivo_do_ankiweb(self):
        do_ankiweb = zip_com(b"x = 1\n", MOD_DO_UPLOAD)
        with tempfile.TemporaryDirectory() as pasta, AnkiWebDeMentira(zip_do_ankiweb=do_ankiweb) as ankiweb:
            destino = os.path.join(pasta, "novo", "perpetualminer.ankiaddon")
            self.assertEqual(self.refazer(destino, ankiweb)[0], 0)
            self.assertEqual(ler(destino), zip_com(b"x = 1\n", MOD_DO_ANKIWEB))

    def test_arquivo_versionado_com_outro_codigo_que_o_do_ankiweb_nao_e_sobrescrito(self):
        with tempfile.TemporaryDirectory() as pasta, AnkiWebDeMentira(zip_do_ankiweb=zip_com(b"x = 1\n", MOD_DO_UPLOAD)) as ankiweb:
            destino = os.path.join(pasta, "perpetualminer.ankiaddon")
            versionado = zip_com(b"x = 2\n", MOD_DO_UPLOAD)
            with open(destino, "wb") as arquivo:
                arquivo.write(versionado)
            codigo, erro = self.refazer(destino, ankiweb)
            self.assertEqual(codigo, 1)
            self.assertIn("servidor.py", erro)
            self.assertEqual(ler(destino), versionado)

    def test_hora_da_pagina_anterior_a_do_manifesto_do_arquivo_do_ankiweb_nao_e_gravada(self):
        with tempfile.TemporaryDirectory() as pasta, AnkiWebDeMentira(mod=MOD_DO_UPLOAD - 1, zip_do_ankiweb=zip_com(b"x = 1\n", MOD_DO_UPLOAD)) as ankiweb:
            destino = os.path.join(pasta, "perpetualminer.ankiaddon")
            self.assertEqual(self.refazer(destino, ankiweb)[0], 1)
            self.assertFalse(os.path.exists(destino))

    def test_sem_a_pagina_no_ar_o_script_para_sem_escrever_o_arquivo(self):
        with tempfile.TemporaryDirectory() as pasta, AnkiWebDeMentira(mod=0) as ankiweb:
            destino = os.path.join(pasta, "depois.ankiaddon")
            codigo, erro = self.refazer(destino, ankiweb)
            self.assertEqual(codigo, 1)
            self.assertFalse(os.path.exists(destino))
            self.assertIn(CODIGO, erro)

    def test_download_que_falha_para_sem_escrever_o_arquivo(self):
        with tempfile.TemporaryDirectory() as pasta, AnkiWebDeMentira(baixa=False) as ankiweb:
            destino = os.path.join(pasta, "depois.ankiaddon")
            self.assertEqual(self.refazer(destino, ankiweb)[0], 1)
            self.assertFalse(os.path.exists(destino))

    def test_resposta_que_nao_e_um_zip_para_sem_escrever_o_arquivo(self):
        with tempfile.TemporaryDirectory() as pasta, AnkiWebDeMentira(zip_do_ankiweb=b"<html>login</html>") as ankiweb:
            destino = os.path.join(pasta, "depois.ankiaddon")
            self.assertEqual(self.refazer(destino, ankiweb)[0], 1)
            self.assertFalse(os.path.exists(destino))

    def test_sem_a_opcao_o_script_nao_vai_ao_ankiweb(self):
        with tempfile.TemporaryDirectory() as pasta, AnkiWebDeMentira() as ankiweb:
            with mock.patch("sys.stdout", io.StringIO()), mock.patch.dict(os.environ, {"PM_COMMIT_VERDE": "ignorar"}):
                self.assertEqual(empacotar.main([os.path.join(pasta, "a.ankiaddon")], base=ankiweb.base), 0)
        self.assertEqual(ankiweb.pedidos, [])

    def test_opcao_com_erro_de_digitacao_nao_vira_o_nome_do_arquivo(self):
        with tempfile.TemporaryDirectory() as pasta, mock.patch("sys.stderr", io.StringIO()):
            with self.assertRaises(SystemExit) as saiu:
                empacotar.main(["--mod-ankiweb", os.path.join(pasta, "a.ankiaddon")])
            self.assertNotEqual(saiu.exception.code, 0)
            self.assertEqual(os.listdir(pasta), [])


if __name__ == "__main__":
    unittest.main()

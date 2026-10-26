"""O Openverse de mentira dos testes do complemento, e as imagens que ele e a OpenAI de mentira servem.

Não é um teste: é o que os testes põem no lugar de `https://api.openverse.org` (a busca de fotos e os arquivos delas, na fronteira
HTTP). `png_de(rotulo)` é uma imagem de verdade, diferente para cada rótulo: o teste reconhece qual delas foi guardada pelos bytes.
"""

import json
import struct
import threading
import zlib
from hashlib import sha1
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlsplit

JPEG_DE_MENTIRA = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00" + b"\x00" * 40  # o que o Openverse serve quando o rótulo termina em `.jpg`; só o adaptador de imagem lê


def png_de(rotulo):
    """Um PNG 4x4 de uma cor só que vem do rótulo: dois rótulos, dois arquivos."""
    cor = sha1(rotulo.encode("utf-8")).digest()[:3]
    linhas = b"".join(b"\x00" + cor * 4 for _ in range(4))

    def parte(tipo, dados):
        return struct.pack(">I", len(dados)) + tipo + dados + struct.pack(">I", zlib.crc32(tipo + dados))

    return b"\x89PNG\r\n\x1a\n" + parte(b"IHDR", struct.pack(">IIBBBBB", 4, 4, 8, 2, 0, 0, 0)) + parte(b"IDAT", zlib.compress(linhas)) + parte(b"IEND", b"")


class OpenverseDeMentira:
    """`OpenverseDeMentira({"eye": ["olho-1", "olho-2"]})`: a busca por "eye" acha essas duas fotos, e cada uma é servida em `/foto/<rótulo>`.

    Uma busca que não está em `fotos` não acha nada; `fora_do_ar` (um status) faz toda busca e todo arquivo responderem esse status.
    `buscas` guarda as consultas; `baixados`, os rótulos pedidos; `cabecalhos`, os cabeçalhos de cada pedido que chegou (busca ou arquivo).
    """

    def __init__(self, fotos=None):
        self.fotos = dict(fotos or {})
        self.fora_do_ar = None
        self.buscas = []
        self.baixados = []
        self.cabecalhos = []
        dono = self

        class Atendente(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_GET(self):
                partes = urlsplit(self.path)
                dono.cabecalhos.append(dict(self.headers))
                if dono.fora_do_ar:
                    return self._responder(dono.fora_do_ar, "application/json", b"{}")
                if partes.path == "/v1/images/":
                    consulta = parse_qs(partes.query)["q"][0]
                    dono.buscas.append(consulta)
                    achados = [{"url": "%s/foto/%s" % (dono.base, rotulo), "thumbnail": "%s/foto/%s" % (dono.base, rotulo), "title": rotulo,
                               "creator": "ninguém", "width": 4, "height": 4, "license": "by"} for rotulo in dono.fotos.get(consulta, [])]
                    return self._responder(200, "application/json", json.dumps({"results": achados}).encode("utf-8"))
                if partes.path.startswith("/foto/"):
                    rotulo = unquote(partes.path[len("/foto/"):])
                    dono.baixados.append(rotulo)
                    return self._responder(200, "image/jpeg" if rotulo.endswith(".jpg") else "image/png",
                                           JPEG_DE_MENTIRA + rotulo.encode("utf-8") if rotulo.endswith(".jpg") else png_de(rotulo))
                self._responder(404, "application/json", b"{}")

            def _responder(self, status, tipo, dados):
                self.send_response(status)
                self.send_header("Content-Type", tipo)
                self.send_header("Content-Length", str(len(dados)))
                self.end_headers()
                self.wfile.write(dados)

        self._servidor = ThreadingHTTPServer(("127.0.0.1", 0), Atendente)
        self._servidor.daemon_threads = True
        self.base = "http://127.0.0.1:%d" % self._servidor.server_address[1]
        self._thread = threading.Thread(target=lambda: self._servidor.serve_forever(poll_interval=0.005), daemon=True)

    def __enter__(self):
        self._thread.start()
        return self

    def __exit__(self, *erro):
        self._servidor.shutdown()
        self._servidor.server_close()
        self._thread.join(timeout=5)

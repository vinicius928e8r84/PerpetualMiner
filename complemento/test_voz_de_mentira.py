"""A voz do Google de mentira dos testes do complemento: um servidor HTTP local que responde como o `translate.google.<sotaque>`.

Não é um teste: é o que os testes põem no lugar de `https://translate.google.com`. A Conexão só fala com a voz por HTTP,
então é aqui, na fronteira, que o teste decide como o Google responde. `base` é o modelo de endereço que a Conexão usa
(`{tld}` é o sotaque); o sotaque pedido chega ao servidor como o primeiro pedaço do caminho.
"""

import base64
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit


def audio_de_mentira(sotaque, lang, texto):
    """Os bytes que a voz de mentira devolve para um pedaço de texto: dizem com que sotaque e língua ele foi pedido."""
    return ("mp3-de-mentira|%s|%s|%s" % (sotaque, lang, texto)).encode("utf-8")


class VozDeMentira:
    """`VozDeMentira()` escuta numa porta livre. `pedidos` guarda (sotaque, língua, texto) de cada pedido de áudio, na ordem.

    `recusar(sotaque, status)` faz os pedidos daquele sotaque (`"*"`: todos) voltarem `status` (None volta a aceitar);
    `recusar(..., vezes=n)` só nos n primeiros. `sem_audio()` faz a resposta chegar boa, mas sem áudio dentro.
    """

    def __init__(self):
        self.pedidos = []
        self.cabecalhos = []
        self.recusas = {}  # sotaque (ou "*") → [status, vezes que ainda recusa (None: sempre)]
        self.responde_sem_audio = False
        self.antes_de_responder = lambda: None  # o teste age aqui, com o pedido de áudio já anotado e ainda sem resposta
        dono = self

        class Atendente(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_POST(self):
                tamanho = int(self.headers.get("Content-Length") or 0)
                lido = self.rfile.read(tamanho).decode("utf-8") if tamanho else ""
                partes = urlsplit(self.path)
                sotaque = partes.path.split("/")[1]
                texto_do_pedido = "/" + "/".join(partes.path.split("/")[2:])
                status, corpo = dono._responder(sotaque, texto_do_pedido, parse_qs(partes.query), lido, dict(self.headers.items()))
                dados = corpo.encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(dados)))
                self.end_headers()
                self.wfile.write(dados)

        self._servidor = ThreadingHTTPServer(("127.0.0.1", 0), Atendente)
        self._servidor.daemon_threads = True
        self.base = "http://127.0.0.1:%d/{tld}" % self._servidor.server_address[1]
        self._thread = threading.Thread(target=lambda: self._servidor.serve_forever(poll_interval=0.005), daemon=True)

    def recusar(self, sotaque, status, vezes=None):
        if status is None:
            self.recusas.pop(sotaque, None)
        else:
            self.recusas[sotaque] = [status, vezes]

    def sem_audio(self):
        self.responde_sem_audio = True

    def _recusa(self, sotaque):
        for chave in (sotaque, "*"):
            recusa = self.recusas.get(chave)
            if recusa and recusa[1] != 0:
                if recusa[1] is not None:
                    recusa[1] -= 1
                return recusa[0]
        return None

    def _responder(self, sotaque, caminho, consulta, corpo, cabecalhos):
        # O pedido é o que o gTTS 2.5 faz: POST .../_/TranslateWebserverUi/data/batchexecute, sem consulta, com `f.req=` no corpo.
        pedido = parse_qs(corpo).get("f.req", [""])[0]
        if caminho != "/_/TranslateWebserverUi/data/batchexecute" or consulta or not pedido:
            return 404, "{}"
        rpc = json.loads(pedido)[0][0]
        texto, lang = json.loads(rpc[1])[:2]
        self.pedidos.append((sotaque, lang, texto))
        self.cabecalhos.append(cabecalhos)
        self.antes_de_responder()
        status = self._recusa(sotaque)
        if status:
            return status, "{}"
        if self.responde_sem_audio:
            return 200, ")]}'\n\n20\n[[\"di\",12],[\"af.httprm\",12,\"x\",1]]\n"
        audio = base64.b64encode(audio_de_mentira(sotaque, lang, texto)).decode("ascii")
        linha = json.dumps([["wrb.fr", "jQ1olc", json.dumps([audio]), None, None, None, "generic"]], separators=(",", ":"))
        return 200, ")]}'\n\n%d\n%s\n25\n[[\"di\",10],[\"af.httprm\",9,\"-1\",1]]\n" % (len(linha), linha)

    def __enter__(self):
        self._thread.start()
        return self

    def __exit__(self, *erro):
        self._servidor.shutdown()
        self._servidor.server_close()
        self._thread.join(timeout=5)


def dito(audio):
    """(sotaque, língua, texto) de um áudio da voz de mentira (ou de vários, colados)."""
    return [tuple(parte.split("|", 3)[1:]) for parte in audio.decode("utf-8").split("mp3-de-mentira") if parte]

"""Um servidor HTTP local para os testes de imagem do motor: é a fronteira onde o teste decide o que a OpenAI e o Openverse respondem.

Não é um teste: `ServidorDeMentira({caminho: resposta})`, em que `resposta` é `(status, corpo)` ou uma função de `(pedido)` que a devolve;
`corpo` é `bytes` (como está), `str` (texto) ou um objeto JSON. `pedidos` guarda o que chegou: método, caminho com a busca,
cabeçalhos e o corpo (JSON já lido, se for).
"""

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit


class ServidorDeMentira:
    def __init__(self, rotas=None):
        self.rotas = dict(rotas or {})
        self.pedidos = []
        dono = self

        class Atendente(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def _responder(self):
                tamanho = int(self.headers.get("Content-Length") or 0)
                lido = self.rfile.read(tamanho) if tamanho else b""
                try:
                    corpo = json.loads(lido.decode("utf-8")) if lido else None
                except ValueError:
                    corpo = lido
                pedido = {"metodo": self.command, "caminho": self.path, "cabecalhos": dict(self.headers), "corpo": corpo}
                dono.pedidos.append(pedido)
                resposta = dono.rotas.get(urlsplit(self.path).path, (404, {"error": {"message": "sem rota"}}))
                status, conteudo = resposta(pedido) if callable(resposta) else resposta
                tipo = "application/json"
                if isinstance(conteudo, tuple):
                    tipo, conteudo = conteudo
                dados = conteudo if isinstance(conteudo, bytes) else conteudo.encode("utf-8") if isinstance(conteudo, str) else json.dumps(conteudo).encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", tipo)
                self.send_header("Content-Length", str(len(dados)))
                self.end_headers()
                self.wfile.write(dados)

            do_GET = do_POST = _responder

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

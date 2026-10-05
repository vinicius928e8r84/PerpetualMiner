"""A OpenAI de mentira dos testes do complemento: um servidor HTTP local que responde como a OpenAI.

Não é um teste: é o que os testes põem no lugar de `https://api.openai.com`. O complemento só fala com
ela por HTTP, então é aqui, na fronteira, que o teste decide como a OpenAI responde.
"""

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# O que cada comportamento faz com os dois pedidos que a Conexão faz ao conferir uma chave:
# (status, corpo) de GET /v1/models e de POST /v1/embeddings.
MODELOS_OK = (200, {"object": "list", "data": [{"id": "gpt-4.1-mini", "object": "model"}]})
EMBEDDINGS_OK = (200, {"object": "list", "data": [{"embedding": [0.0]}]})


def _erro(status, mensagem, tipo, codigo):
    return status, {"error": {"message": mensagem, "type": tipo, "code": codigo}}


COMPORTAMENTOS = {
    "aceita": (MODELOS_OK, EMBEDDINGS_OK),
    "recusa": (
        _erro(401, "Incorrect API key provided.", "invalid_request_error", "invalid_api_key"),
        EMBEDDINGS_OK,
    ),
    "sem_credito": (
        MODELOS_OK,
        _erro(429, "You exceeded your current quota, please check your plan and billing details.", "insufficient_quota", "insufficient_quota"),
    ),
    "org_nao_verificada": (
        MODELOS_OK,
        _erro(403, "Your organization must be verified to use this feature.", "invalid_request_error", None),
    ),
    "fora_do_ar": (
        _erro(503, "The server is overloaded.", "server_error", None),
        _erro(503, "The server is overloaded.", "server_error", None),
    ),
}


class OpenAIDeMentira:
    """`OpenAIDeMentira("aceita")` escuta numa porta livre; `base` é o endereço que a Conexão usa no lugar da OpenAI."""

    def __init__(self, comportamento="aceita"):
        self.comportamento = comportamento
        self.pedidos = []  # (metodo, caminho, Authorization)
        dono = self

        class Atendente(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def _responder(self):
                tamanho = int(self.headers.get("Content-Length") or 0)
                if tamanho:
                    self.rfile.read(tamanho)
                dono.pedidos.append((self.command, self.path, self.headers.get("Authorization")))
                modelos, embeddings = COMPORTAMENTOS[dono.comportamento]
                status, corpo = modelos if self.path == "/v1/models" else embeddings
                dados = json.dumps(corpo).encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(dados)))
                self.end_headers()
                self.wfile.write(dados)

            do_GET = do_POST = _responder

        self._servidor = ThreadingHTTPServer(("127.0.0.1", 0), Atendente)
        self._servidor.daemon_threads = True
        self.base = "http://127.0.0.1:%d" % self._servidor.server_address[1]
        self._thread = threading.Thread(target=lambda: self._servidor.serve_forever(poll_interval=0.05), daemon=True)

    def __enter__(self):
        self._thread.start()
        return self

    def __exit__(self, *erro):
        self._servidor.shutdown()
        self._servidor.server_close()
        self._thread.join(timeout=5)

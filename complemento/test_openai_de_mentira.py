"""A OpenAI de mentira dos testes do complemento: um servidor HTTP local que responde como a OpenAI.

Não é um teste: é o que os testes põem no lugar de `https://api.openai.com`. O complemento só fala com
ela por HTTP, então é aqui, na fronteira, que o teste decide como a OpenAI responde.
"""

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit

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
    # O limite de uso (429 que não diz “quota”) nos dois pedidos: nada foi conferido.
    "limite_de_uso": (
        _erro(429, "Rate limit reached for requests.", "requests", "rate_limit_exceeded"),
        _erro(429, "Rate limit reached for requests.", "requests", "rate_limit_exceeded"),
    ),
    # Os modelos responderam, mas o pedido pago bateu no limite: a conta não tem como pagar o uso agora.
    "limite_so_no_pago": (
        MODELOS_OK,
        _erro(429, "Rate limit reached for requests.", "requests", "rate_limit_exceeded"),
    ),
    # O pagamento recusado por um 402, direto, em cada um dos dois pedidos.
    "pagamento_402_nos_modelos": (
        _erro(402, "Payment required.", "billing_error", None),
        EMBEDDINGS_OK,
    ),
    "pagamento_402_no_pago": (
        MODELOS_OK,
        _erro(402, "Payment required.", "billing_error", None),
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
        self.antes_de_responder = lambda _metodo, _autorizacao: None
        dono = self

        class Atendente(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def _responder(self):
                tamanho = int(self.headers.get("Content-Length") or 0)
                if tamanho:
                    self.rfile.read(tamanho)
                dono.pedidos.append((self.command, self.path, self.headers.get("Authorization")))
                dono.antes_de_responder(self.command, self.headers.get('Authorization'))
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


class FirestoreDeMentira:
    """Seam HTTP externo; o cofre/sync sob teste continuam reais."""

    def __init__(self):
        self.documentos = {}
        self.falha = 0
        self.recusar_escritas = False
        self.pedidos = []
        dono = self

        class Atendente(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def atender(self):
                caminho = unquote(urlsplit(self.path).path)
                uid = caminho.split('/usuarios/')[-1].split('/')[0]
                dono.pedidos.append((self.command, uid, self.headers.get('Authorization')))
                status, dados = 200, {}
                if dono.falha:
                    status = dono.falha
                elif self.command == 'GET':
                    if uid in dono.documentos:
                        dados = {'fields': dono.documentos[uid]}
                    else:
                        status = 404
                elif self.command == 'PATCH':
                    if dono.recusar_escritas:
                        status = 503
                    else:
                        corpo = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                        dono.documentos[uid] = corpo['fields']
                        dados = {'fields': corpo['fields']}
                else:
                    status = 400
                if status >= 400:
                    dados = {'error': {'code': status, 'message': 'falha externa fictícia'}}
                corpo = json.dumps(dados).encode('utf-8')
                self.send_response(status)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(corpo)))
                self.end_headers()
                self.wfile.write(corpo)

            do_GET = do_PATCH = atender

        self._servidor = ThreadingHTTPServer(('127.0.0.1', 0), Atendente)
        self._servidor.daemon_threads = True
        self.base = 'http://127.0.0.1:%d/documents' % self._servidor.server_address[1]
        self._thread = threading.Thread(target=lambda: self._servidor.serve_forever(poll_interval=0.05), daemon=True)

    def __enter__(self):
        self._thread.start()
        return self

    def __exit__(self, *_erro):
        self._servidor.shutdown()
        self._servidor.server_close()
        self._thread.join(timeout=5)

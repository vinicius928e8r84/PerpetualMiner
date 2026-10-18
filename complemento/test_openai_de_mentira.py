"""A OpenAI de mentira dos testes do complemento: um servidor HTTP local que responde como a OpenAI.

Não é um teste: é o que os testes põem no lugar de `https://api.openai.com`. O complemento só fala com
ela por HTTP, então é aqui, na fronteira, que o teste decide como a OpenAI responde.
"""

import json
import re
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


def _cartao_de_mentira(mensagens):
    """Um Cartão que o motor aceita, feito do pedido: a Palavra no verso, destacada na frente, e o contexto, se veio."""
    pedido = mensagens[-1]["content"]
    if re.search(r"[\u0400-\u04FF]", pedido):  # russo: a frase inteira é a frente
        frase = pedido.split("\n")[0]
        return "Front\n%s\n\nBack\nPronunciation: x\n\nTranslation: tradução de mentira\n" % frase
    alvo = re.search(r"Target keyword for this card: (.+)", pedido)
    linha = pedido.split("Input Format:\n")[-1].strip()
    palavra, frase = [parte.strip() for parte in linha.split(" : ", 1)]
    palavra = alvo.group(1).strip() if alvo else palavra
    contexto = re.search(r"\[Contexto: (.+?)\]", frase)
    frase = re.sub(r"\s*\[Contexto: .+?\]", "", frase)
    frente = frase.replace(palavra, "*%s*" % palavra, 1) if palavra in frase else "*%s* aqui" % palavra
    fonte = "Source Context: %s\n\n" % contexto.group(1) if contexto else ""
    return "%sFront: %s\n\nBack: %s - /ipa/\n\nDefinition: definição de mentira.\n" % (fonte, frente, palavra)


def _palavra_do_pedido(mensagens):
    pedido = mensagens[-1]["content"]
    alvo = re.search(r"Target keyword for this card: (.+)", pedido)
    return alvo.group(1).strip() if alvo else pedido.split("Input Format:\n")[-1].split(" : ", 1)[0].strip()


class OpenAIDeMentira:
    """`OpenAIDeMentira("aceita")` escuta numa porta livre; `base` é o endereço que a Conexão usa no lugar da OpenAI.

    A conferência da chave (`/v1/models`, `/v1/embeddings`) segue o `comportamento`. O texto dos Cartões
    (`/v1/chat/completions`) volta um Cartão válido feito do pedido, com 1000 tokens de entrada e 200 de saída,
    salvo para a Palavra que `recusar_o_chat_de` mandou recusar (`"*"`: todas). `chats` guarda (Authorization, corpo).
    """

    def __init__(self, comportamento="aceita"):
        self.comportamento = comportamento
        self.pedidos = []  # (metodo, caminho, Authorization)
        self.chats = []  # (Authorization, corpo) de cada pedido de texto
        self.recusas_do_chat = {}  # Palavra (ou "*") → (status, código)
        self.antes_de_responder = lambda _metodo, _autorizacao: None
        dono = self

        class Atendente(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def _responder(self):
                tamanho = int(self.headers.get("Content-Length") or 0)
                lido = self.rfile.read(tamanho) if tamanho else b""
                dono.pedidos.append((self.command, self.path, self.headers.get("Authorization")))
                dono.antes_de_responder(self.command, self.headers.get('Authorization'))
                modelos, embeddings = COMPORTAMENTOS[dono.comportamento]
                if self.path == "/v1/chat/completions":
                    status, corpo = dono._chat(self.headers.get("Authorization"), json.loads(lido.decode("utf-8")))
                else:
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
        self._thread = threading.Thread(target=lambda: self._servidor.serve_forever(poll_interval=0.005), daemon=True)

    def recusar_o_chat_de(self, palavra, status, codigo):
        """O texto da `palavra` (`"*"`: de todas) volta `status` com o erro `codigo`; `status` None volta a aceitar."""
        if status is None:
            self.recusas_do_chat.pop(palavra, None)
        else:
            self.recusas_do_chat[palavra] = (status, codigo)

    def _chat(self, autorizacao, corpo):
        self.chats.append((autorizacao, corpo))
        recusa = self.recusas_do_chat.get(_palavra_do_pedido(corpo["messages"])) or self.recusas_do_chat.get("*")
        if recusa:
            return _erro(recusa[0], "Incorrect API key provided: %s" % (autorizacao or ""), "x", recusa[1])
        texto = _cartao_de_mentira(corpo["messages"])
        return 200, {"choices": [{"message": {"role": "assistant", "content": texto}}], "usage": {"prompt_tokens": 1000, "completion_tokens": 200}}

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
        self._thread = threading.Thread(target=lambda: self._servidor.serve_forever(poll_interval=0.005), daemon=True)

    def __enter__(self):
        self._thread.start()
        return self

    def __exit__(self, *_erro):
        self._servidor.shutdown()
        self._servidor.server_close()
        self._thread.join(timeout=5)

"""O servidor de login do ChatGPT de mentira dos testes do complemento (o `auth.openai.com` do Sign in with ChatGPT).

Não é um teste: é o que os testes põem no lugar do servidor de login. A Conexão só fala com ele por HTTP (a troca do
código, a renovação e a revogação); o navegador da pessoa é o teste, que lê a URL de autorização e devolve o retorno
(`autorizar`). Os tokens que ele emite têm marcas únicas (`MARCA`), para os testes procurarem um vazamento em tudo.
"""

import base64
import hashlib
import json
import secrets
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, parse_qsl, urlsplit

MARCA = "SEGREDO-DO-CHATGPT"
ESCOPO_DO_PLANO = "chatgpt.tokens.use.direct"
ESCOPOS = "openid profile email offline_access resource.invoke " + ESCOPO_DO_PLANO


def _base64url(dados):
    return base64.urlsafe_b64encode(dados).rstrip(b"=").decode("ascii")


def id_token(nonce):
    """Um `id_token` com a forma de um JWT (a assinatura é de mentira: a Conexão não a confere, limite 5.c)."""
    corpo = {"iss": "https://auth.openai.com", "sub": "sub-%s" % MARCA, "nonce": nonce, "email": "pessoa@exemplo.com"}
    return ".".join([_base64url(b'{"alg":"RS256"}'), _base64url(json.dumps(corpo).encode("utf-8")), _base64url(MARCA.encode("utf-8"))])


class ChatGPTDeMentira:
    """`ChatGPTDeMentira()` escuta numa porta livre; `base` é o endereço que a Conexão usa no lugar do servidor de login.

    `troca` diz como a troca do código responde (`aceita`, `sem_plano`, `invalid_grant`, `fora_do_ar`) e `renovacao` como a
    renovação responde (`aceita`, `invalid_grant`, `fora_do_ar`). `pedidos` guarda (método, caminho, formulário) de cada pedido;
    `revogados`, os `refresh_token` revogados; `emitidos`, cada token emitido.
    """

    def __init__(self):
        self.troca = "aceita"
        self.renovacao = "aceita"
        self.revogacao = 200
        self.validade = 3600
        self.pedidos = []
        self.revogados = []
        self.emitidos = []
        self._codigos = {}  # código → o que a autorização pediu
        self._renovaveis = {}  # refresh_token → client_id
        self._tranca = threading.Lock()
        dono = self

        class Atendente(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def atender(self):
                tamanho = int(self.headers.get("Content-Length") or 0)
                formulario = dict(parse_qsl(self.rfile.read(tamanho).decode("utf-8"))) if tamanho else {}
                caminho = urlsplit(self.path).path
                dono.pedidos.append((self.command, caminho, formulario))
                status, corpo = dono._responder(self.command, caminho, formulario)
                dados = b"" if corpo is None else json.dumps(corpo).encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(dados)))
                self.end_headers()
                self.wfile.write(dados)

            do_GET = do_POST = atender

        self._servidor = ThreadingHTTPServer(("127.0.0.1", 0), Atendente)
        self._servidor.daemon_threads = True
        self.base = "http://127.0.0.1:%d" % self._servidor.server_address[1]
        self._thread = threading.Thread(target=lambda: self._servidor.serve_forever(poll_interval=0.005), daemon=True)

    def autorizar(self, url, client_id=None, erro=None):
        """O navegador da pessoa: lê a URL de autorização, “entra” e devolve a consulta do retorno (`code`, `state`, `client_id`)."""
        parametros = {chave: valor[0] for chave, valor in parse_qs(urlsplit(url).query).items()}
        if erro:
            return {"error": erro, "state": parametros["state"]}
        codigo = "codigo-%s-%s" % (MARCA, secrets.token_hex(8))
        emitido = client_id or "oaiapp_%s" % secrets.token_hex(6)
        self._codigos[codigo] = dict(parametros, emitido=emitido)
        return {"code": codigo, "state": parametros["state"], "client_id": emitido, "scope": ESCOPOS}

    def _tokens(self, client_id, nonce=None, escopos=ESCOPOS):
        acesso = "acesso-%s-%s" % (MARCA, secrets.token_hex(8))
        renovacao = "renovacao-%s-%s" % (MARCA, secrets.token_hex(8))
        self._renovaveis[renovacao] = client_id
        resposta = {"access_token": acesso, "refresh_token": renovacao, "token_type": "Bearer", "expires_in": self.validade, "scope": escopos}
        if nonce is not None:
            resposta["id_token"] = id_token(nonce)
        self.emitidos.extend(valor for chave, valor in resposta.items() if chave.endswith("_token") and chave != "token_type")
        return resposta

    def _responder(self, metodo, caminho, formulario):
        with self._tranca:
            if metodo == "GET" and caminho == "/.well-known/openid-configuration":
                return 200, {"issuer": "https://auth.openai.com", "revocation_endpoint": self.base + "/oauth/revoke"}
            if metodo == "POST" and caminho == "/oauth/revoke":
                if self.revogacao == 200:
                    self.revogados.append(formulario.get("token"))
                    return 200, None
                return self.revogacao, {"error": "server_error"}
            if metodo != "POST" or caminho != "/api/accounts/oauth/token":
                return 404, {"error": "not_found"}
            if formulario.get("grant_type") == "authorization_code":
                return self._trocar(formulario)
            if formulario.get("grant_type") == "refresh_token":
                return self._renovar(formulario)
            return 400, {"error": "unsupported_grant_type"}

    def _trocar(self, formulario):
        if self.troca == "fora_do_ar":
            return 503, {"error": "temporarily_unavailable", "error_description": "o código %s" % formulario.get("code")}
        pedido = self._codigos.pop(formulario.get("code"), None)
        desafio = _base64url(hashlib.sha256(formulario.get("code_verifier", "").encode("ascii")).digest())
        if (self.troca == "invalid_grant" or pedido is None or desafio != pedido["code_challenge"]
                or formulario.get("client_id") != pedido["emitido"] or formulario.get("redirect_uri") != pedido["redirect_uri"]
                or formulario.get("resource") != pedido["resource"]):
            return 400, {"error": "invalid_grant", "error_description": "o verificador %s" % formulario.get("code_verifier")}
        escopos = "openid profile email offline_access" if self.troca == "sem_plano" else ESCOPOS
        return 200, self._tokens(pedido["emitido"], pedido["nonce"], escopos)

    def _renovar(self, formulario):
        if self.renovacao == "fora_do_ar":
            return 503, {"error": "temporarily_unavailable", "error_description": "o token %s" % formulario.get("refresh_token")}
        client_id = self._renovaveis.pop(formulario.get("refresh_token"), None)
        if self.renovacao != "aceita" or client_id is None or client_id != formulario.get("client_id"):
            return 400, {"error": "invalid_grant", "error_description": "o token %s" % formulario.get("refresh_token")}
        return 200, self._tokens(client_id)

    def __enter__(self):
        self._thread.start()
        return self

    def __exit__(self, *erro):
        self._servidor.shutdown()
        self._servidor.server_close()
        self._thread.join(timeout=5)


def situar_o_login(conexao, servidor, situacao):
    """O login da Conexão no estado de um exemplo do contrato: `entrando` (a tentativa aberta), `recusou` (a pessoa recusou no ChatGPT) ou
    `nao_serve` (a conta grátis ou Go: duas trocas seguidas recusadas com `invalid_grant`)."""
    porta, login = conexao.porta, conexao.chatgpt
    servidor.troca = "invalid_grant" if situacao == "nao_serve" else servidor.troca
    for _ in range(2 if situacao == "nao_serve" else 1):
        consulta = servidor.autorizar(login.iniciar(porta), erro="access_denied" if situacao == "recusou" else None)
        if situacao != "entrando":
            login.receber(consulta, "127.0.0.1:%d" % porta, porta)

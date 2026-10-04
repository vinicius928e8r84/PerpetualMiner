"""O servidor da Conexão com o Anki: HTTP em 127.0.0.1, numa thread, só com a biblioteca padrão.

O Anki do Mac roda o Python 3.9, sem Flask, waitress nem requests. Aqui dentro nada
mexe no processo do Anki (proxy, stdout, stderr, `excepthook`, avisos): todo erro
vai ao logger do complemento e vira uma resposta 500, nunca o diálogo de erro do Anki.

Cada rota é uma função `(conexao) -> (status, json)` em `ROTAS`. Uma rota nova entra
junto com seus exemplos em `contrato/exemplos.json` (veja `contrato/LEIA-ME.md`).
"""

import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from .configuracao import ENDERECO


def _saude(conexao):
    return 200, {"ok": True, "versao": conexao.versao, "perfil": conexao.perfil_aberto()}


ROTAS = {
    ("GET", "/health"): _saude,
}


class _Atendente(BaseHTTPRequestHandler):
    server_version = "PerpetualMiner"
    sys_version = ""

    @property
    def conexao(self):
        return self.server.conexao

    def log_message(self, formato, *args):
        # O padrão escreve no stderr. O acesso comum fica em DEBUG, abaixo do nível do log.
        self.conexao.logger.debug("http: " + formato, *args)

    def log_error(self, formato, *args):
        # Pedido que o protocolo recusou (sintaxe, cabeçalho grande demais): isso o log mostra.
        self.conexao.logger.warning("http: " + formato, *args)

    def _responder(self, status, dados=None, origem=None, extras=None):
        corpo = b"" if dados is None else json.dumps(dados, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        if dados is not None:
            self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        if origem:
            self.send_header("Access-Control-Allow-Origin", origem)
            self.send_header("Vary", "Origin")
        for nome, valor in (extras or {}).items():
            self.send_header(nome, valor)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(corpo)

    def _pedido_aceito(self):
        """Só a extensão pode pedir. O Chrome não manda `Origin` no GET que uma página da extensão faz
        com permissão de host (só `Sec-Fetch-Site: none`), mas manda no POST; uma página de outro
        site, mesmo sem `Origin`, vem como cross-site ou same-site, e um programa sem esses
        cabeçalhos não é o navegador da pessoa."""
        origem = self.headers.get("Origin")
        if origem is not None:
            return origem in self.conexao.origens_aceitas
        return self.headers.get("Sec-Fetch-Site") == "none"

    def _atender(self):
        if not self._pedido_aceito():
            return self._responder(403, {"error": "origin_not_allowed"})
        origem = self.headers.get("Origin")
        caminho = self.path.split("?", 1)[0]
        if self.command == "OPTIONS":
            extras = {
                "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": self.headers.get("Access-Control-Request-Headers") or "Content-Type",
                "Access-Control-Max-Age": "600",
            }
            if self.headers.get("Access-Control-Request-Private-Network") == "true":
                extras["Access-Control-Allow-Private-Network"] = "true"
            return self._responder(204, origem=origem, extras=extras)
        rota = ROTAS.get((self.command, caminho))
        if rota is None:
            return self._responder(404, {"error": "not_found"}, origem=origem)
        try:
            status, dados = rota(self.conexao)
        except Exception:
            self.conexao.logger.exception("Erro na rota %s %s", self.command, caminho)
            return self._responder(500, {"error": "internal_error"}, origem=origem)
        return self._responder(status, dados, origem=origem)

    do_GET = do_POST = do_DELETE = do_OPTIONS = _atender


class _Servidor(ThreadingHTTPServer):
    daemon_threads = True
    # No Windows, reaproveitar o endereço deixaria o complemento subir por cima de
    # outro programa que já escuta na porta (a Conexão de hoje): lá a porta ocupada
    # tem de recusar. No Mac e no Linux o reaproveitamento só pula o TIME_WAIT.
    allow_reuse_address = os.name != "nt"

    def handle_error(self, request, client_address):
        # O padrão imprime o erro no stderr.
        self.conexao.logger.exception("Erro ao atender %s", client_address)


class Conexao:
    """O servidor da Conexão: `iniciar()` sobe numa thread, `parar()` encerra."""

    def __init__(self, *, porta, origens_aceitas, versao, perfil_aberto, logger):
        self.porta = porta
        self.origens_aceitas = tuple(origens_aceitas)
        self.versao = versao
        self.perfil_aberto = perfil_aberto
        self.logger = logger
        self._servidor = None
        self._thread = None

    def iniciar(self):
        """Sobe a Conexão. Com a porta ocupada fica quieta, registra o motivo e devolve False."""
        try:
            servidor = _Servidor((ENDERECO, self.porta), _Atendente)
        except OSError as erro:
            self.logger.warning("A porta %d está ocupada ou indisponível; a Conexão não subiu: %s", self.porta, erro)
            return False
        servidor.conexao = self
        self._servidor = servidor
        self.porta = servidor.server_address[1]
        self._thread = threading.Thread(target=self._servir, name="perpetualminer-conexao", daemon=True)
        self._thread.start()
        self.logger.info("Conexão ouvindo em %s:%d", ENDERECO, self.porta)
        return True

    def _servir(self):
        try:
            self._servidor.serve_forever()
        except Exception:
            self.logger.exception("O servidor da Conexão parou")

    def parar(self):
        if self._servidor is None:
            return
        self._servidor.shutdown()
        self._servidor.server_close()
        self._thread.join(timeout=5)
        self._servidor = self._thread = None

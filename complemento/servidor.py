"""O servidor da Conexão com o Anki: HTTP em 127.0.0.1, numa thread, só com a biblioteca padrão.

O Anki do Mac roda o Python 3.9, sem Flask, waitress nem requests. Aqui dentro nada
mexe no processo do Anki (proxy, stdout, stderr, `excepthook`, avisos): todo erro
vai ao logger do complemento e vira uma resposta 500, nunca o diálogo de erro do Anki.

Cada rota é uma função `(conexao, corpo) -> (status, json)` em `ROTAS`; `corpo` é o JSON do pedido,
ou None quando ele não trouxe corpo. Uma rota nova entra
junto com seus exemplos em `contrato/exemplos.json` (veja `contrato/LEIA-ME.md`).
"""

import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from .configuracao import ENDERECO
from .item_de_login import AnkiNaoEncontrado

# O maior corpo que um pedido pode trazer: os de hoje têm dezenas de bytes.
LIMITE_DO_CORPO = 1024 * 1024


def _saude(conexao, corpo):
    return 200, {"ok": True, "versao": conexao.versao, "perfil": conexao.perfil_aberto()}


def _estado_do_item_de_login(conexao, corpo):
    item = conexao.item_de_login
    return 200, {"ok": True, "ligado": item is not None and item.ligado()}


def _abrir_com_o_computador(conexao, corpo):
    """Escreve (`ligado: true`) ou apaga (`ligado: false`) o item de login que abre o Anki com o computador."""
    ligado = corpo.get("ligado") if isinstance(corpo, dict) else None
    if not isinstance(ligado, bool):
        return 400, {"error": "invalid_request"}
    item = conexao.item_de_login
    if item is None:
        return 501, {"error": "login_item_unsupported"}
    try:
        item.ligar() if ligado else item.desligar()
    except AnkiNaoEncontrado:
        conexao.logger.warning("Abrir o Anki com o computador: não se sabe onde o Anki está")
        return 500, {"error": "anki_not_found"}
    except OSError:
        conexao.logger.exception("Abrir o Anki com o computador: não deu para %s o item de login", "escrever" if ligado else "apagar")
        return 500, {"error": "login_item_failed"}
    conexao.logger.info("Abrir o Anki com o computador: %s", "ligado" if item.ligado() else "desligado")
    return 200, {"ok": True, "ligado": item.ligado()}


ROTAS = {
    ("GET", "/health"): _saude,
    ("POST", "/abrir-com-o-computador/estado"): _estado_do_item_de_login,
    ("POST", "/abrir-com-o-computador"): _abrir_com_o_computador,
}

# As rotas que respondem sem a origem da extensão. Rota nova não entra aqui sem decisão do dono:
# o que gasta a chave ou lê dado da pessoa é POST e exige a origem.
ROTAS_ABERTAS = frozenset([("GET", "/health")])


class _CorpoRecusado(Exception):
    def __init__(self, status, erro):
        super().__init__(erro)
        self.status = status
        self.erro = erro


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

    def _pedido_aceito(self, caminho):
        """Só a extensão pode pedir, pela origem dela. A exceção é a saúde: o Chrome manda o GET de uma
        página da extensão sem `Origin` e nada diferencia uma extensão da outra, então `GET /health`
        fica aberto a quem pedir (só diz a versão e o perfil). Tudo o mais exige a origem da extensão.
        O `Origin` não é autenticação: o `fetch` de uma página comum não escolhe esse cabeçalho, mas uma
        extensão com `webRequest` e `extraHeaders` pode pô-lo, e um programa local também. Antes da primeira
        rota que usa a chave ou lê dado privado, isso tem de ser testado e reforçado (ver contrato/LEIA-ME.md)."""
        origem = self.headers.get("Origin")
        if origem is not None:
            return origem in self.conexao.origens_aceitas
        return (self.command, caminho) in ROTAS_ABERTAS

    def _atender(self):
        caminho = self.path.split("?", 1)[0]
        if not self._pedido_aceito(caminho):
            return self._responder(403, {"error": "origin_not_allowed"})
        origem = self.headers.get("Origin")
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
            corpo = self._ler_o_corpo()
        except _CorpoRecusado as recusa:
            return self._responder(recusa.status, {"error": recusa.erro}, origem=origem)
        try:
            status, dados = rota(self.conexao, corpo)
        except Exception:
            self.conexao.logger.exception("Erro na rota %s %s", self.command, caminho)
            return self._responder(500, {"error": "internal_error"}, origem=origem)
        return self._responder(status, dados, origem=origem)

    def _ler_o_corpo(self):
        """O JSON do pedido, ou None sem corpo."""
        try:
            tamanho = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            raise _CorpoRecusado(400, "invalid_json")
        if tamanho > LIMITE_DO_CORPO:
            raise _CorpoRecusado(413, "body_too_large")
        if tamanho <= 0:
            return None
        try:
            return json.loads(self.rfile.read(tamanho).decode("utf-8"))
        except ValueError:
            raise _CorpoRecusado(400, "invalid_json")

    def __getattr__(self, nome):
        # Todo verbo passa pela mesma autorização: sem isto o `http.server` responderia 501
        # (HTML) a HEAD, PUT, PATCH e verbos desconhecidos antes de olhar a origem.
        if nome.startswith("do_"):
            return self._atender
        raise AttributeError(nome)


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

    def __init__(self, *, porta, origens_aceitas, versao, perfil_aberto, logger, item_de_login=None):
        self.porta = porta
        self.origens_aceitas = tuple(origens_aceitas)
        self.versao = versao
        self.perfil_aberto = perfil_aberto
        self.logger = logger
        # O item de login de “Abrir o Anki com o computador”; None onde o sistema não tem (nem Mac nem Windows).
        self.item_de_login = item_de_login
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
            self._servidor.serve_forever(poll_interval=0.05)
        except Exception:
            self.logger.exception("O servidor da Conexão parou")

    def parar(self):
        if self._servidor is None:
            return
        self._servidor.shutdown()
        self._servidor.server_close()
        self._thread.join(timeout=5)
        self._servidor = self._thread = None

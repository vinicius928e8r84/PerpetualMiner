"""O servidor da Conexão com o Anki: HTTP em 127.0.0.1, numa thread, só com a biblioteca padrão.

O Anki do Mac roda o Python 3.9, sem Flask, waitress nem requests. Aqui dentro nada
mexe no processo do Anki (proxy, stdout, stderr, `excepthook`, avisos): todo erro
vai ao logger do complemento e vira uma resposta 500, nunca o diálogo de erro do Anki.

Cada rota é uma função `(conexao, corpo) -> (status, json)` em `ROTAS`; `corpo` é o JSON do pedido
(um objeto) nas rotas POST, e None nas outras. Uma rota nova entra junto com seus exemplos em
`contrato/exemplos.json` (veja `contrato/LEIA-ME.md`).
"""

import json
import os
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from . import openai_api
from .chaves import Cofre
from .configuracao import ENDERECO, OPENAI_BASE

# Um pedido da extensão cabe em poucos KB; o que passa disso não é dela.
LIMITE_DO_CORPO = 16 * 1024

# Uma chave da OpenAI é uma palavra só, de caracteres que cabem num cabeçalho HTTP. O que não tem essa
# forma nem sai da Conexão: não vale gastar um pedido para a OpenAI dizer o que já se vê.
_FORMA_DA_CHAVE = re.compile(r"^[A-Za-z0-9._\-]{8,256}$")

_STATUS_DO_ERRO_DA_CHAVE = {
    openai_api.RECUSADA: 401,
    openai_api.SEM_CREDITO: 402,
    openai_api.ORGANIZACAO_NAO_VERIFICADA: 403,
    openai_api.FORA_DO_AR: 502,
}


def _saude(conexao, corpo):
    return 200, {"ok": True, "versao": conexao.versao, "perfil": conexao.perfil_aberto()}


def _guardar_chave_da_openai(conexao, corpo):
    chave = corpo.get("chave")
    if not isinstance(chave, str) or not chave.strip():
        return 400, {"error": "invalid_request"}
    chave = chave.strip()
    if not _FORMA_DA_CHAVE.match(chave):
        return 401, {"error": openai_api.RECUSADA}
    try:
        openai_api.conferir(conexao.openai_base, chave, conexao.logger)
    except openai_api.ErroDaChave as erro:
        return _STATUS_DO_ERRO_DA_CHAVE[erro.codigo], {"error": erro.codigo}
    conexao.cofre.guardar("openai", chave)
    return 200, {"ok": True, "ultimos4": chave[-4:]}


def _estado_da_ia(conexao, corpo):
    ultimos4 = conexao.cofre.ultimos4("openai")
    if ultimos4 is None:
        return 200, {"openai": {"configurada": False}}
    return 200, {"openai": {"configurada": True, "ultimos4": ultimos4}}


ROTAS = {
    ("GET", "/health"): _saude,
    ("POST", "/ia/openai/chave"): _guardar_chave_da_openai,
    ("POST", "/ia/estado"): _estado_da_ia,
}

# As rotas que respondem sem a origem da extensão. Rota nova não entra aqui sem decisão do dono:
# o que gasta a chave ou lê dado da pessoa é POST e exige a origem.
ROTAS_ABERTAS = frozenset([("GET", "/health")])


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

    def _ler_o_corpo(self):
        """(corpo, None), o objeto JSON do pedido, ou (None, (status, json)) com a recusa."""
        try:
            tamanho = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return None, (400, {"error": "invalid_request"})
        if tamanho > LIMITE_DO_CORPO:
            self.close_connection = True  # o que sobrou do corpo não é lido: a conexão acaba com a resposta
            return None, (413, {"error": "payload_too_large"})
        bruto = self.rfile.read(tamanho) if tamanho else b""
        if not bruto:
            return {}, None  # um POST sem corpo (o estado da IA); a rota que precisa de campo recusa
        try:
            corpo = json.loads(bruto.decode("utf-8"))
        except ValueError:
            return None, (400, {"error": "invalid_request"})
        if not isinstance(corpo, dict):
            return None, (400, {"error": "invalid_request"})
        return corpo, None

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
        corpo = None
        if self.command == "POST":
            corpo, erro = self._ler_o_corpo()
            if erro is not None:
                return self._responder(*erro, origem=origem)
        try:
            status, dados = rota(self.conexao, corpo)
        except Exception:
            self.conexao.logger.exception("Erro na rota %s %s", self.command, caminho)
            return self._responder(500, {"error": "internal_error"}, origem=origem)
        return self._responder(status, dados, origem=origem)

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

    def __init__(self, *, porta, origens_aceitas, versao, perfil_aberto, logger, pasta_das_chaves, openai_base=OPENAI_BASE):
        self.porta = porta
        self.origens_aceitas = tuple(origens_aceitas)
        self.versao = versao
        self.perfil_aberto = perfil_aberto
        self.logger = logger
        self.cofre = Cofre(pasta_das_chaves)
        self.openai_base = openai_base
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

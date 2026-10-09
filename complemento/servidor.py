"""O servidor da Conexão com o Anki: HTTP em 127.0.0.1, numa thread, só com a biblioteca padrão.

O Anki do Mac roda o Python 3.9, sem Flask, waitress nem requests. Aqui dentro nada
mexe no processo do Anki (proxy, stdout, stderr, `excepthook`, avisos): todo erro
vai ao logger do complemento e vira uma resposta 500, nunca o diálogo de erro do Anki.

Cada rota é uma função `(conexao, corpo) -> (status, json)` em `ROTAS`; `corpo` é o JSON do pedido
(`{}` sem corpo). Uma rota nova entra junto com seus exemplos em `contrato/exemplos.json`
(veja `contrato/LEIA-ME.md`).
"""

import json
import os
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from . import baralhos, openai_api
from .chaves import Cofre
from .configuracao import ENDERECO, OPENAI_BASE
from .item_de_login import AnkiNaoEncontrado

# Um pedido maior que isto não é da extensão: a leitura mais pesada (os Baralhos pedidos) cabe em poucos KB.
LIMITE_DO_CORPO = 64 * 1024


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


def _lendo_a_colecao(erro_do_contrato, leitura):
    """Roda a leitura da coleção; sem coleção aberta (ou com o Anki sem responder) é 503 com o `erro_do_contrato`."""
    try:
        return 200, leitura()
    except baralhos.ColecaoIndisponivel as motivo:
        return 503, {"error": erro_do_contrato, "detail": str(motivo)}


def _baralhos_do_anki(conexao, corpo):
    return _lendo_a_colecao("anki_decks_unavailable", lambda: {"decks": baralhos.nomes_dos_baralhos(conexao.colecao)})


def _numeros_dos_baralhos(conexao, corpo):
    pedidos = corpo.get("decks")
    if not isinstance(pedidos, list) or not pedidos or not all(isinstance(pedido, dict) for pedido in pedidos):
        return 400, {"error": "decks_required"}
    return _lendo_a_colecao("anki_stats_unavailable", lambda: baralhos.numeros_dos_baralhos(conexao.colecao, pedidos))


def _vocabulario(conexao, corpo):
    nome = str(corpo.get("deck") or "").strip()
    idioma = str(corpo.get("lang") or "en").strip().lower()
    if not nome:
        return 400, {"error": "deck_required"}
    if idioma not in baralhos.IDIOMAS:
        return 400, {"error": "invalid_lang"}
    return _lendo_a_colecao(
        "anki_vocabulary_unavailable", lambda: baralhos.vocabulario(conexao.colecao, nome, idioma, corpo)
    )


def _versao_da_chave(corpo):
    versao = corpo.get('versao', 0)
    return versao if type(versao) is int and 0 <= versao <= 9007199254740991 else None


def _guardar_chave_da_openai(conexao, corpo):
    versao = _versao_da_chave(corpo)
    if versao is None:
        return 400, {'error': 'invalid_request'}
    geracao = conexao.cofre.documento('openai').get('geracao', 0)
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
    if not conexao.cofre.guardar("openai", chave, versao=versao, se=geracao):
        return 409, {'error': 'stale_key_version'}
    return 200, {"ok": True, "ultimos4": chave[-4:]}


def _apagar_chave_da_openai(conexao, corpo):
    """Apagar chave e Apagar tudo na extensão tiram a cópia daqui também (#154). Trocar a chave a substitui pelo POST /ia/openai/chave."""
    versao = _versao_da_chave(corpo)
    if versao is None:
        return 400, {'error': 'invalid_request'}
    if not conexao.cofre.apagar("openai", versao=versao):
        return 409, {'error': 'stale_key_version'}
    return 200, {"ok": True}


def _estado_da_ia(conexao, corpo):
    ultimos4 = conexao.cofre.ultimos4("openai")
    if ultimos4 is None:
        return 200, {"openai": {"configurada": False}}
    openai = {"configurada": True, "ultimos4": ultimos4}
    versao = conexao.cofre.documento('openai').get('versao', 0)
    if versao:
        openai['versao'] = versao
    return 200, {"openai": openai}


def _estado_do_item_de_login(conexao, corpo):
    item = conexao.item_de_login
    return 200, {"ok": True, "ligado": item is not None and item.ligado()}


def _abrir_com_o_computador(conexao, corpo):
    """Escreve (`ligado: true`) ou apaga (`ligado: false`) o item de login que abre o Anki com o computador."""
    ligado = corpo.get("ligado")
    if not isinstance(ligado, bool):
        return 400, {"error": "invalid_request"}
    item = conexao.item_de_login
    if item is None:
        return 501, {"error": "login_item_unsupported"}
    try:
        if ligado:
            item.ligar()
        else:
            item.desligar()
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
    # O que lê o Anki da pessoa é POST: o GET de uma página da extensão vai sem `Origin` (contrato/LEIA-ME.md).
    ("POST", "/anki/decks"): _baralhos_do_anki,
    ("POST", "/anki/stats/decks"): _numeros_dos_baralhos,
    ("POST", "/anki/vocabulary"): _vocabulario,
    # A chave da OpenAI: POST com a origem da extensão, e nenhuma resposta devolve a chave inteira.
    ("POST", "/ia/openai/chave"): _guardar_chave_da_openai,
    ("POST", "/ia/openai/chave/apagar"): _apagar_chave_da_openai,
    ("POST", "/ia/estado"): _estado_da_ia,
    ("POST", "/abrir-com-o-computador/estado"): _estado_do_item_de_login,
    ("POST", "/abrir-com-o-computador"): _abrir_com_o_computador,
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
        # Erro do próprio servidor (um pedido que estourou o tempo, por exemplo); o texto é o da biblioteca.
        self.conexao.logger.warning("http: " + formato, *args)

    def log_request(self, code="-", size="-"):
        # A linha do pedido é do cliente e pode ser qualquer coisa, a chave colada inclusive: o log só leva a resposta.
        self.conexao.logger.debug("http: resposta %s", code)

    def send_error(self, code, message=None, explain=None):
        """Pedido que o protocolo recusou (sintaxe, versão, método, cabeçalho grande demais).

        A biblioteca repete a linha do pedido na página de erro e no log (`Bad request syntax ('...')`); o que o
        cliente mandou nunca volta nem é escrito, então aqui a resposta e o log são os mesmos para qualquer pedido.
        """
        super().send_error(code)

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
        """O JSON do pedido (`{}` sem corpo), ou None se o corpo não é um objeto JSON ou passa do limite."""
        try:
            tamanho = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return None
        if tamanho <= 0:
            return {}
        if tamanho > LIMITE_DO_CORPO:
            return None
        try:
            corpo = json.loads(self.rfile.read(tamanho).decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            return None
        return corpo if isinstance(corpo, dict) else None

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
        corpo = self._ler_o_corpo()
        if corpo is None:
            return self._responder(400, {"error": "invalid_json"}, origem=origem)
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


class _SemColecao:
    """A coleção de uma Conexão que nasceu sem adaptador: nada a ler."""

    def perfis(self):
        return []

    def nomes_dos_baralhos(self):
        raise baralhos.ColecaoIndisponivel("collection_unavailable")

    cartoes_do_baralho = nomes_dos_baralhos


class Conexao:
    """O servidor da Conexão: `iniciar()` sobe numa thread, `parar()` encerra."""

    def __init__(
        self,
        *,
        porta,
        origens_aceitas,
        versao,
        perfil_aberto,
        logger,
        pasta_das_chaves,
        colecao=None,
        item_de_login=None,
        openai_base=OPENAI_BASE,
    ):
        self.porta = porta
        self.origens_aceitas = tuple(origens_aceitas)
        self.versao = versao
        self.perfil_aberto = perfil_aberto
        self.colecao = colecao or _SemColecao()
        self.logger = logger
        self.cofre = Cofre(pasta_das_chaves)
        self.openai_base = openai_base
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
            self._servidor.serve_forever(poll_interval=0.1)
        except Exception:
            self.logger.exception("O servidor da Conexão parou")

    def parar(self):
        if self._servidor is None:
            return
        self._servidor.shutdown()
        self._servidor.server_close()
        self._thread.join(timeout=5)
        self._servidor = self._thread = None

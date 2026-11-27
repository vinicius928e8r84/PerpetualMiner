import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from .pareamento import CABECALHO_DA_PROVA, Selo, prova_da_resposta
from .paginas_do_navegador import PAGINAS, ROTAS_DO_CHATGPT, responder_a_pagina
from .rotas_da_chave import (
    apagar_chave_da_openai, estado_da_ia, guardar_chave_da_openai, sincronizar_chave_da_openai, vincular_legado_da_openai,
)
from .configuracao import ENDERECO
from .rotas_da_atualizacao import ROTAS_DA_ATUALIZACAO
from .rotas_dos_baralhos import ROTAS_DOS_BARALHOS
from .rotas_da_frente import ROTAS_DA_FRENTE
from .previa_do_cartao import ROTAS_DA_PREVIA
from .rotas_da_voz import ROTAS_DA_VOZ
from .rotas_dos_termos import ROTAS_DOS_TERMOS
from .rotas_do_envio import ROTAS_DO_ENVIO
from .rotas_do_modelo import ROTAS_DO_MODELO
from .rotas_do_teto import ROTAS_DO_TETO
from .rotas_do_pareamento import ROTAS_DO_PAREAMENTO
from .rotas_do_item_de_login import ROTAS_DO_ITEM_DE_LOGIN
from .rotas_do_perfil import abrir_o_perfil_marcado, anki_responde, escolher_o_perfil, listar_os_perfis

LIMITE_DO_CORPO = 64 * 1024
LIMITE_DO_ENVIO = 4 * 1024 * 1024
LIMITES_POR_ROTA = {("POST", "/jobs"): LIMITE_DO_ENVIO}


def _saude(conexao, corpo):
    saude = {"ok": True, "versao": conexao.versao, "perfil": conexao.perfil_aberto()}
    atualizacao = conexao.atualizacao.na_saude()
    if atualizacao is not None:
        saude["atualizacao"] = atualizacao
    return 200, saude


ROTAS = {
    ("GET", "/health"): _saude,
    **ROTAS_DOS_BARALHOS,
    ("POST", "/anki/profiles"): listar_os_perfis,
    ("POST", "/anki/profile"): escolher_o_perfil,
    ("POST", "/anki/profile/open"): abrir_o_perfil_marcado,
    ("POST", "/anki/responde"): anki_responde,
    ("POST", "/ia/openai/chave"): guardar_chave_da_openai,
    ("POST", "/ia/openai/chave/apagar"): apagar_chave_da_openai,
    ("POST", "/ia/openai/sincronizar"): sincronizar_chave_da_openai,
    ("POST", "/ia/openai/legado"): vincular_legado_da_openai,
    ("POST", "/ia/estado"): estado_da_ia,
    **ROTAS_DO_CHATGPT,
    **ROTAS_DO_MODELO,
    **ROTAS_DO_TETO,
    **ROTAS_DA_ATUALIZACAO,
    **ROTAS_DA_VOZ,
    **ROTAS_DOS_TERMOS,
    **ROTAS_DA_FRENTE,
    **ROTAS_DA_PREVIA,
    **ROTAS_DO_ITEM_DE_LOGIN,
    **ROTAS_DO_ENVIO,
    **ROTAS_DO_PAREAMENTO,
}

ROTAS_ABERTAS = frozenset([("GET", "/health")]) | frozenset(PAGINAS)
ROTAS_SEM_ASSINATURA = frozenset(ROTAS_DO_PAREAMENTO) | frozenset([("POST", "/anki/responde")])


class _Atendente(BaseHTTPRequestHandler):
    server_version = "PerpetualMiner"
    sys_version = ""
    _assinado = None

    @property
    def conexao(self):
        return self.server.conexao

    def log_message(self, formato, *args):
        self.conexao.logger.debug("http: " + formato, *args)

    def log_error(self, formato, *args):
        self.conexao.logger.warning("http: " + formato, *args)

    def log_request(self, code="-", size="-"):
        self.conexao.logger.debug("http: resposta %s", code)

    def send_error(self, code, message=None, explain=None):
        super().send_error(code)

    def _responder(self, status, dados=None, origem=None, extras=None):
        corpo = b"" if dados is None else json.dumps(dados, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        if dados is not None:
            self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        self.send_header("Cache-Control", "no-store")
        if origem:
            self.send_header("Access-Control-Allow-Origin", origem)
            self.send_header("Access-Control-Expose-Headers", CABECALHO_DA_PROVA)
            self.send_header("Vary", "Origin")
        if self._assinado is not None:
            self.send_header(CABECALHO_DA_PROVA, prova_da_resposta(Selo(self._assinado.segredo, self.conexao.pareamento.sessao, self._assinado.nonce), status, corpo))
        for nome, valor in (extras or {}).items():
            self.send_header(nome, valor)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(corpo)

    def _rota_e_aberta(self, caminho):
        return (self.command, caminho) in ROTAS_ABERTAS

    def _origem_e_aceita(self, aberta):
        origem = self.headers.get("Origin")
        if origem is None:
            return aberta
        return origem in self.conexao.origens_aceitas

    def _dispensa_a_assinatura(self, caminho):
        return self.command == "OPTIONS" or (self.command, caminho) in ROTAS_SEM_ASSINATURA

    def _assinatura_vale(self, caminho, corpo):
        verificacao = self.conexao.pareamento.verificar(self.command, caminho, corpo, self.headers)
        if verificacao.status != 200:
            return verificacao.status, verificacao.erro
        self._assinado = verificacao
        return None

    def _pedido_aceito(self, caminho, corpo):
        aberta = self._rota_e_aberta(caminho)
        if not self._origem_e_aceita(aberta):
            return 403, "origin_not_allowed"
        if corpo is None:
            return 400, "invalid_json"
        if aberta or self._dispensa_a_assinatura(caminho):
            return None
        return self._assinatura_vale(caminho, corpo)

    def _ler_o_corpo(self, limite):
        try:
            tamanho = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return None
        if tamanho <= 0:
            return b""
        if tamanho > limite:
            return None
        return self.rfile.read(tamanho)

    @staticmethod
    def _json_do_corpo(bruto):
        if not bruto:
            return {}
        try:
            corpo = json.loads(bruto.decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            return None
        return corpo if isinstance(corpo, dict) else None

    def _atender(self):
        caminho = self.path.split("?", 1)[0]
        self._assinado = None
        origem = self.headers.get("Origin")
        bruto = self._ler_o_corpo(LIMITES_POR_ROTA.get((self.command, caminho), LIMITE_DO_CORPO))
        recusa = self._pedido_aceito(caminho, bruto)
        if recusa is not None:
            status, erro = recusa
            return self._responder(status, {"error": erro}, origem=origem if status != 403 else None)
        if self.command == "OPTIONS":
            return self._responder_a_verificacao_previa(origem)
        pagina = PAGINAS.get((self.command, caminho))
        if pagina is not None:
            return responder_a_pagina(self, pagina)
        return self._atender_a_rota(caminho, bruto, origem)

    def _responder_a_verificacao_previa(self, origem):
        extras = {
            "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": self.headers.get("Access-Control-Request-Headers") or "Content-Type",
            "Access-Control-Max-Age": "600",
        }
        if self.headers.get("Access-Control-Request-Private-Network") == "true":
            extras["Access-Control-Allow-Private-Network"] = "true"
        return self._responder(204, origem=origem, extras=extras)

    def _atender_a_rota(self, caminho, bruto, origem):
        rota = ROTAS.get((self.command, caminho))
        if rota is None:
            return self._responder(404, {"error": "not_found"}, origem=origem)
        corpo = self._json_do_corpo(bruto)
        if corpo is None:
            return self._responder(400, {"error": "invalid_json"}, origem=origem)
        try:
            status, dados = rota(self.conexao, corpo)
        except Exception:
            self.conexao.logger.exception("Erro na rota %s %s", self.command, caminho)
            return self._responder(500, {"error": "internal_error"}, origem=origem)
        if self.command == "POST" and caminho.startswith("/jobs"):
            self.conexao.contato.set()
        return self._responder(status, dados, origem=origem)

    def __getattr__(self, nome):
        if nome.startswith("do_"):
            return self._atender
        raise AttributeError(nome)


class _Servidor(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = os.name != "nt"

    def handle_error(self, request, client_address):
        erro = sys.exc_info()[1]
        if sys.excepthook is None or sys.is_finalizing():
            return
        if isinstance(erro, ConnectionError):
            self.conexao.logger.info("O pedido de %s não terminou: o cliente fechou a conexão", client_address)
            return
        self.conexao.logger.exception("Erro ao atender %s", client_address)


class Conexao:
    def __init__(self, porta, pecas, perfil_aberto):
        self.porta = porta.numero
        self.origens_aceitas = tuple(porta.origens_aceitas)
        self.perfil_aberto = perfil_aberto
        self.ao_mudar_o_perfil = lambda: None
        self.versao, self.logger, self.dados = pecas.ambiente.versao, pecas.ambiente.logger, pecas.ambiente.dados
        self.colecao, self.item_de_login, self.perfil_fixo = pecas.colecao, pecas.item_de_login, pecas.perfil_fixo
        self.cofre, self.pareamento, self.chatgpt, self.atualizacao = pecas.cofre, pecas.pareamento, pecas.chatgpt, pecas.atualizacao
        self.modelos, self.ia, self.fila, self.teto = pecas.modelos, pecas.ia, pecas.fila, pecas.teto
        self.openai_base, self.voz_base, self.firestore_base = pecas.servicos.openai, pecas.servicos.voz, pecas.servicos.firestore
        self.intervalo_de_parada = pecas.esperas.da_parada
        self.contato = pecas.contato
        self._trabalhador = pecas.trabalhador
        self._servidor = None
        self._thread = None
        self.situacao_da_passagem = None
        self._cancelar = threading.Event()
        self._thread_da_passagem = None

    @property
    def no_ar(self):
        return self._servidor is not None

    def iniciar(self):
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
        if self._trabalhador is not None:
            self._trabalhador.iniciar()
        return True

    def iniciar_depois(self, preparo):
        def passar():
            try:
                preparo(self._cancelar.is_set)
            except Exception:
                self.logger.exception("A passagem não terminou; a Conexão de hoje fica como estava e a passagem tenta de novo na próxima vez")
            if not self._cancelar.is_set():
                self.iniciar()

        self._thread_da_passagem = threading.Thread(target=passar, name="perpetualminer-passagem", daemon=True)
        self._thread_da_passagem.start()

    def _servir(self):
        try:
            self._servidor.serve_forever(poll_interval=self.intervalo_de_parada)
        except Exception:
            self.logger.exception("O servidor da Conexão parou")

    def parar(self):
        self._cancelar.set()
        self.pareamento.parar()
        self.atualizacao.parar()
        if self._thread_da_passagem is not None:
            self._thread_da_passagem.join(timeout=5)
        if self._trabalhador is not None:
            self._trabalhador.encerrar()
        if self._servidor is None:
            return
        self._servidor.shutdown()
        self._servidor.server_close()
        self._thread.join(timeout=5)
        self._servidor = self._thread = None

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
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs

from . import baralhos, chatgpt_oficial, custos, diagnostico, envio, trabalhador
from .chaves import Cofre
from .login_do_chatgpt import LoginDoChatGPT
from .rotas_do_chatgpt import entrar_com_o_chatgpt, estado_do_chatgpt, retorno_do_login, sair_do_chatgpt
from .rotas_da_chave import (
    apagar_chave_da_openai, estado_da_ia, guardar_chave_da_openai, sincronizar_chave_da_openai, vincular_legado_da_openai,
)
from .configuracao import ENDERECO, OPENAI_BASE, OPENVERSE_BASE, VOZ_BASE
from .item_de_login import AnkiNaoEncontrado
from .perfil import PerfilFixo
from .rotas_do_perfil import abrir_o_perfil_marcado, escolher_o_perfil, listar_os_perfis

# Um pedido maior que isto não é da extensão: a leitura mais pesada (os Baralhos pedidos) cabe em poucos KB.
LIMITE_DO_CORPO = 64 * 1024
# O Envio leva as Frases escolhidas de uma vez (centenas de linhas de mineração): só ele vai até aqui.
LIMITE_DO_ENVIO = 4 * 1024 * 1024
# Depois que a Conexão sobe, a thread do Envio espera este tempo (s) um pedido de Envio da extensão antes de retomar o que ficou parado.
ESPERA_DO_CONTATO = 60.0
# As rotas cujo corpo pode passar de `LIMITE_DO_CORPO`.
LIMITES_POR_ROTA = {("POST", "/jobs"): LIMITE_DO_ENVIO}


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


def _criar_envio(conexao, corpo):
    return conexao.fila.criar(corpo)


def _listar_envios(conexao, corpo):
    return 200, {"jobs": conexao.fila.listar()}


def _com_o_envio(corpo, conexao, resposta):
    """Responde pelo Envio `jobId` do corpo: 400 se o id não é texto ou tem caractere de caminho, 404 se a Conexão não o tem
    (qualquer formato: só o criar exige um UUID)."""
    job_id = corpo.get("jobId")
    if not envio.id_que_serve_de_caminho(job_id):
        return 400, {"error": "invalid_job_id"}
    if conexao.fila.pedido(job_id) is None:
        return 404, {"error": "job_not_found"}
    return resposta(job_id)


def _ver_envio(conexao, corpo):
    return _com_o_envio(corpo, conexao, lambda job_id: (200, {"job": envio.visao_do_pedido(conexao.fila.pedido(job_id)), "state": conexao.fila.estado(job_id)}))


def _tentar_envio_de_novo(conexao, corpo):
    return _com_o_envio(corpo, conexao, conexao.fila.tentar_de_novo)


def _apagar_as_frases_dos_envios(conexao, corpo):
    """O Apagar tudo da extensão (CFG-17) tira também as Frases que a Conexão guarda: as linhas dos pedidos e os textos gerados."""
    conexao.fila.apagar_as_frases()
    return 200, {"ok": True}


def _pacote_de_diagnostico(conexao, corpo):
    log = os.path.join(conexao.dados.logs, "complemento.log")
    return _com_o_envio(corpo, conexao, lambda job_id: (200, diagnostico.pacote_de_diagnostico(conexao.fila, job_id, conexao.versao, log)))


def _custos_dos_envios(conexao, corpo):
    idioma = corpo.get("lang") if corpo.get("lang") in ("en", "ru") else "all"
    return 200, {"jobs": custos.linhas(conexao.fila, custos.dia(corpo.get("from")), custos.dia(corpo.get("to")), idioma)}


ROTAS = {
    ("GET", "/health"): _saude,
    # O que lê o Anki da pessoa é POST: o GET de uma página da extensão vai sem `Origin` (contrato/LEIA-ME.md).
    ("POST", "/anki/decks"): _baralhos_do_anki,
    ("POST", "/anki/stats/decks"): _numeros_dos_baralhos,
    ("POST", "/anki/vocabulary"): _vocabulario,
    # O perfil fixo (#149): a lista com o marcado, escolher outro e abrir o marcado.
    ("POST", "/anki/profiles"): listar_os_perfis,
    ("POST", "/anki/profile"): escolher_o_perfil,
    ("POST", "/anki/profile/open"): abrir_o_perfil_marcado,
    # A chave da OpenAI: POST com a origem da extensão, e nenhuma resposta devolve a chave inteira.
    ("POST", "/ia/openai/chave"): guardar_chave_da_openai,
    ("POST", "/ia/openai/chave/apagar"): apagar_chave_da_openai,
    ("POST", "/ia/openai/sincronizar"): sincronizar_chave_da_openai,
    ("POST", "/ia/openai/legado"): vincular_legado_da_openai,
    ("POST", "/ia/estado"): estado_da_ia,
    # Entrar com o ChatGPT (#155): nenhuma resposta devolve um token.
    ("POST", "/ia/chatgpt/estado"): estado_do_chatgpt,
    ("POST", "/ia/chatgpt/entrar"): entrar_com_o_chatgpt,
    ("POST", "/ia/chatgpt/sair"): sair_do_chatgpt,
    ("POST", "/abrir-com-o-computador/estado"): _estado_do_item_de_login,
    ("POST", "/abrir-com-o-computador"): _abrir_com_o_computador,
    # O Envio (#142): criar e tentar de novo mudam a fila; as outras só leem. Tudo POST com a origem da extensão.
    ("POST", "/jobs"): _criar_envio,
    ("POST", "/jobs/list"): _listar_envios,
    ("POST", "/jobs/get"): _ver_envio,
    ("POST", "/jobs/retry"): _tentar_envio_de_novo,
    ("POST", "/jobs/debug-bundle"): _pacote_de_diagnostico,
    ("POST", "/jobs/apagar-frases"): _apagar_as_frases_dos_envios,
    ("POST", "/analytics/jobs"): _custos_dos_envios,
}

# O que o navegador pede, fora do contrato com a extensão: o retorno do login do ChatGPT (navegação, sem `Origin`; decisão da spec #138).
# Cada uma é `(conexao, consulta, host) -> bytes` de uma página HTML, e nunca levanta erro.
PAGINAS = {("GET", chatgpt_oficial.CAMINHO_DO_RETORNO): retorno_do_login}

# As rotas que respondem sem a origem da extensão. Rota nova não entra aqui sem decisão do dono:
# o que gasta a chave ou lê dado da pessoa é POST e exige a origem.
ROTAS_ABERTAS = frozenset([("GET", "/health")]) | frozenset(PAGINAS)


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

    def _responder_a_pagina(self, corpo):
        """Uma página para o navegador: sem cache, sem referenciador e sem nada a carregar ou executar."""
        self.send_response(200)
        for nome, valor in (("Content-Type", "text/html; charset=utf-8"), ("Content-Length", str(len(corpo))), ("Cache-Control", "no-store"),
                            ("Referrer-Policy", "no-referrer"), ("Content-Security-Policy", "default-src 'none'"),
                            ("X-Content-Type-Options", "nosniff")):
            self.send_header(nome, valor)
        self.end_headers()
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

    def _ler_o_corpo(self, limite):
        """O JSON do pedido (`{}` sem corpo), ou None se o corpo não é um objeto JSON ou passa do `limite`."""
        try:
            tamanho = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return None
        if tamanho <= 0:
            return {}
        if tamanho > limite:
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
        pagina = PAGINAS.get((self.command, caminho))
        if pagina is not None:
            busca = parse_qs(self.path.split("?", 1)[1] if "?" in self.path else "")
            consulta = {nome: valores[0] for nome, valores in busca.items() if len(valores) == 1}
            return self._responder_a_pagina(pagina(self.conexao, consulta, self.headers.get("Host")))
        rota = ROTAS.get((self.command, caminho))
        if rota is None:
            return self._responder(404, {"error": "not_found"}, origem=origem)
        corpo = self._ler_o_corpo(LIMITES_POR_ROTA.get((self.command, caminho), LIMITE_DO_CORPO))
        if corpo is None:
            return self._responder(400, {"error": "invalid_json"}, origem=origem)
        try:
            status, dados = rota(self.conexao, corpo)
        except Exception:
            self.conexao.logger.exception("Erro na rota %s %s", self.command, caminho)
            return self._responder(500, {"error": "internal_error"}, origem=origem)
        if self.command == "POST" and caminho.startswith("/jobs"):
            self.conexao.contato.set()  # depois da rota: um apagar-frases já apagou quando a thread de trabalho é solta
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
        erro = sys.exc_info()[1]
        if sys.excepthook is None or sys.is_finalizing():
            return  # o Anki está fechando: nenhuma thread nasce mais, e cada pedido em voo diria o mesmo
        if isinstance(erro, ConnectionError):
            self.conexao.logger.info("O pedido de %s não terminou: o cliente fechou a conexão", client_address)
            return
        self.conexao.logger.exception("Erro ao atender %s", client_address)


class _SemColecao:
    """A coleção de uma Conexão que nasceu sem adaptador: nada a ler nem a gravar (o Envio espera)."""

    def perfis(self):
        return []

    def perfil_aberto(self):
        return None

    def fixar_o_perfil(self, fixo):
        pass

    def entrar_no_perfil_fixo(self):
        return False

    trocar_para_o_perfil_fixo = entrar_no_perfil_fixo

    def nomes_dos_baralhos(self, *_):
        raise baralhos.ColecaoIndisponivel("collection_unavailable")

    cartoes_do_baralho = tipo_de_nota = guids_existentes = adicionar_nota = gravar_cartao = nomes_dos_baralhos


class Conexao:
    """O servidor da Conexão e a thread de trabalho do Envio: `iniciar()` sobe as duas, `parar()` encerra.

    `dados` é a pasta de dados (`pasta_de_dados.preparar`). `trabalhando=False` deixa a fila parada (os Envios entram e
    ficam `queued`): é o que os testes do contrato usam, para um pedido repetido achar a fila como a deixou."""

    def __init__(
        self,
        *,
        porta,
        origens_aceitas,
        versao,
        perfil_aberto,
        logger,
        dados,
        colecao=None,
        item_de_login=None,
        openai_base=OPENAI_BASE,
        openverse_base=OPENVERSE_BASE,
        adaptador_de_imagem=None,
        voz_base=VOZ_BASE,
        firestore_base='https://firestore.googleapis.com/v1/projects/perpetualminer-4c219/databases/(default)/documents',
        chatgpt_base=chatgpt_oficial.LOGIN,
        intervalo_de_parada=0.1,
        trabalhando=True,
        intervalo_do_envio=1.0,
        espera_do_anki=2.0,
        esperas_da_openai=(2, 8, 30),
        motor=None,
        espera_do_contato=ESPERA_DO_CONTATO,
    ):
        self.porta = porta
        self.origens_aceitas = tuple(origens_aceitas)
        self.versao = versao
        self.perfil_aberto = perfil_aberto
        self.colecao = colecao or _SemColecao()
        self.logger = logger
        self.dados = dados
        # O perfil fixo (#149): o marcado fica em `user_files/perfil.json`, e o adaptador da coleção só grava nele.
        self.perfil_fixo = PerfilFixo(os.path.join(dados.raiz, "perfil.json"))
        self.colecao.fixar_o_perfil(self.perfil_fixo)
        # Chamado depois de a pessoa escolher outro perfil: o que depende do marcado (o abridor) se refaz. Quem monta a Conexão o troca.
        self.ao_mudar_o_perfil = lambda: None
        self.cofre = Cofre(dados.chaves)
        self.chatgpt = LoginDoChatGPT(dados.chaves, logger, base=chatgpt_base, api=openai_base)
        self.openai_base = openai_base
        self.firestore_base = firestore_base
        # O item de login de “Abrir o Anki com o computador”; None onde o sistema não tem (nem Mac nem Windows).
        self.item_de_login = item_de_login
        # De quanto em quanto tempo o servidor olha se mandaram parar; `parar()` espera até esse tempo.
        self.intervalo_de_parada = intervalo_de_parada
        self._servidor = None
        self._thread = None
        # Posto no primeiro pedido de Envio da extensão (`POST /jobs…`) depois da subida; o `/health` não conta.
        self.contato = threading.Event()
        self.fila = envio.Fila(dados, motor or envio.motor_do_complemento(), logger)
        self._trabalhador = trabalhador.Trabalhador(
            envio.Trabalho(self.fila, self.colecao, self.cofre, logger, openai_base, threading.Event(), chatgpt=self.chatgpt,
                           espera_do_anki=espera_do_anki, esperas_da_openai=esperas_da_openai, voz_base=voz_base,
                           openverse_base=openverse_base, adaptador_de_imagem=adaptador_de_imagem),
            intervalo=intervalo_do_envio, contato=self.contato, espera_do_contato=espera_do_contato,
        ) if trabalhando else None

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
        if self._trabalhador is not None:
            self._trabalhador.iniciar()
        return True

    def _servir(self):
        try:
            self._servidor.serve_forever(poll_interval=self.intervalo_de_parada)
        except Exception:
            self.logger.exception("O servidor da Conexão parou")

    def parar(self):
        if self._trabalhador is not None:
            self._trabalhador.encerrar()
        if self._servidor is None:
            return
        self._servidor.shutdown()
        self._servidor.server_close()
        self._thread.join(timeout=5)
        self._servidor = self._thread = None

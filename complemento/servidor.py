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

from . import baralhos, custos, envio, openai_api
from .chaves import Cofre, OutraContaNaoEnviada, LegadoNaoVinculado
from .nuvem_da_chave import NuvemDaChave, NuvemIndisponivel
from .configuracao import ENDERECO, OPENAI_BASE
from .item_de_login import AnkiNaoEncontrado

# Um pedido maior que isto não é da extensão: a leitura mais pesada (os Baralhos pedidos) cabe em poucos KB.
LIMITE_DO_CORPO = 64 * 1024
# O Envio leva as Frases escolhidas de uma vez (centenas de linhas de mineração): só ele vai até aqui.
LIMITE_DO_ENVIO = 4 * 1024 * 1024
# As rotas cujo corpo pode passar de `LIMITE_DO_CORPO`.
LIMITES_POR_ROTA = {("POST", "/jobs"): LIMITE_DO_ENVIO}


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
    conta = corpo.get('conta', '')
    if not isinstance(conta, str) or len(conta) > 128:
        return 400, {'error': 'invalid_request'}
    chave = corpo.get("chave")
    if not isinstance(chave, str) or not chave.strip():
        return 400, {"error": "invalid_request"}
    chave = chave.strip()
    repetida = conexao.cofre.reentrega('openai', chave, versao, conta)
    if repetida is True:
        return 200, {'ok': True, 'ultimos4': chave[-4:]}
    if repetida is False:
        return 409, {'error': 'stale_key_version'}
    if not _FORMA_DA_CHAVE.match(chave):
        return 401, {"error": openai_api.RECUSADA}
    try:
        openai_api.conferir(conexao.openai_base, chave, conexao.logger)
    except openai_api.ErroDaChave as erro:
        return _STATUS_DO_ERRO_DA_CHAVE[erro.codigo], {"error": erro.codigo}
    if not conexao.cofre.guardar("openai", chave, versao=versao, conta=conta):
        return 409, {'error': 'stale_key_version'}
    return 200, {"ok": True, "ultimos4": chave[-4:]}


def _apagar_chave_da_openai(conexao, corpo):
    """Apagar chave e Apagar tudo na extensão tiram a cópia daqui também (#154). Trocar a chave a substitui pelo POST /ia/openai/chave."""
    versao = _versao_da_chave(corpo)
    if versao is None:
        return 400, {'error': 'invalid_request'}
    conta = corpo.get('conta', '')
    if not isinstance(conta, str) or len(conta) > 128:
        return 400, {'error': 'invalid_request'}
    if not conexao.cofre.apagar("openai", versao=versao, conta=conta):
        return 409, {'error': 'stale_key_version'}
    return 200, {"ok": True}


def _vincular_legado_da_openai(conexao, corpo):
    versao, chave, conta, em = _versao_da_chave(corpo), corpo.get('chave'), corpo.get('conta'), corpo.get('em')
    if versao is None or not isinstance(chave, str) or not isinstance(conta, str) or len(conta) > 128 or type(em) is not int or not 0 <= em <= 9007199254740991:
        return 400, {'error': 'invalid_request'}
    if not conexao.cofre.vincular_legado('openai', chave, conta, em, versao):
        return 409, {'error': 'legacy_key_mismatch'}
    return 200, {'ok': True}


def _sincronizar_chave_da_openai(conexao, corpo):
    uid, token = corpo.get('uid'), corpo.get('token')
    versao = _versao_da_chave(corpo)
    if versao is None or not isinstance(uid, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', uid) or not isinstance(token, str) or not token or '\r' in token or '\n' in token:
        return 400, {'error': 'invalid_request'}
    try:
        resultado = conexao.cofre.sincronizar('openai', uid, NuvemDaChave(conexao.firestore_base, uid, token), versao)
    except OutraContaNaoEnviada:
        return 409, {'error': 'other_account_unsent'}
    except LegadoNaoVinculado:
        return 409, {'error': 'legacy_key_unbound'}
    except NuvemIndisponivel as erro:
        return erro.status, {'error': 'cloud_sync_failed', 'status': erro.status}
    if resultado is None:
        return 409, {'error': 'stale_key_version'}
    return 200, dict(ok=True, **resultado)


def _estado_da_ia(conexao, corpo):
    documento = conexao.cofre.documento('openai')
    chave = documento.get('chave')
    openai = {'configurada': bool(chave), 'conta': documento.get('conta', None if chave else ''),
              'versao': documento.get('versao', 0), 'naoEnviada': documento.get('naoEnviada', bool(chave))}
    if chave:
        openai['ultimos4'] = chave[-4:]
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
    return _com_o_envio(corpo, conexao, lambda job_id: (200, envio.pacote_de_diagnostico(conexao.fila, job_id, conexao.versao, log)))


def _custos_dos_envios(conexao, corpo):
    idioma = corpo.get("lang") if corpo.get("lang") in ("en", "ru") else "all"
    return 200, {"jobs": custos.linhas(conexao.fila, custos.dia(corpo.get("from")), custos.dia(corpo.get("to")), idioma)}


ROTAS = {
    ("GET", "/health"): _saude,
    # O que lê o Anki da pessoa é POST: o GET de uma página da extensão vai sem `Origin` (contrato/LEIA-ME.md).
    ("POST", "/anki/decks"): _baralhos_do_anki,
    ("POST", "/anki/stats/decks"): _numeros_dos_baralhos,
    ("POST", "/anki/vocabulary"): _vocabulario,
    # A chave da OpenAI: POST com a origem da extensão, e nenhuma resposta devolve a chave inteira.
    ("POST", "/ia/openai/chave"): _guardar_chave_da_openai,
    ("POST", "/ia/openai/chave/apagar"): _apagar_chave_da_openai,
    ("POST", "/ia/openai/sincronizar"): _sincronizar_chave_da_openai,
    ("POST", "/ia/openai/legado"): _vincular_legado_da_openai,
    ("POST", "/ia/estado"): _estado_da_ia,
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
    """A coleção de uma Conexão que nasceu sem adaptador: nada a ler nem a gravar (o Envio espera)."""

    def perfis(self):
        return []

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
        firestore_base='https://firestore.googleapis.com/v1/projects/perpetualminer-4c219/databases/(default)/documents',
        intervalo_de_parada=0.1,
        trabalhando=True,
        intervalo_do_envio=1.0,
        espera_do_anki=2.0,
        esperas_da_openai=(2, 8, 30),
        motor=None,
    ):
        self.porta = porta
        self.origens_aceitas = tuple(origens_aceitas)
        self.versao = versao
        self.perfil_aberto = perfil_aberto
        self.colecao = colecao or _SemColecao()
        self.logger = logger
        self.dados = dados
        self.cofre = Cofre(dados.chaves)
        self.openai_base = openai_base
        self.firestore_base = firestore_base
        # O item de login de “Abrir o Anki com o computador”; None onde o sistema não tem (nem Mac nem Windows).
        self.item_de_login = item_de_login
        # De quanto em quanto tempo o servidor olha se mandaram parar; `parar()` espera até esse tempo.
        self.intervalo_de_parada = intervalo_de_parada
        self._servidor = None
        self._thread = None
        self.fila = envio.Fila(dados, motor or envio.motor_do_complemento(), logger)
        self._trabalhador = envio.Trabalhador(
            envio.Trabalho(self.fila, self.colecao, self.cofre, logger, openai_base, threading.Event(),
                           espera_do_anki=espera_do_anki, esperas_da_openai=esperas_da_openai),
            intervalo=intervalo_do_envio,
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

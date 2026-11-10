"""O pareamento da Conexão com o Anki com cada navegador (#192): quem pode pedir, e a prova de que a Conexão é a Conexão.

Um segredo por navegador. Ele nasce aqui, quando a pessoa digita no painel o código que só o Anki dela mostrou, chega à
extensão uma única vez (a resposta do `concluir`) e nunca mais trafega: cada pedido vai assinado com HMAC-SHA256 e cada
resposta volta assinada (`desenho em docs/design/pareamento-da-conexao.md`). Só a biblioteca padrão.

    segredo S          `user_files/pareamento.json`, até 5 navegadores, só do dono (0600), gravado de uma vez
    código C           só na memória, 5 minutos, 5 tentativas; nunca em arquivo, log nem resposta HTTP
    sessão             nasce a cada subida da Conexão, só na memória: um pedido assinado numa subida não vale na outra
    nonce de cada pedido   não se repete dentro da sessão

A assinatura do pedido cobre a sessão, o nonce, o método, o caminho e o sha256 do corpo; a prova da resposta cobre a sessão,
o nonce do pedido, o status e o sha256 do corpo; a prova do `conferir` cobre o desafio e a sessão. Os rótulos (`pedido`,
`resposta`, `servidor`) separam os usos: a prova que a Conexão dá a qualquer um no `conferir` não serve para assinar um pedido.
`servidor.Atendente._pedido_aceito` é o único porteiro; o lado da extensão é `PedidoAoAnki.pedir`.
"""

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import threading
import time
from collections import OrderedDict, namedtuple
from datetime import datetime, timezone

from .chaves import gravar_so_do_dono

VALIDADE_DO_CODIGO_S = 5 * 60
TENTATIVAS = 5
MAXIMO_DE_NAVEGADORES = 5
# Seis caracteres de um alfabeto sem os que se confundem (0 O 1 I L): 31^6, uns 30 bits. Cinco tentativas por código não bastam para fechá-lo: um
# programa local pode pedir um código novo atrás do outro. Por isso, depois de CODIGOS_ESGOTADOS_PARA_BLOQUEAR códigos que gastaram as 5 tentativas sem
# que ninguém tenha pareado, a Conexão não sorteia outro por BLOQUEIO_S: no máximo 15 palpites a cada 15 minutos (uns 1.400 por dia, 2 em um milhão).
ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
TAMANHO_DO_CODIGO = 6
CODIGOS_ESGOTADOS_PARA_BLOQUEAR = 3
BLOQUEIO_S = 15 * 60
# Quantos nonces a sessão lembra: o mais antigo sai primeiro.
NONCES_LEMBRADOS = 8192

CLIENTE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
NONCE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
DESAFIO = re.compile(r"^[A-Za-z0-9_+/=-]{16,128}$")

CABECALHO_DO_CLIENTE = "X-PerpetualMiner-Cliente"
CABECALHO_DA_SESSAO = "X-PerpetualMiner-Sessao"
CABECALHO_DO_NONCE = "X-PerpetualMiner-Nonce"
CABECALHO_DA_ASSINATURA = "X-PerpetualMiner-Assinatura"
CABECALHO_DA_PROVA = "X-PerpetualMiner-Prova"

Verificacao = namedtuple("Verificacao", "status erro segredo nonce")


def _hmac(segredo, texto):
    return base64.b64encode(hmac.new(segredo, texto.encode("utf-8"), hashlib.sha256).digest()).decode("ascii")


def _sha256(corpo):
    return hashlib.sha256(corpo).hexdigest()


def assinatura_do_pedido(segredo, sessao, nonce, metodo, caminho, corpo):
    """O que a extensão põe em `X-PerpetualMiner-Assinatura`. `segredo` e `corpo` são bytes."""
    return _hmac(segredo, "pm1\npedido\n%s\n%s\n%s\n%s\n%s" % (sessao, nonce, metodo, caminho, _sha256(corpo)))


def prova_da_resposta(segredo, sessao, nonce, status, corpo):
    """O que a Conexão põe em `X-PerpetualMiner-Prova`, para o pedido de `nonce`."""
    return _hmac(segredo, "pm1\nresposta\n%s\n%s\n%d\n%s" % (sessao, nonce, status, _sha256(corpo)))


def prova_do_servidor(segredo, desafio, sessao):
    """A prova do `conferir`: quem tem `segredo` responde ao `desafio` da extensão e diz a sessão desta subida."""
    return _hmac(segredo, "pm1\nservidor\n%s\n%s" % (desafio, sessao))


def sortear_o_codigo():
    return "".join(secrets.choice(ALFABETO) for _ in range(TAMANHO_DO_CODIGO))


def _agora_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _forma_do_codigo(codigo):
    return "%s-%s" % (codigo[:3], codigo[3:])


def _so_o_codigo(texto):
    return re.sub(r"[^A-Z0-9]", "", texto.upper())


class Pareamento:
    """Os navegadores pareados, o código pendente e a conferência de cada pedido.

    `na_tela` é a janela do Anki (`mostrar_codigo(codigo, validade_s, ao_cancelar)`, `fechar_codigo()`, `conectou()`); sem ela
    (`None`) a Conexão não tem como mostrar o código e o `comecar` responde que o pareamento não está disponível.
    `relogio` devolve segundos que só crescem (o `time.monotonic`); `sortear` devolve o código (os testes o fixam)."""

    def __init__(self, arquivo, logger, relogio=time.monotonic, na_tela=None, sortear=sortear_o_codigo):
        self._arquivo = arquivo
        self._logger = logger
        self._relogio = relogio
        self.na_tela = na_tela
        self.sortear = sortear
        self.sessao = secrets.token_hex(16)
        self._tranca = threading.RLock()
        self._pendente = None      # { codigo, vence, tentativas }
        self._concluido = None     # { codigo, cliente, segredo, vence }: o último código usado, para o `concluir` repetido
        self._nonces = OrderedDict()
        self._relogio_de_vencer = None
        self._esgotados = 0        # os códigos seguidos que gastaram as tentativas; o pareamento que dá certo zera
        self._bloqueado_ate = None

    # --- os navegadores guardados -------------------------------------------------------------------------------------------

    def _ler(self):
        try:
            with open(self._arquivo, encoding="utf-8") as arquivo:
                dados = json.load(arquivo)
        except (OSError, ValueError):
            return []
        clientes = dados.get("clientes") if isinstance(dados, dict) else None
        if not isinstance(clientes, list):
            return []
        validos = []
        for linha in clientes:
            if isinstance(linha, dict) and isinstance(linha.get("cliente"), str) and isinstance(linha.get("segredo"), str):
                try:
                    base64.b64decode(linha["segredo"], validate=True)
                except ValueError:
                    continue
                validos.append(linha)
        return validos

    def _gravar(self, clientes):
        gravar_so_do_dono(self._arquivo, {"versao": 1, "clientes": clientes})

    def _segredo_de(self, cliente):
        if not isinstance(cliente, str):
            return None
        for linha in self._ler():
            if hmac.compare_digest(linha["cliente"].encode("utf-8"), cliente.encode("utf-8")):
                return base64.b64decode(linha["segredo"])
        return None

    def quantos(self):
        """Quantos navegadores estão pareados."""
        return len(self._ler())

    def desconectar(self):
        """“Desconectar navegadores”: esvazia a lista. Os Envios, a chave e o resto ficam. Devolve quantos saíram."""
        with self._tranca:
            saiu = len(self._ler())
            self._gravar([])
            self._concluido = None
            self._nonces.clear()
        self._logger.info("Pareamento: %d navegador(es) desconectado(s)", saiu)
        return saiu

    # --- o código ------------------------------------------------------------------------------------------------------------

    def _fechar_a_tela(self):
        if self.na_tela is None:
            return
        try:
            self.na_tela.fechar_codigo()
        except Exception:
            self._logger.exception("Pareamento: a janela do código não fechou")

    def _acabar_o_pendente(self):
        self._pendente = None
        if self._relogio_de_vencer is not None:
            self._relogio_de_vencer.cancel()
            self._relogio_de_vencer = None
        self._fechar_a_tela()

    def _vence_em(self, segundos):
        if self._relogio_de_vencer is not None:
            self._relogio_de_vencer.cancel()
        self._relogio_de_vencer = threading.Timer(segundos, self.expirar)
        self._relogio_de_vencer.daemon = True
        self._relogio_de_vencer.start()

    def expirar(self):
        """Fecha o código se já venceu (o relógio de 5 minutos o chama)."""
        with self._tranca:
            if self._pendente is not None and self._pendente["vence"] <= self._relogio():
                self._acabar_o_pendente()

    def cancelar(self):
        """A pessoa apertou Cancelar (ou fechou a janela do código): o código morre."""
        with self._tranca:
            if self._pendente is not None:
                self._pendente = None
                if self._relogio_de_vencer is not None:
                    self._relogio_de_vencer.cancel()
                    self._relogio_de_vencer = None

    def _pendente_valido(self):
        pendente = self._pendente
        if pendente is not None and (pendente["vence"] <= self._relogio() or pendente["tentativas"] >= TENTATIVAS):
            self._acabar_o_pendente()
            return None
        return pendente

    def comecar(self):
        """Mostra no Anki o código para conectar (o do pendente, se há). Devolve (status, json); o código nunca sai daqui."""
        with self._tranca:
            if self.na_tela is None:
                return 503, {"error": "pairing_unavailable"}
            pendente = self._pendente_valido()
            if pendente is None:
                if self._bloqueado_ate is not None and self._relogio() < self._bloqueado_ate:
                    return 429, {"error": "pairing_locked"}   # nenhum código novo, nenhum diálogo: quem insiste só gasta o tempo dele
                codigo = self.sortear()
                self._concluido = None   # um código novo: a pessoa recomeçou, e a resposta perdida do anterior já não se repete
                pendente = self._pendente = {"codigo": codigo, "vence": self._relogio() + VALIDADE_DO_CODIGO_S, "tentativas": 0}
                self._vence_em(VALIDADE_DO_CODIGO_S)
            try:
                self.na_tela.mostrar_codigo(_forma_do_codigo(pendente["codigo"]), VALIDADE_DO_CODIGO_S, self.cancelar)
            except Exception:
                self._logger.exception("Pareamento: a janela do código não abriu")
                self._pendente = None
                return 503, {"error": "pairing_unavailable"}
        return 200, {"ok": True}

    def _esgotou_um_codigo(self):
        self._esgotados += 1
        if self._esgotados >= CODIGOS_ESGOTADOS_PARA_BLOQUEAR:
            self._esgotados, self._bloqueado_ate = 0, self._relogio() + BLOQUEIO_S
            self._logger.warning("Pareamento: %d códigos gastaram as tentativas; nenhum código novo por %d minutos", CODIGOS_ESGOTADOS_PARA_BLOQUEAR, BLOQUEIO_S // 60)

    def concluir(self, codigo, cliente, nome):
        """A pessoa digitou `codigo` no painel. Certo: grava o segredo do `cliente` e o devolve, uma vez. Devolve (status, json)."""
        digitado = _so_o_codigo(codigo).encode("ascii")
        with self._tranca:
            feito = self._concluido
            if feito is not None and feito["vence"] > self._relogio() and hmac.compare_digest(feito["codigo"].encode("ascii"), digitado):
                if feito["cliente"] != cliente:
                    return 409, {"error": "pairing_code_used"}
                if self._segredo_de(cliente) is not None:  # a resposta se perdeu: o mesmo segredo, nada regravado
                    return 200, {"cliente": cliente, "segredo": feito["segredo"]}
            pendente = self._pendente_valido()
            if pendente is None:
                return 410, {"error": "pairing_code_expired"}
            if not hmac.compare_digest(pendente["codigo"].encode("ascii"), digitado):
                pendente["tentativas"] += 1
                if pendente["tentativas"] >= TENTATIVAS:
                    self._acabar_o_pendente()
                    self._esgotou_um_codigo()
                    return 410, {"error": "pairing_code_expired"}
                return 401, {"error": "pairing_code_wrong", "restam": TENTATIVAS - pendente["tentativas"]}
            segredo = base64.b64encode(secrets.token_bytes(32)).decode("ascii")
            clientes = [linha for linha in self._ler() if linha["cliente"] != cliente]
            clientes.append({"cliente": cliente, "segredo": segredo, "nome": nome, "criadoEm": _agora_iso()})
            self._gravar(clientes[-MAXIMO_DE_NAVEGADORES:])   # o cliente só existe depois de gravado
            self._concluido = {"codigo": pendente["codigo"], "cliente": cliente, "segredo": segredo, "vence": pendente["vence"]}
            self._esgotados, self._bloqueado_ate = 0, None
            self._acabar_o_pendente()
        self._logger.info("Pareamento: um navegador foi conectado")
        if self.na_tela is not None:
            try:
                self.na_tela.conectou()
            except Exception:
                self._logger.exception("Pareamento: o aviso de conectado não saiu")
        return 200, {"cliente": cliente, "segredo": segredo}

    def conferir(self, cliente, desafio):
        """A prova da Conexão: `{ sessao, prova }`. Quem não é um navegador pareado recebe 401, sem prova nenhuma."""
        segredo = self._segredo_de(cliente)
        if segredo is None:
            return 401, {"error": "pairing_required"}
        return 200, {"sessao": self.sessao, "prova": prova_do_servidor(segredo, desafio, self.sessao)}

    # --- o porteiro ----------------------------------------------------------------------------------------------------------

    def verificar(self, metodo, caminho, corpo, cabecalhos):
        """Confere a assinatura de um pedido. `corpo` são os bytes; `cabecalhos` responde a `.get(nome)`.

        Devolve `Verificacao(status, erro, segredo, nonce)`: `status` 200 e o segredo do navegador, ou 401 e o `erro`:
        `pairing_required` (sem assinatura ou navegador desconhecido), `session_expired` (assinado numa subida anterior da
        Conexão) ou `pairing_invalid` (assinatura errada ou nonce repetido)."""
        cliente = cabecalhos.get(CABECALHO_DO_CLIENTE)
        assinatura = cabecalhos.get(CABECALHO_DA_ASSINATURA)
        nonce = cabecalhos.get(CABECALHO_DO_NONCE)
        sessao = cabecalhos.get(CABECALHO_DA_SESSAO)
        segredo = self._segredo_de(cliente) if cliente and assinatura else None
        if segredo is None:
            return Verificacao(401, "pairing_required", None, None)
        if not isinstance(sessao, str) or not hmac.compare_digest(sessao.encode("utf-8"), self.sessao.encode("ascii")):
            return Verificacao(401, "session_expired", None, None)
        if not nonce or not NONCE.match(nonce):
            return Verificacao(401, "pairing_invalid", None, None)
        esperada = assinatura_do_pedido(segredo, self.sessao, nonce, metodo, caminho, corpo)
        if not hmac.compare_digest(esperada.encode("ascii"), assinatura.encode("utf-8", "replace")):
            return Verificacao(401, "pairing_invalid", None, None)
        with self._tranca:
            marca = (cliente, nonce)
            if marca in self._nonces:
                return Verificacao(401, "pairing_invalid", None, None)
            self._nonces[marca] = True
            while len(self._nonces) > NONCES_LEMBRADOS:
                self._nonces.popitem(last=False)
        return Verificacao(200, None, segredo, nonce)

    def parar(self):
        with self._tranca:
            if self._relogio_de_vencer is not None:
                self._relogio_de_vencer.cancel()
                self._relogio_de_vencer = None

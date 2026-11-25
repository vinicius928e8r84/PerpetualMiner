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
from dataclasses import dataclass
from datetime import datetime, timezone

from .chaves import gravar_so_do_dono

VALIDADE_DO_CODIGO_S = 5 * 60
TENTATIVAS = 5
MAXIMO_DE_NAVEGADORES = 5
MAXIMO_DE_REVOGADOS = 20
ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
TAMANHO_DO_CODIGO = 6
CODIGOS_ESGOTADOS_PARA_BLOQUEAR = 3
BLOQUEIO_S = 15 * 60
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


@dataclass(frozen=True)
class Selo:
    segredo: bytes
    sessao: str
    nonce: str


def _hmac(segredo, texto):
    return base64.b64encode(hmac.new(segredo, texto.encode("utf-8"), hashlib.sha256).digest()).decode("ascii")


def _sha256(corpo):
    return hashlib.sha256(corpo).hexdigest()


def assinatura_do_pedido(selo, metodo, caminho, corpo):
    return _hmac(selo.segredo, "pm1\npedido\n%s\n%s\n%s\n%s\n%s" % (selo.sessao, selo.nonce, metodo, caminho, _sha256(corpo)))


def prova_da_resposta(selo, status, corpo):
    return _hmac(selo.segredo, "pm1\nresposta\n%s\n%s\n%d\n%s" % (selo.sessao, selo.nonce, status, _sha256(corpo)))


def prova_do_servidor(segredo, desafio, sessao):
    return _hmac(segredo, "pm1\nservidor\n%s\n%s" % (desafio, sessao))


def prova_da_revogacao(segredo, desafio):
    return _hmac(segredo, "pm1\nrevogado\n%s" % desafio)


def sortear_o_codigo():
    return "".join(secrets.choice(ALFABETO) for _ in range(TAMANHO_DO_CODIGO))


@dataclass(frozen=True)
class Fontes:
    relogio: object = time.monotonic
    sortear: object = sortear_o_codigo


def _agora_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _forma_do_codigo(codigo):
    return "%s-%s" % (codigo[:3], codigo[3:])


def _so_o_codigo(texto):
    return re.sub(r"[^A-Z0-9]", "", texto.upper())


def _recusa(erro):
    return Verificacao(401, erro, None, None)


def _assinaturas_iguais(esperada, recebida):
    return hmac.compare_digest(esperada.encode("ascii"), recebida.encode("utf-8", "replace"))


def _linha_valida(linha):
    if not isinstance(linha, dict):
        return False
    if not (isinstance(linha.get("cliente"), str) and isinstance(linha.get("segredo"), str)):
        return False
    try:
        base64.b64decode(linha["segredo"], validate=True)
    except ValueError:
        return False
    return True


class Pareamento:
    def __init__(self, arquivo, logger, fontes=Fontes(), na_tela=None):
        self._arquivo = arquivo
        self._logger = logger
        self._relogio = fontes.relogio
        self.na_tela = na_tela
        self.sortear = fontes.sortear
        self.sessao = secrets.token_hex(16)
        self._tranca = threading.RLock()
        self._tranca_do_arquivo = threading.RLock()
        self._pendente = None
        self._concluido = None
        self._nonces = OrderedDict()
        self._relogio_de_vencer = None
        self._esgotados = 0
        self._bloqueado_ate = None

    def _ler(self, campo="clientes"):
        try:
            with self._tranca_do_arquivo, open(self._arquivo, encoding="utf-8") as arquivo:
                dados = json.load(arquivo)
        except (OSError, ValueError):
            return []
        linhas = dados.get(campo) if isinstance(dados, dict) else None
        if not isinstance(linhas, list):
            return []
        return [linha for linha in linhas if _linha_valida(linha)]

    def _gravar(self, clientes, revogados=None):
        with self._tranca_do_arquivo:
            revogados = self._ler("revogados") if revogados is None else revogados
            gravar_so_do_dono(self._arquivo, {"versao": 1, "clientes": clientes, "revogados": revogados})

    def _segredo_de(self, cliente, campo="clientes"):
        if not isinstance(cliente, str):
            return None
        for linha in self._ler(campo):
            if hmac.compare_digest(linha["cliente"].encode("utf-8"), cliente.encode("utf-8")):
                return base64.b64decode(linha["segredo"])
        return None

    def quantos(self):
        return len(self._ler())

    def desconectar(self):
        with self._tranca:
            saindo = self._ler()
            agora = _agora_iso()
            saindo_ids = {linha["cliente"] for linha in saindo}
            revogados = [linha for linha in self._ler("revogados") if linha["cliente"] not in saindo_ids]
            revogados += [{"cliente": s["cliente"], "segredo": s["segredo"], "revogadoEm": agora} for s in saindo]
            saiu = len(saindo)
            self._gravar([], revogados[-MAXIMO_DE_REVOGADOS:])
            self._concluido = None
            self._nonces.clear()
        self._logger.info("Pareamento: %d navegador(es) desconectado(s)", saiu)
        return saiu

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
        with self._tranca:
            if self._pendente is not None and self._pendente["vence"] <= self._relogio():
                self._acabar_o_pendente()

    def cancelar(self):
        with self._tranca:
            if self._pendente is not None:
                self._pendente = None
                if self._relogio_de_vencer is not None:
                    self._relogio_de_vencer.cancel()
                    self._relogio_de_vencer = None

    def _pendente_gasto(self, pendente):
        return pendente["vence"] <= self._relogio() or pendente["tentativas"] >= TENTATIVAS

    def _pendente_valido(self):
        pendente = self._pendente
        if pendente is not None and self._pendente_gasto(pendente):
            self._acabar_o_pendente()
            return None
        return pendente

    def comecar(self):
        with self._tranca:
            if self.na_tela is None:
                return 503, {"error": "pairing_unavailable"}
            pendente = self._pendente_valido()
            if pendente is None:
                if self._bloqueado_ate is not None and self._relogio() < self._bloqueado_ate:
                    return 429, {"error": "pairing_locked"}
                codigo = self.sortear()
                self._concluido = None
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

    def _concluido_com(self, digitado):
        """O pareamento que acabou de sair com este código, enquanto o código ainda vale."""
        feito = self._concluido
        if feito is None or feito["vence"] <= self._relogio():
            return None
        return feito if hmac.compare_digest(feito["codigo"].encode("ascii"), digitado) else None

    def _resposta_repetida(self, digitado, cliente):
        """A resposta perdida, repetida: o mesmo navegador recebe o mesmo segredo, outro recebe 409. `None` se o código não é de um pareamento recente."""
        feito = self._concluido_com(digitado)
        if feito is None:
            return None
        if feito["cliente"] != cliente:
            return 409, {"error": "pairing_code_used"}
        if self._segredo_de(cliente) is not None:
            return 200, {"cliente": cliente, "segredo": feito["segredo"]}
        return None

    def _errou_o_codigo(self, pendente):
        pendente["tentativas"] += 1
        if pendente["tentativas"] >= TENTATIVAS:
            self._acabar_o_pendente()
            self._esgotou_um_codigo()
            return 410, {"error": "pairing_code_expired"}
        return 401, {"error": "pairing_code_wrong", "restam": TENTATIVAS - pendente["tentativas"]}

    def _gravar_o_navegador(self, cliente, nome, segredo):
        """Põe o navegador no fim da lista; os que passam de cinco saem para os revogados, e o que volta a se parear deixa de ser revogado."""
        clientes = [linha for linha in self._ler() if linha["cliente"] != cliente]
        clientes.append({"cliente": cliente, "segredo": segredo, "nome": nome, "criadoEm": _agora_iso()})
        revogados = [linha for linha in self._ler("revogados") if linha["cliente"] != cliente]
        despejados = clientes[:-MAXIMO_DE_NAVEGADORES]
        revogados += [{"cliente": s["cliente"], "segredo": s["segredo"], "revogadoEm": _agora_iso()} for s in despejados]
        self._gravar(clientes[-MAXIMO_DE_NAVEGADORES:], revogados[-MAXIMO_DE_REVOGADOS:])

    def _parear(self, pendente, cliente, nome):
        """O código certo: grava o navegador com um segredo novo, guarda o que a resposta repetida precisa e encerra o código. Devolve o segredo."""
        segredo = base64.b64encode(secrets.token_bytes(32)).decode("ascii")
        self._gravar_o_navegador(cliente, nome, segredo)
        self._concluido = {"codigo": pendente["codigo"], "cliente": cliente, "segredo": segredo, "vence": pendente["vence"]}
        self._esgotados, self._bloqueado_ate = 0, None
        self._acabar_o_pendente()
        return segredo

    def _avisar_que_conectou(self):
        if self.na_tela is None:
            return
        try:
            self.na_tela.conectou()
        except Exception:
            self._logger.exception("Pareamento: o aviso de conectado não saiu")

    def concluir(self, codigo, cliente, nome):
        digitado = _so_o_codigo(codigo).encode("ascii")
        with self._tranca:
            repetida = self._resposta_repetida(digitado, cliente)
            if repetida is not None:
                return repetida
            pendente = self._pendente_valido()
            if pendente is None:
                return 410, {"error": "pairing_code_expired"}
            if not hmac.compare_digest(pendente["codigo"].encode("ascii"), digitado):
                return self._errou_o_codigo(pendente)
            segredo = self._parear(pendente, cliente, nome)
        self._logger.info("Pareamento: um navegador foi conectado")
        self._avisar_que_conectou()
        return 200, {"cliente": cliente, "segredo": segredo}

    def conferir(self, cliente, desafio):
        segredo = self._segredo_de(cliente)
        if segredo is None:
            revogado = self._segredo_de(cliente, "revogados")
            if revogado is None:
                return 401, {"error": "pairing_required"}
            return 401, {"error": "pairing_revoked", "prova": prova_da_revogacao(revogado, desafio)}
        return 200, {"sessao": self.sessao, "prova": prova_do_servidor(segredo, desafio, self.sessao)}

    def _segredo_do_pedido(self, cabecalhos):
        cliente = cabecalhos.get(CABECALHO_DO_CLIENTE)
        if not cliente or not cabecalhos.get(CABECALHO_DA_ASSINATURA):
            return None
        return self._segredo_de(cliente)

    def _sessao_atual(self, sessao):
        return isinstance(sessao, str) and hmac.compare_digest(sessao.encode("utf-8"), self.sessao.encode("ascii"))

    def _lembrar_o_nonce(self, cliente, nonce):
        with self._tranca:
            marca = (cliente, nonce)
            if marca in self._nonces:
                return False
            self._nonces[marca] = True
            while len(self._nonces) > NONCES_LEMBRADOS:
                self._nonces.popitem(last=False)
        return True

    def verificar(self, metodo, caminho, corpo, cabecalhos):
        segredo = self._segredo_do_pedido(cabecalhos)
        nonce = cabecalhos.get(CABECALHO_DO_NONCE)
        if segredo is None:
            return _recusa("pairing_required")
        if not self._sessao_atual(cabecalhos.get(CABECALHO_DA_SESSAO)):
            return _recusa("session_expired")
        if not nonce or not NONCE.match(nonce):
            return _recusa("pairing_invalid")
        esperada = assinatura_do_pedido(Selo(segredo, self.sessao, nonce), metodo, caminho, corpo)
        if not _assinaturas_iguais(esperada, cabecalhos.get(CABECALHO_DA_ASSINATURA)):
            return _recusa("pairing_invalid")
        if not self._lembrar_o_nonce(cabecalhos.get(CABECALHO_DO_CLIENTE), nonce):
            return _recusa("pairing_invalid")
        return Verificacao(200, None, segredo, nonce)

    def parar(self):
        with self._tranca:
            if self._relogio_de_vencer is not None:
                self._relogio_de_vencer.cancel()
                self._relogio_de_vencer = None

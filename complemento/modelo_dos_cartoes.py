import json
import os
import threading
from collections import namedtuple
from datetime import date

from . import openai_api
from .chaves import gravar_so_do_dono
from .login_do_chatgpt import ACABOU, CONECTADA, SAIU, SEM_LOGIN, ErroDoPlano

AUTOMATICO = "automatico"
PLANO, CHAVE, PARADO = "plano", "chave", "parado"
SEM_CHAVE = "openai_key_missing"
PROVEDOR = "openai"
Pagador = namedtuple("Pagador", "quem credencial motivo")
LISTA_NOSSA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "modelos_da_ia.json")


class Conta(namedtuple("Conta", "login cofre openai_base do_envio", defaults=(None, ""))):
    def situacao(self):
        return self.login.situacao() if self.login is not None else (SEM_LOGIN, None)

    def chave(self):
        return self.cofre.ler("openai", self.do_envio)

    def da_conta(self, uid):
        return self._replace(do_envio=uid)


class ModelosIndisponiveis(Exception):
    pass


def lista_nossa():
    with open(LISTA_NOSSA, encoding="utf-8") as arquivo:
        return json.load(arquivo)["modelos"]


def _dia_da_saida(modelo, logger):
    try:
        return date.fromisoformat(modelo["saida"]) if modelo["saida"] else None
    except ValueError:
        logger.warning("Modelo dos cartões: a data de saída de %s não é um dia (AAAA-MM-DD)", modelo["modelo"])
        return None


class ListaDosModelos:
    def __init__(self, modelos, hoje, modelo_do_motor, logger):
        self._hoje, self._modelo_do_motor = hoje, modelo_do_motor
        self.com_foto = [m["modelo"] for m in modelos if m["texto"] and m["foto"]]
        saidas = ((modelo["modelo"], _dia_da_saida(modelo, logger)) for modelo in modelos)
        self._saidas = {nome: dia for nome, dia in saidas if dia}

    def saiu(self, modelo):
        return modelo in self._saidas and self._hoje() >= self._saidas[modelo]

    def o_do_motor_saiu(self):
        return self.saiu(self._modelo_do_motor())

    def aviso_da_saida(self, modelo):
        saida = self._saidas.get(modelo)
        return {"modelo": modelo, "saida": saida.isoformat()} if saida and self._hoje() < saida else None


class ModeloDosCartoes:
    def __init__(self, arquivo, lista, conta, logger):
        self._arquivo, self._lista, self._conta, self.logger = arquivo, lista, conta, logger
        self._tranca = threading.Lock()

    def _ler(self):
        try:
            with open(self._arquivo, encoding="utf-8") as arquivo:
                guardado = json.load(arquivo)
            escolha, trocou, paga = guardado["escolha"], guardado.get("trocou"), guardado.get("paga")
            if _e_um_modelo(escolha) and _troca_legivel(trocou):
                return escolha, trocou, paga if paga in (PLANO, CHAVE) else None
        except (OSError, ValueError, KeyError, AttributeError):
            pass
        return AUTOMATICO, None, None

    def _gravar(self, escolha, trocou, paga):
        with self._tranca:
            gravar_so_do_dono(self._arquivo, {"escolha": escolha, "trocou": trocou, "paga": paga})

    def disponiveis(self, lista):
        return [modelo for modelo in lista if not self._lista.saiu(modelo)]

    def da_chave(self, chave):
        ids = openai_api.modelos_da_conta(self._conta.openai_base, chave)
        return self.disponiveis([modelo for modelo in self._lista.com_foto if modelo in ids])

    def automatico_da_chave(self, oferta):
        if not self._lista.o_do_motor_saiu():
            return None
        return oferta[0] if oferta else None

    def conta(self):
        try:
            chave = self._conta.chave()
            login = self._conta.login
            quem, _ = quem_paga(*login.situacao(), False, bool(chave))
            token = login.token() if quem == PLANO else None
            if token:
                return PLANO, self.disponiveis(login.modelos(token))
            return (CHAVE, self.da_chave(chave)) if quem != PARADO and chave else (None, [])
        except (ErroDoPlano, openai_api.ErroDaChave) as erro:
            if getattr(erro, "codigo", None) == SAIU:
                return None, []
            self.logger.warning("Modelo dos cartões: a lista da conta não veio")
            raise ModelosIndisponiveis()

    def _resolver(self, escolha, oferta, paga, quem_escolheu):
        if escolha == AUTOMATICO:
            return AUTOMATICO, None
        if self._lista.saiu(escolha):
            return AUTOMATICO, {"de": escolha}
        if oferta is not None and escolha not in oferta:
            outro_pagador = quem_escolheu is not None and quem_escolheu != paga
            return AUTOMATICO, dict({"de": escolha}, **({"porque": "pagador"} if outro_pagador else {}))
        return escolha, None

    def estado(self):
        paga, oferta = self.conta()
        escolha, trocou, quem_escolheu = self._ler()
        efetivo, trocada = self._resolver(escolha, oferta if paga else None, paga, quem_escolheu)
        return {"paga": paga, "escolha": efetivo, "modelos": oferta, "aviso": self._lista.aviso_da_saida(efetivo), "trocou": trocada or trocou}

    def escolher(self, modelo):
        if not isinstance(modelo, str) or not modelo:
            return 400, {"error": "invalid_request"}
        paga, oferta = self.conta()
        if modelo != AUTOMATICO and modelo not in oferta:
            return 404, {"error": "model_not_found"}
        self._gravar(modelo, None, paga)
        return 200, {"ok": True, "escolha": modelo}

    def do_envio(self, oferta, automatico, paga):
        escolha, _, quem_escolheu = self._ler()
        efetivo, trocada = self._resolver(escolha, oferta, paga, quem_escolheu)
        if trocada:
            self._gravar(AUTOMATICO, trocada, paga)
            self.logger.info("Modelo dos cartões: %s não vale mais; o Envio passou para o Automático", trocada["de"])
        return automatico if efetivo == AUTOMATICO else efetivo


def _e_um_modelo(escolha):
    return isinstance(escolha, str) and escolha != ""


def _troca_legivel(trocou):
    return trocou is None or isinstance(trocou.get("de"), str)


def _oferta_do_plano(login, token, modelos):
    lista = login.modelos(token)
    return modelos.disponiveis(lista) or lista


def _modelo_do_plano(login, token, plano, modelos):
    if "modelo" not in plano:
        oferta = _oferta_do_plano(login, token, modelos)
        plano["automatico"] = oferta[0]
        plano["modelo"] = modelos.do_envio(oferta, oferta[0], PLANO)
    return plano["modelo"]


def quem_paga(login, motivo, pela_chave, tem_chave):
    if not pela_chave and login == ACABOU:
        return PARADO, motivo
    if not pela_chave and login == CONECTADA:
        return PLANO, None
    return (CHAVE, None) if tem_chave else (PARADO, SEM_CHAVE)


def _credencial_do_plano(conta, plano, modelos, so_a_chave):
    try:
        token = conta.login.token()
        if not token:
            return credencial(conta._replace(login=None), plano, modelos, so_a_chave)
        return Pagador(PLANO, _do_plano(token, _modelo_do_plano(conta.login, token, plano, modelos)), None)
    except ErroDoPlano as erro:
        return Pagador(PARADO, None, erro.codigo)


def _modelo_da_chave(chave, modelos):
    try:
        oferta = modelos.da_chave(chave)
    except openai_api.ErroDaChave:
        oferta = None
    return modelos.do_envio(oferta, modelos.automatico_da_chave(oferta), CHAVE)


def _credencial_da_chave(chave, plano, modelos):
    if "modelo_da_chave" not in plano:
        plano["modelo_da_chave"] = _modelo_da_chave(chave, modelos)
    return Pagador(CHAVE, {"provedor": PROVEDOR, "segredo": chave, "modelo": plano["modelo_da_chave"]}, None)


def credencial(conta, plano, modelos, so_a_chave=False):
    chave = conta.chave()
    quem, motivo = quem_paga(*conta.situacao(), so_a_chave, bool(chave))
    if quem == PLANO:
        return _credencial_do_plano(conta, plano, modelos, so_a_chave)
    if quem == PARADO:
        return Pagador(PARADO, None, motivo)
    return _credencial_da_chave(chave, plano, modelos)


def _do_plano(token, modelo):
    return {"provedor": PROVEDOR, "via": "plano", "segredo": token, "modelo": modelo}


def credencial_da_imagem(conta, plano, modelos, so_a_chave=False):
    chave = conta.chave() or None
    quem, motivo = quem_paga(*conta.situacao(), so_a_chave, bool(chave))
    if quem == PARADO and motivo != SEM_CHAVE:
        raise ErroDoPlano(motivo)
    token = conta.login.token() if quem == PLANO else None
    if token and "automatico" not in plano:
        plano["automatico"] = _oferta_do_plano(conta.login, token, modelos)[0]
    return (_do_plano(token, plano["automatico"]) if token else None), chave

"""O modelo dos cartões (#157): qual modelo escreve o texto de cada Cartão, a lista que a conta oferece e a troca antes da saída.

O desenho está em `docs/design/modelo-dos-cartoes.md`. A escolha da pessoa (`automatico` ou um modelo da lista) fica em
`user_files/modelo-dos-cartoes.json`, junto com quem pagava quando ela foi feita (`paga`) e o que a Conexão trocou sozinha (`trocou`, a linha verde); nada ali é segredo.
O Automático não fixa modelo nenhum no código: com o login é o primeiro da lista do plano, e com a chave é o do motor (`engine/config.json`),
conferido contra a mesma lista de saída (se o do motor já saiu, é o primeiro que a conta da chave oferece).
A lista nossa, `modelos_da_ia.json`, viaja com a extensão (dentro da Conexão) e diz o que cada modelo faz e o dia em que sai do ar.

Ler (`estado`) nunca grava: quem grava a troca é o Envio (`do_envio`), no primeiro Cartão depois de a escolha cair.
"""

import json
import os
import threading
from collections import namedtuple
from datetime import date

from . import openai_api
from .chaves import gravar_so_do_dono
from .login_do_chatgpt import ACABOU, CONECTADA, SAIU, SEM_LOGIN, ErroDoPlano

AUTOMATICO = "automatico"
# Quem paga o texto de um Cartão (`quem_paga`): o plano do ChatGPT, a chave da OpenAI, ou ninguém (parado, com o motivo).
PLANO, CHAVE, PARADO = "plano", "chave", "parado"
SEM_CHAVE = "openai_key_missing"
Pagador = namedtuple("Pagador", "quem config motivo")  # `config`: o que o motor recebe para pedir o texto (None no parado)
LISTA_NOSSA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "modelos_da_ia.json")


class ModelosIndisponiveis(Exception):
    """A lista de modelos da conta não veio (a OpenAI fora do ar, o login que acabou, a chave recusada)."""


def lista_nossa():
    with open(LISTA_NOSSA, encoding="utf-8") as arquivo:
        return json.load(arquivo)["modelos"]


class ModeloDosCartoes:
    """`hoje` devolve o dia (um `date`); `login` e `cofre` dizem quem paga; `lista` é a lista nossa (`lista_nossa()`);
    `modelo_do_motor` devolve o `chat_model` do motor, o Automático com a chave."""

    def __init__(self, arquivo, lista, hoje, logger, login, cofre, openai_base, modelo_do_motor):
        self._arquivo, self._hoje, self.logger = arquivo, hoje, logger
        self._modelo_do_motor = modelo_do_motor
        self._login, self._cofre, self._openai_base = login, cofre, openai_base
        self._com_foto = [m["modelo"] for m in lista if m["texto"] and m["foto"]]
        self._saidas = {}
        for modelo in lista:
            try:
                if modelo["saida"]:
                    self._saidas[modelo["modelo"]] = date.fromisoformat(modelo["saida"])
            except ValueError:
                logger.warning("Modelo dos cartões: a data de saída de %s não é um dia (AAAA-MM-DD)", modelo["modelo"])
        self._tranca = threading.Lock()

    # -- o que fica guardado --
    def _ler(self):
        """(a escolha, o que foi trocado, quem pagava quando ela foi feita: None num arquivo de antes de se guardar isso)."""
        try:
            with open(self._arquivo, encoding="utf-8") as arquivo:
                guardado = json.load(arquivo)
            escolha, trocou, paga = guardado["escolha"], guardado.get("trocou"), guardado.get("paga")
            if isinstance(escolha, str) and escolha and (trocou is None or isinstance(trocou.get("de"), str)):
                return escolha, trocou, paga if paga in (PLANO, CHAVE) else None
        except (OSError, ValueError, KeyError, AttributeError):
            pass
        return AUTOMATICO, None, None

    def _gravar(self, escolha, trocou, paga):
        with self._tranca:
            gravar_so_do_dono(self._arquivo, {"escolha": escolha, "trocou": trocou, "paga": paga})

    # -- o que a conta oferece --
    def _saiu(self, modelo):
        return modelo in self._saidas and self._hoje() >= self._saidas[modelo]

    def disponiveis(self, lista):
        """A lista sem os modelos que já saíram do ar, na ordem dela."""
        return [modelo for modelo in lista if not self._saiu(modelo)]

    def da_chave(self, chave):
        """Os modelos de texto que veem foto que a conta da chave tem (na ordem da lista nossa); levanta `ErroDaChave`."""
        ids = openai_api.modelos_da_conta(self._openai_base, chave)
        return self.disponiveis([modelo for modelo in self._com_foto if modelo in ids])

    def automatico_da_chave(self, oferta):
        """O modelo do texto do Automático com a chave: None (o do motor) enquanto ele não saiu do ar; senão o primeiro que a conta oferece
        (None se a lista não veio ou está vazia: então nada é melhor que o do motor)."""
        if not self._saiu(self._modelo_do_motor()):
            return None
        return oferta[0] if oferta else None

    def conta(self):
        """(quem paga, o que ela oferece): `plano` com o login, `chave` com a chave, `None` e `[]` sem nenhum dos dois, ou com o login
        acabado (ninguém paga até a pessoa escolher)."""
        try:
            token = self._login.token()
            if token:
                return PLANO, self.disponiveis(self._login.modelos(token))
            chave = self._cofre.ler("openai")
            return (CHAVE, self.da_chave(chave)) if chave else (None, [])
        except (ErroDoPlano, openai_api.ErroDaChave) as erro:
            if getattr(erro, "codigo", None) == SAIU:
                return None, []
            self.logger.warning("Modelo dos cartões: a lista da conta não veio")
            raise ModelosIndisponiveis()

    def _resolver(self, escolha, oferta, paga, quem_escolheu):
        """(o que vale agora, o que trocou): a escolha cai no dia da saída ou quando a conta deixa de oferecê-la (`oferta` None: não se sabe).
        `trocou` é `{ de }`, e leva `porque: pagador` quando a conta que não a oferece é outra que a de quando a pessoa escolheu."""
        if escolha == AUTOMATICO:
            return AUTOMATICO, None
        if self._saiu(escolha):
            return AUTOMATICO, {"de": escolha}
        if oferta is not None and escolha not in oferta:
            outro_pagador = quem_escolheu is not None and quem_escolheu != paga
            return AUTOMATICO, dict({"de": escolha}, **({"porque": "pagador"} if outro_pagador else {}))
        return escolha, None

    # -- o que a extensão pede --
    def estado(self):
        """`{ paga, escolha, modelos, aviso, trocou }`: a escolha que vale hoje, a lista, o aviso antes da saída e o que foi trocado."""
        paga, oferta = self.conta()
        escolha, trocou, quem_escolheu = self._ler()
        efetivo, trocada = self._resolver(escolha, oferta if paga else None, paga, quem_escolheu)
        saida = self._saidas.get(efetivo)
        aviso = {"modelo": efetivo, "saida": saida.isoformat()} if saida and self._hoje() < saida else None
        return {"paga": paga, "escolha": efetivo, "modelos": oferta, "aviso": aviso, "trocou": trocada or trocou}

    def escolher(self, modelo):
        """Guarda a escolha (e apaga a linha do que foi trocado); (status, resposta) do contrato."""
        if not isinstance(modelo, str) or not modelo:
            return 400, {"error": "invalid_request"}
        paga, oferta = self.conta()
        if modelo != AUTOMATICO and modelo not in oferta:
            return 404, {"error": "model_not_found"}
        self._gravar(modelo, None, paga)
        return 200, {"ok": True, "escolha": modelo}

    # -- o Envio --
    def do_envio(self, oferta, automatico, paga):
        """O modelo do texto dos Cartões deste Envio (`paga` é quem o paga): o da escolha, ou `automatico`; se a escolha caiu, guarda a troca e segue."""
        escolha, _, quem_escolheu = self._ler()
        efetivo, trocada = self._resolver(escolha, oferta, paga, quem_escolheu)
        if trocada:
            self._gravar(AUTOMATICO, trocada, paga)
            self.logger.info("Modelo dos cartões: %s não vale mais; o Envio passou para o Automático", trocada["de"])
        return automatico if efetivo == AUTOMATICO else efetivo


def _oferta_do_plano(login, token, modelos):
    lista = login.modelos(token)
    return modelos.disponiveis(lista) or lista


def _modelo_do_plano(login, token, plano, modelos):
    """O modelo do texto do plano neste Envio: lido uma vez (fica em `plano`); a escolha da pessoa, ou o primeiro da lista da conta."""
    if "modelo" not in plano:
        oferta = _oferta_do_plano(login, token, modelos)
        plano["automatico"] = oferta[0]
        plano["modelo"] = modelos.do_envio(oferta, oferta[0], PLANO)
    return plano["modelo"]


def quem_paga(login, motivo, pela_chave, tem_chave):
    """Quem paga o texto do próximo Cartão: `(PLANO | CHAVE | PARADO, o motivo do parado)`. `login` e `motivo` são a `situacao()` do
    login; `pela_chave`, a escolha da pessoa neste Envio (Usar a minha chave, #158). O login que acabou para o Envio mesmo com a chave
    guardada: do parado só se sai por escolha (entrar de novo; sair do login; Usar a minha chave), nunca sozinho, nem no Tentar de novo."""
    if not pela_chave and login == ACABOU:
        return PARADO, motivo
    if not pela_chave and login == CONECTADA:
        return PLANO, None
    return (CHAVE, None) if tem_chave else (PARADO, SEM_CHAVE)


def credencial(login, cofre, plano, modelos, so_a_chave=False):
    """O `Pagador` do texto do próximo Cartão, lido antes de cada pedido e só para ele (`quem_paga`). Pelo plano, `config` leva o token
    (renovado) e o modelo (`plano_do_chatgpt`); pela chave, a chave do cofre e o modelo do texto (None: o do motor); parado, só o
    `motivo`: falta a chave, o login acabou, ou o plano não serve agora (o código de `ErroDoPlano`). O modelo é lido uma vez por Envio,
    o do plano e o da chave cada um à parte (ficam em `plano`); um modelo que caiu não para o Envio: troca para o Automático."""
    chave = cofre.ler("openai")
    quem, motivo = quem_paga(*(login.situacao() if login is not None else (SEM_LOGIN, None)), so_a_chave, bool(chave))
    if quem == PLANO:
        try:
            token = login.token()
            if not token:  # a pessoa saiu do login entre as duas leituras: a escolha foi dela
                return credencial(None, cofre, plano, modelos, so_a_chave)
            return Pagador(PLANO, {"openai_api_key": None, "plano_do_chatgpt": {"token": token, "modelo": _modelo_do_plano(login, token, plano, modelos)}}, None)
        except ErroDoPlano as erro:
            return Pagador(PARADO, None, erro.codigo)
    if quem == PARADO:
        return Pagador(PARADO, None, motivo)
    if "modelo_da_chave" not in plano:  # o da chave fica à parte do do plano: o Envio pode passar de um para o outro (#158)
        try:
            oferta = modelos.da_chave(chave)
        except openai_api.ErroDaChave:
            oferta = None  # a lista não veio: vale a escolha da pessoa, sem conferir se a conta ainda a tem
        plano["modelo_da_chave"] = modelos.do_envio(oferta, modelos.automatico_da_chave(oferta), CHAVE)
    return Pagador(CHAVE, {"openai_api_key": chave, "modelo_do_texto": plano["modelo_da_chave"]}, None)


def credencial_da_imagem(login, cofre, plano, modelos, so_a_chave=False):
    """Com que o Envio escolhe a imagem do próximo Cartão: `(plano, chave)`. O juiz vai pelo plano (o token renovado e o Automático da conta,
    como em `credencial`) quando há login e a pessoa não pediu Usar a minha chave (`so_a_chave`, #158); a triagem e a imagem gerada vão sempre
    pela chave do cofre (None sem ela). Levanta `ErroDoPlano`."""
    token = login.token() if login is not None and not so_a_chave else None
    if token and "automatico" not in plano:  # o juiz usa o Automático do plano, não o modelo que a pessoa escolheu para o texto
        plano["automatico"] = _oferta_do_plano(login, token, modelos)[0]
    return ({"token": token, "modelo": plano["automatico"]} if token else None), cofre.ler("openai") or None

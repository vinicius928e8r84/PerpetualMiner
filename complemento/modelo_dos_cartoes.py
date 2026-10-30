"""O modelo dos cartões (#157): qual modelo escreve o texto de cada Cartão, a lista que a conta oferece e a troca antes da saída.

O desenho está em `docs/design/modelo-dos-cartoes.md`. A escolha da pessoa (`automatico` ou um modelo da lista) fica em
`user_files/modelo-dos-cartoes.json`, junto com o que a Conexão trocou sozinha (`trocou`, a linha verde); nada ali é segredo.
O Automático não fixa modelo nenhum no código: com o login é o primeiro da lista do plano, e com a chave é o do motor (`engine/config.json`).
A lista nossa, `modelos_da_ia.json`, viaja com a extensão (dentro da Conexão) e diz o que cada modelo faz e o dia em que sai do ar.

Ler (`estado`) nunca grava: quem grava a troca é o Envio (`do_envio`), no primeiro Cartão depois de a escolha cair.
"""

import json
import os
import threading
from datetime import date

from . import openai_api
from .chaves import gravar_so_do_dono
from .login_do_chatgpt import ErroDoPlano

AUTOMATICO = "automatico"
PLANO, CHAVE = "plano", "chave"
LISTA_NOSSA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "modelos_da_ia.json")


class ModelosIndisponiveis(Exception):
    """A lista de modelos da conta não veio (a OpenAI fora do ar, o login que acabou, a chave recusada)."""


def lista_nossa():
    with open(LISTA_NOSSA, encoding="utf-8") as arquivo:
        return json.load(arquivo)["modelos"]


class ModeloDosCartoes:
    """`hoje` devolve o dia (um `date`); `login` e `cofre` dizem quem paga; `lista` é a lista nossa (`lista_nossa()`)."""

    def __init__(self, arquivo, lista, hoje, logger, login, cofre, openai_base):
        self._arquivo, self._hoje, self.logger = arquivo, hoje, logger
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
        try:
            with open(self._arquivo, encoding="utf-8") as arquivo:
                guardado = json.load(arquivo)
            escolha, trocou = guardado["escolha"], guardado.get("trocou")
            if isinstance(escolha, str) and escolha and (trocou is None or isinstance(trocou.get("de"), str)):
                return escolha, trocou
        except (OSError, ValueError, KeyError, AttributeError):
            pass
        return AUTOMATICO, None

    def _gravar(self, escolha, trocou):
        with self._tranca:
            gravar_so_do_dono(self._arquivo, {"escolha": escolha, "trocou": trocou})

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

    def conta(self):
        """(quem paga, o que ela oferece): `plano` com o login, `chave` com a chave, `None` e `[]` sem nenhum dos dois."""
        try:
            token = self._login.token()
            if token:
                return PLANO, self.disponiveis(self._login.modelos(token))
            chave = self._cofre.ler("openai")
            return (CHAVE, self.da_chave(chave)) if chave else (None, [])
        except (ErroDoPlano, openai_api.ErroDaChave):
            self.logger.warning("Modelo dos cartões: a lista da conta não veio")
            raise ModelosIndisponiveis()

    def _resolver(self, escolha, oferta):
        """(o que vale agora, de quem caiu): a escolha cai no dia da saída ou quando a conta deixa de oferecê-la (`oferta` None: não se sabe)."""
        if escolha == AUTOMATICO:
            return AUTOMATICO, None
        if self._saiu(escolha) or (oferta is not None and escolha not in oferta):
            return AUTOMATICO, escolha
        return escolha, None

    # -- o que a extensão pede --
    def estado(self):
        """`{ paga, escolha, modelos, aviso, trocou }`: a escolha que vale hoje, a lista, o aviso antes da saída e o que foi trocado."""
        paga, oferta = self.conta()
        escolha, trocou = self._ler()
        efetivo, de = self._resolver(escolha, oferta if paga else None)
        saida = self._saidas.get(efetivo)
        aviso = {"modelo": efetivo, "saida": saida.isoformat()} if saida and self._hoje() < saida else None
        return {"paga": paga, "escolha": efetivo, "modelos": oferta, "aviso": aviso, "trocou": {"de": de} if de else trocou}

    def escolher(self, modelo):
        """Guarda a escolha (e apaga a linha do que foi trocado); (status, resposta) do contrato."""
        if not isinstance(modelo, str) or not modelo:
            return 400, {"error": "invalid_request"}
        if modelo != AUTOMATICO and modelo not in self.conta()[1]:
            return 404, {"error": "model_not_found"}
        self._gravar(modelo, None)
        return 200, {"ok": True, "escolha": modelo}

    # -- o Envio --
    def do_envio(self, oferta, automatico):
        """O modelo do texto dos Cartões deste Envio: o da escolha, ou `automatico`; se a escolha caiu, guarda a troca e segue."""
        escolha, _ = self._ler()
        efetivo, de = self._resolver(escolha, oferta)
        if de:
            self._gravar(AUTOMATICO, {"de": de})
            self.logger.info("Modelo dos cartões: %s saiu; o Envio passou para o Automático", de)
        return automatico if efetivo == AUTOMATICO else efetivo


def _oferta_do_plano(login, token, modelos):
    lista = login.modelos(token)
    return modelos.disponiveis(lista) or lista


def _modelo_do_plano(login, token, plano, modelos):
    """O modelo do texto do plano neste Envio: lido uma vez (fica em `plano`); a escolha da pessoa, ou o primeiro da lista da conta."""
    if "modelo" not in plano:
        oferta = _oferta_do_plano(login, token, modelos)
        plano["automatico"] = oferta[0]
        plano["modelo"] = modelos.do_envio(oferta, oferta[0])
    return plano["modelo"]


def credencial(login, cofre, plano, modelos, so_a_chave=False):
    """Com que o Envio pede o texto do próximo Cartão, lido antes de cada pedido e só para ele: com o login do ChatGPT, o token
    (renovado) e o modelo (`plano_do_chatgpt`); sem ele, a chave do cofre e o modelo do texto (None: o do motor); None sem nenhum
    dos dois; o código (texto) quando o plano não serve agora. O modelo é lido uma vez por Envio (fica em `plano`). O Envio nunca
    troca o plano pela chave sozinho (o login que acabou para o Envio) nem para por causa de um modelo que caiu: troca para o Automático.
    A pessoa troca por Usar a minha chave (`so_a_chave`, #158): então o login nem é lido."""
    try:
        token = login.token() if login is not None and not so_a_chave else None
        if token:
            return {"openai_api_key": None, "plano_do_chatgpt": {"token": token, "modelo": _modelo_do_plano(login, token, plano, modelos)}}
    except ErroDoPlano as erro:
        return erro.codigo
    chave = cofre.ler("openai")
    if not chave:
        return None
    if "modelo" not in plano:
        try:
            oferta = modelos.da_chave(chave)
        except openai_api.ErroDaChave:
            oferta = None  # a lista não veio: vale a escolha da pessoa, sem conferir se a conta ainda a tem
        plano["modelo"] = modelos.do_envio(oferta, None)
    return {"openai_api_key": chave, "modelo_do_texto": plano["modelo"]}


def credencial_da_imagem(login, cofre, plano, modelos, so_a_chave=False):
    """Com que o Envio escolhe a imagem do próximo Cartão: `(plano, chave)`. O juiz vai pelo plano (o token renovado e o Automático da conta,
    como em `credencial`) quando há login e a pessoa não pediu Usar a minha chave (`so_a_chave`, #158); a triagem e a imagem gerada vão sempre
    pela chave do cofre (None sem ela). Levanta `ErroDoPlano`."""
    token = login.token() if login is not None and not so_a_chave else None
    if token and "automatico" not in plano:  # o juiz usa o Automático do plano, não o modelo que a pessoa escolheu para o texto
        plano["automatico"] = _oferta_do_plano(login, token, modelos)[0]
    return ({"token": token, "modelo": plano["automatico"]} if token else None), cofre.ler("openai") or None

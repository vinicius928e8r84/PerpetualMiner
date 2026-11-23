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
PLANO, CHAVE, PARADO = "plano", "chave", "parado"
SEM_CHAVE = "openai_key_missing"
PROVEDOR = "openai"
Pagador = namedtuple("Pagador", "quem credencial motivo")
LISTA_NOSSA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "modelos_da_ia.json")


class Conta(namedtuple("Conta", "login cofre openai_base", defaults=(None,))):
    """Quem pode pagar um pedido: o login do ChatGPT (`LoginDoChatGPT`; None: sem login) e o cofre, com a chave da OpenAI, e o endereço
    da OpenAI onde se pergunta o que a conta da chave tem."""

    def situacao(self):
        """A `situacao()` do login; sem login, `(SEM_LOGIN, None)`."""
        return self.login.situacao() if self.login is not None else (SEM_LOGIN, None)

    def chave(self):
        return self.cofre.ler("openai")


class ModelosIndisponiveis(Exception):
    """A lista de modelos da conta não veio (a OpenAI fora do ar, o login que acabou, a chave recusada)."""


def lista_nossa():
    with open(LISTA_NOSSA, encoding="utf-8") as arquivo:
        return json.load(arquivo)["modelos"]


class ListaDosModelos:
    """`modelos` é a lista nossa (`lista_nossa()`); `hoje` devolve o dia (um `date`);
    `modelo_do_motor` devolve o `chat_model` do motor, o Automático com a chave."""

    def __init__(self, modelos, hoje, modelo_do_motor, logger):
        self._hoje, self._modelo_do_motor = hoje, modelo_do_motor
        self.com_foto = [m["modelo"] for m in modelos if m["texto"] and m["foto"]]
        self._saidas = {}
        for modelo in modelos:
            try:
                if modelo["saida"]:
                    self._saidas[modelo["modelo"]] = date.fromisoformat(modelo["saida"])
            except ValueError:
                logger.warning("Modelo dos cartões: a data de saída de %s não é um dia (AAAA-MM-DD)", modelo["modelo"])

    def saiu(self, modelo):
        return modelo in self._saidas and self._hoje() >= self._saidas[modelo]

    def o_do_motor_saiu(self):
        return self.saiu(self._modelo_do_motor())

    def aviso_da_saida(self, modelo):
        saida = self._saidas.get(modelo)
        return {"modelo": modelo, "saida": saida.isoformat()} if saida and self._hoje() < saida else None


class ModeloDosCartoes:
    """`arquivo` guarda a escolha; `lista` é a `ListaDosModelos`; `conta` (`Conta`) diz quem paga."""

    def __init__(self, arquivo, lista, conta, logger):
        self._arquivo, self._lista, self._conta, self.logger = arquivo, lista, conta, logger
        self._tranca = threading.Lock()

    def _ler(self):
        """(a escolha, o que foi trocado, quem pagava quando ela foi feita: None num arquivo de antes de se guardar isso)."""
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
        """A lista sem os modelos que já saíram do ar, na ordem dela."""
        return [modelo for modelo in lista if not self._lista.saiu(modelo)]

    def da_chave(self, chave):
        """Os modelos de texto que veem foto que a conta da chave tem (na ordem da lista nossa); levanta `ErroDaChave`."""
        ids = openai_api.modelos_da_conta(self._conta.openai_base, chave)
        return self.disponiveis([modelo for modelo in self._lista.com_foto if modelo in ids])

    def automatico_da_chave(self, oferta):
        """O modelo do texto do Automático com a chave: None (o do motor) enquanto ele não saiu do ar; senão o primeiro que a conta oferece
        (None se a lista não veio ou está vazia: então nada é melhor que o do motor)."""
        if not self._lista.o_do_motor_saiu():
            return None
        return oferta[0] if oferta else None

    def conta(self):
        """(quem paga, o que ela oferece): quem paga o texto pela tabela (`quem_paga`, a mesma da porta da IA dos cartões): `plano` com o
        login, `chave` com a chave, `None` e `[]` quando ninguém paga (sem nenhum dos dois, ou com o login acabado, até a pessoa escolher)."""
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
        """(o que vale agora, o que trocou): a escolha cai no dia da saída ou quando a conta deixa de oferecê-la (`oferta` None: não se sabe).
        `trocou` é `{ de }`, e leva `porque: pagador` quando a conta que não a oferece é outra que a de quando a pessoa escolheu."""
        if escolha == AUTOMATICO:
            return AUTOMATICO, None
        if self._lista.saiu(escolha):
            return AUTOMATICO, {"de": escolha}
        if oferta is not None and escolha not in oferta:
            outro_pagador = quem_escolheu is not None and quem_escolheu != paga
            return AUTOMATICO, dict({"de": escolha}, **({"porque": "pagador"} if outro_pagador else {}))
        return escolha, None

    def estado(self):
        """`{ paga, escolha, modelos, aviso, trocou }`: a escolha que vale hoje, a lista, o aviso antes da saída e o que foi trocado."""
        paga, oferta = self.conta()
        escolha, trocou, quem_escolheu = self._ler()
        efetivo, trocada = self._resolver(escolha, oferta if paga else None, paga, quem_escolheu)
        return {"paga": paga, "escolha": efetivo, "modelos": oferta, "aviso": self._lista.aviso_da_saida(efetivo), "trocou": trocada or trocou}

    def escolher(self, modelo):
        """Guarda a escolha (e apaga a linha do que foi trocado); (status, resposta) do contrato."""
        if not isinstance(modelo, str) or not modelo:
            return 400, {"error": "invalid_request"}
        paga, oferta = self.conta()
        if modelo != AUTOMATICO and modelo not in oferta:
            return 404, {"error": "model_not_found"}
        self._gravar(modelo, None, paga)
        return 200, {"ok": True, "escolha": modelo}

    def do_envio(self, oferta, automatico, paga):
        """O modelo do texto dos Cartões deste Envio (`paga` é quem o paga): o da escolha, ou `automatico`; se a escolha caiu, guarda a troca e segue."""
        escolha, _, quem_escolheu = self._ler()
        efetivo, trocada = self._resolver(escolha, oferta, paga, quem_escolheu)
        if trocada:
            self._gravar(AUTOMATICO, trocada, paga)
            self.logger.info("Modelo dos cartões: %s não vale mais; o Envio passou para o Automático", trocada["de"])
        return automatico if efetivo == AUTOMATICO else efetivo


def _e_um_modelo(escolha):
    return isinstance(escolha, str) and escolha != ""


def _troca_legivel(trocou):
    """Nada trocado, ou a troca diz de que modelo veio (`{ de }`)."""
    return trocou is None or isinstance(trocou.get("de"), str)


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


def credencial(conta, plano, modelos, so_a_chave=False):
    """O `Pagador` do texto do próximo Cartão, lido antes de cada pedido e só para ele (`quem_paga`). A `credencial` é a da camada de
    provedores do motor, sem o endereço (`{provedor, segredo, modelo}`; pelo plano também `via: "plano"`, com o token renovado); pela chave,
    o modelo None é o do motor; parado, ela é None e fica o `motivo`: falta a chave, o login acabou, ou o plano não serve agora (o código de `ErroDoPlano`). O modelo é lido uma vez por Envio,
    o do plano e o da chave cada um à parte (ficam em `plano`); um modelo que caiu não para o Envio: troca para o Automático."""
    chave = conta.chave()
    quem, motivo = quem_paga(*conta.situacao(), so_a_chave, bool(chave))
    if quem == PLANO:
        try:
            token = conta.login.token()
            if not token:
                return credencial(conta._replace(login=None), plano, modelos, so_a_chave)
            return Pagador(PLANO, _do_plano(token, _modelo_do_plano(conta.login, token, plano, modelos)), None)
        except ErroDoPlano as erro:
            return Pagador(PARADO, None, erro.codigo)
    if quem == PARADO:
        return Pagador(PARADO, None, motivo)
    if "modelo_da_chave" not in plano:
        try:
            oferta = modelos.da_chave(chave)
        except openai_api.ErroDaChave:
            oferta = None
        plano["modelo_da_chave"] = modelos.do_envio(oferta, modelos.automatico_da_chave(oferta), CHAVE)
    return Pagador(CHAVE, {"provedor": PROVEDOR, "segredo": chave, "modelo": plano["modelo_da_chave"]}, None)


def _do_plano(token, modelo):
    return {"provedor": PROVEDOR, "via": "plano", "segredo": token, "modelo": modelo}


def credencial_da_imagem(conta, plano, modelos, so_a_chave=False):
    """Com que o Envio escolhe a imagem do próximo Cartão: `(a credencial do plano, chave)`. Quem paga o juiz sai da tabela (`quem_paga`, a
    linha do juiz, a mesma do texto): pelo plano (o token renovado e o Automático da conta, na credencial de `credencial`) quando há login e a
    pessoa não pediu Usar a minha chave (`so_a_chave`, #158); o login acabado para o Envio. A triagem e a imagem gerada vão sempre pela chave
    do cofre (None sem ela). Levanta `ErroDoPlano`."""
    chave = conta.chave() or None
    quem, motivo = quem_paga(*conta.situacao(), so_a_chave, bool(chave))
    if quem == PARADO and motivo != SEM_CHAVE:
        raise ErroDoPlano(motivo)
    token = conta.login.token() if quem == PLANO else None
    if token and "automatico" not in plano:
        plano["automatico"] = _oferta_do_plano(conta.login, token, modelos)[0]
    return (_do_plano(token, plano["automatico"]) if token else None), chave

import dataclasses
import os
import threading
from dataclasses import dataclass
from datetime import date

from . import envio, trabalhador
from .atualizacao import AnkiWebAusente, Atualizacao, RegistroDaAtualizacao
from .chaves import Cofre
from .colecao_vazia import SemColecao
from .configuracao import ORIGENS_ACEITAS, PORTA
from .esperas import Esperas
from .ia_dos_cartoes import IaDosCartoes, MotorNaOpenAI
from .login_do_chatgpt import LoginDoChatGPT
from .modelo_dos_cartoes import Conta, ListaDosModelos, ModeloDosCartoes, lista_nossa
from .montagem_do_cartao import motor_do_cartao
from .pareamento import Pareamento
from .perfil import PerfilFixo
from .servicos_de_fora import ServicosDeFora
from .teto_do_mes import TetoDoMes


@dataclass(frozen=True)
class Porta:

    numero: int = PORTA
    origens_aceitas: tuple = ORIGENS_ACEITAS


@dataclass(frozen=True)
class Ambiente:

    dados: object
    logger: object
    versao: str


@dataclass(frozen=True)
class Fronteiras:

    colecao: object = None
    item_de_login: object = None
    atualizacao: object = None
    motor: object = None
    adaptador_de_imagem: object = None
    modelos_da_ia: object = None
    hoje: object = date.today


@dataclass(frozen=True)
class PecasDaConexao:

    ambiente: Ambiente
    servicos: ServicosDeFora
    esperas: Esperas
    colecao: object
    item_de_login: object
    perfil_fixo: PerfilFixo
    cofre: Cofre
    pareamento: Pareamento
    chatgpt: LoginDoChatGPT
    modelos: ModeloDosCartoes
    ia: IaDosCartoes
    atualizacao: Atualizacao
    fila: envio.Fila
    teto: TetoDoMes
    contato: threading.Event
    trabalhador: object

    def sem_trabalhador(self):
        return dataclasses.replace(self, trabalhador=None)


class _Montagem:

    def __init__(self, ambiente, servicos, esperas, fronteiras):
        self.ambiente, self.servicos, self.esperas, self.fronteiras = ambiente, servicos, esperas, fronteiras
        self.dados, self.logger = ambiente.dados, ambiente.logger
        self.contato = threading.Event()

    def no_ambiente(self, nome):
        return os.path.join(self.dados.raiz, nome)

    def colecao(self):
        return self.fronteiras.colecao or SemColecao()

    def atualizacao(self):
        if self.fronteiras.atualizacao is not None:
            return self.fronteiras.atualizacao
        registro = RegistroDaAtualizacao(self.no_ambiente("atualizacao.json"), self.ambiente.versao, self.logger)
        return Atualizacao(registro=registro, anki_web=AnkiWebAusente(), logger=self.logger)

    def chatgpt(self):
        return LoginDoChatGPT(self.dados.chaves, self.logger, base=self.servicos.chatgpt, api=self.servicos.openai)

    def modelos(self, motor, conta):
        escolha_de_fabrica = lambda: motor.config_loader.base_config()["openai"]["chat_model"]
        lista = ListaDosModelos(self.fronteiras.modelos_da_ia or lista_nossa(), self.fronteiras.hoje, escolha_de_fabrica, self.logger)
        return ModeloDosCartoes(self.no_ambiente("modelo-dos-cartoes.json"), lista, conta, self.logger)

    def ia(self, motor, conta, modelos):
        return IaDosCartoes(conta, modelos, motor=MotorNaOpenAI(motor, self.servicos.openai), logger=self.logger)

    def teto(self, fila):
        return TetoDoMes(self.no_ambiente("teto-do-mes.json"), fila, self.fronteiras.hoje)

    def trabalhador(self, fila, colecao, ia):
        motor = motor_do_cartao(fila, self.servicos, self.esperas, self.fronteiras.adaptador_de_imagem)
        trabalho = envio.Trabalho(fila, colecao, ia, motor, self.esperas)
        return trabalhador.Trabalhador(trabalho, intervalo=self.esperas.do_envio, contato=self.contato, espera_do_contato=self.esperas.do_contato)

    def montar(self):
        colecao = self.colecao()
        perfil_fixo = PerfilFixo(self.no_ambiente("perfil.json"))
        colecao.fixar_o_perfil(perfil_fixo)
        cofre = Cofre(self.dados.chaves)
        chatgpt = self.chatgpt()
        conta = Conta(chatgpt, cofre, self.servicos.openai)
        motor = self.fronteiras.motor or envio.motor_do_complemento()
        modelos = self.modelos(motor, conta)
        ia = self.ia(motor, conta, modelos)
        fila = envio.Fila(self.dados, motor, self.logger)
        teto = self.teto(fila)
        self.esperas = dataclasses.replace(self.esperas, teto=teto)
        return PecasDaConexao(
            ambiente=self.ambiente, servicos=self.servicos, esperas=self.esperas, colecao=colecao, item_de_login=self.fronteiras.item_de_login,
            perfil_fixo=perfil_fixo, cofre=cofre, pareamento=Pareamento(self.no_ambiente("pareamento.json"), self.logger), chatgpt=chatgpt,
            modelos=modelos, ia=ia, atualizacao=self.atualizacao(), fila=fila, teto=teto, contato=self.contato,
            trabalhador=self.trabalhador(fila, colecao, ia))


def montar(ambiente, servicos, esperas, fronteiras=Fronteiras()):
    return _Montagem(ambiente, servicos, esperas, fronteiras).montar()

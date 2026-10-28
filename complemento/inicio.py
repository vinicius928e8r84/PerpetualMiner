"""O que o complemento faz ao carregar no Anki: a pasta de dados, o log, o abridor e a Conexão.

Nada aqui levanta erro: um erro no carregamento abriria o diálogo de erro do Anki,
culpando o complemento. Tudo vai ao logger.
"""

import os
import sys

from . import abridor as abridores, item_de_login as itens_de_login, pasta_de_dados, registro
from .configuracao import OPENAI_BASE, OPENVERSE_BASE, ORIGENS_ACEITAS, PORTA, VERSAO, VOZ_BASE
from .servidor import Conexao

ABRIDOR_DESTE_COMPUTADOR = object()


def iniciar(
    pasta_do_complemento,
    perfil_aberto,
    *,
    porta=PORTA,
    origens_aceitas=ORIGENS_ACEITAS,
    colecao=None,
    item_de_login=None,
    openai_base=OPENAI_BASE,
    openverse_base=OPENVERSE_BASE,
    voz_base=VOZ_BASE,
    abridor=ABRIDOR_DESTE_COMPUTADOR,
    ao_abrir_o_perfil=None,
):
    """Prepara `user_files`, escreve o abridor e sobe a Conexão, com o adaptador da coleção que ela lê. Devolve a Conexão, ou None se ela não subiu.

    O `item_de_login` é o de “Abrir o Anki com o computador”; sem ele, o deste computador (None onde não há).
    O `abridor` é o de “Abrir o Anki sozinho” (`abridor.py`); omitido, o deste computador, em `user_files/abridor`.
    `abridor=None` desativa a escrita e o registro (testes); um abridor injetado só usa os destinos dele.
    Ele é escrito agora e de novo a cada perfil que abre (`ao_abrir_o_perfil` recebe a função que o reescreve; no Anki, o gancho
    `profile_did_open`), sempre com o perfil **marcado** (#149): o que estava aberto na primeira conexão, até a pessoa escolher outro.
    A mesma função marca o perfil aberto quando ainda não há marcado.
    """
    logger = registro.silencioso()
    try:
        dados = pasta_de_dados.preparar(pasta_do_complemento)
        logger = registro.criar(dados.logs)
        if abridor is ABRIDOR_DESTE_COMPUTADOR:
            abridor = abridores.deste_computador(
                plataforma=sys.platform, ambiente=os.environ, executavel=sys.executable, pasta=os.path.join(dados.raiz, "abridor")
            )
        if item_de_login is None:
            item_de_login = itens_de_login.deste_computador(plataforma=sys.platform, ambiente=os.environ, executavel=sys.executable)
        conexao = Conexao(
            porta=porta,
            origens_aceitas=origens_aceitas,
            versao=VERSAO,
            perfil_aberto=perfil_aberto,
            logger=logger,
            dados=dados,
            colecao=colecao,
            openai_base=openai_base,
            openverse_base=openverse_base,
            voz_base=voz_base,
            item_de_login=item_de_login,
        )
        _cuidar_do_perfil(conexao, abridor, ao_abrir_o_perfil, logger)
        return conexao if conexao.iniciar() else None
    except Exception:
        logger.exception("O complemento não conseguiu iniciar")
        return None


def _cuidar_do_perfil(conexao, abridor, ao_abrir_o_perfil, logger):
    """Marca o perfil aberto na primeira conexão (#149) e escreve o abridor com o perfil marcado, agora e a cada perfil que abre
    (`ao_abrir_o_perfil`); a Conexão o reescreve também quando a pessoa escolhe outro perfil. Nada aqui derruba a Conexão."""
    def reagir():
        try:
            marcado = conexao.perfil_fixo.marcar_se_falta(conexao.perfil_aberto())
        except Exception as erro:  # sem marca, o Envio só espera: o resto segue
            logger.warning("O perfil aberto não foi marcado: %s", erro)
            return
        if abridor is None:
            return
        try:
            perfis = conexao.colecao.perfis()
        except Exception:  # o Anki não respondeu: não se sabe se o marcado sumiu, então vale o marcado
            perfis = []
        if perfis and marcado not in perfis:
            marcado = None  # `-p` com um perfil que o Anki não tem: os Anki mais antigos não abrem; sem ele abrem a tela de perfis
        try:
            abridor.escrever(marcado)
        except Exception as erro:  # sem abridor, a extensão só não abre o Anki sozinha: o resto segue
            logger.warning("O abridor não foi escrito: %s", erro)

    conexao.ao_mudar_o_perfil = reagir
    reagir()
    if ao_abrir_o_perfil is not None:
        try:
            ao_abrir_o_perfil(reagir)
        except Exception:
            logger.exception("O perfil e o abridor não vão acompanhar o perfil que abrir")

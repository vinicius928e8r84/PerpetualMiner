"""O que o complemento faz ao carregar no Anki: a pasta de dados, o log, o abridor e a Conexão.

Nada aqui levanta erro: um erro no carregamento abriria o diálogo de erro do Anki,
culpando o complemento. Tudo vai ao logger.
"""

import os
import sys

from . import abridor as abridores, item_de_login as itens_de_login, pasta_de_dados, registro
from .configuracao import OPENAI_BASE, OPENVERSE_BASE, ORIGENS_ACEITAS, PORTA, VERSAO
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
    abridor=ABRIDOR_DESTE_COMPUTADOR,
    ao_abrir_o_perfil=None,
):
    """Prepara `user_files`, escreve o abridor e sobe a Conexão, com o adaptador da coleção que ela lê. Devolve a Conexão, ou None se ela não subiu.

    O `item_de_login` é o de “Abrir o Anki com o computador”; sem ele, o deste computador (None onde não há).
    O `abridor` é o de “Abrir o Anki sozinho” (`abridor.py`); omitido, o deste computador, em `user_files/abridor`.
    `abridor=None` desativa a escrita e o registro (testes); um abridor injetado só usa os destinos dele.
    Ele é escrito agora, com o perfil aberto (nenhum, ao carregar), e de novo a cada perfil que abre: `ao_abrir_o_perfil`
    recebe a função que o reescreve (no Anki, o gancho `profile_did_open`).
    """
    logger = registro.silencioso()
    try:
        dados = pasta_de_dados.preparar(pasta_do_complemento)
        logger = registro.criar(dados.logs)
        if abridor is ABRIDOR_DESTE_COMPUTADOR:
            abridor = abridores.deste_computador(
                plataforma=sys.platform, ambiente=os.environ, executavel=sys.executable, pasta=os.path.join(dados.raiz, "abridor")
            )
        _cuidar_do_abridor(abridor, perfil_aberto, ao_abrir_o_perfil, logger)
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
            item_de_login=item_de_login,
        )
        return conexao if conexao.iniciar() else None
    except Exception:
        logger.exception("O complemento não conseguiu iniciar")
        return None


def _cuidar_do_abridor(abridor, perfil_aberto, ao_abrir_o_perfil, logger):
    """Escreve o abridor agora e pede para reescrevê-lo a cada perfil que abre. Nada aqui derruba a Conexão."""
    if abridor is None:
        return

    def escrever():
        try:
            abridor.escrever(perfil_aberto())
        except Exception as erro:  # sem abridor, a extensão só não abre o Anki sozinha: o resto segue
            logger.warning("O abridor não foi escrito: %s", erro)

    escrever()
    if ao_abrir_o_perfil is not None:
        try:
            ao_abrir_o_perfil(escrever)
        except Exception:
            logger.exception("O abridor não vai acompanhar o perfil que abrir")

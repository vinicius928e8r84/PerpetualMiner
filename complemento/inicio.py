"""O que o complemento faz ao carregar no Anki: a pasta de dados, o log e a Conexão.

Nada aqui levanta erro: um erro no carregamento abriria o diálogo de erro do Anki,
culpando o complemento. Tudo vai ao logger.
"""

import os
import sys

from . import item_de_login as itens_de_login, pasta_de_dados, registro
from .configuracao import ORIGENS_ACEITAS, PORTA, VERSAO
from .servidor import Conexao


def iniciar(pasta_do_complemento, perfil_aberto, *, porta=PORTA, origens_aceitas=ORIGENS_ACEITAS, colecao=None, item_de_login=None):
    """Prepara `user_files` e sobe a Conexão, com o adaptador da coleção que ela lê. Devolve a Conexão, ou None se ela não subiu.

    O `item_de_login` é o de “Abrir o Anki com o computador”; sem ele, o deste computador (None onde não há).
    """
    logger = registro.silencioso()
    try:
        dados = pasta_de_dados.preparar(pasta_do_complemento)
        logger = registro.criar(dados.logs)
        if item_de_login is None:
            item_de_login = itens_de_login.deste_computador(plataforma=sys.platform, ambiente=os.environ, executavel=sys.executable)
        conexao = Conexao(
            porta=porta,
            origens_aceitas=origens_aceitas,
            versao=VERSAO,
            perfil_aberto=perfil_aberto,
            logger=logger,
            colecao=colecao,
            item_de_login=item_de_login,
        )
        return conexao if conexao.iniciar() else None
    except Exception:
        logger.exception("O complemento não conseguiu iniciar")
        return None

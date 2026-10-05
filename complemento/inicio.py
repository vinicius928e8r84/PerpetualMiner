"""O que o complemento faz ao carregar no Anki: a pasta de dados, o log e a Conexão.

Nada aqui levanta erro: um erro no carregamento abriria o diálogo de erro do Anki,
culpando o complemento. Tudo vai ao logger.
"""

from . import pasta_de_dados, registro
from .configuracao import OPENAI_BASE, ORIGENS_ACEITAS, PORTA, VERSAO
from .servidor import Conexao


def iniciar(pasta_do_complemento, perfil_aberto, *, porta=PORTA, origens_aceitas=ORIGENS_ACEITAS, openai_base=OPENAI_BASE):
    """Prepara `user_files` e sobe a Conexão. Devolve a Conexão, ou None se ela não subiu."""
    logger = registro.silencioso()
    try:
        dados = pasta_de_dados.preparar(pasta_do_complemento)
        logger = registro.criar(dados.logs)
        conexao = Conexao(
            porta=porta, origens_aceitas=origens_aceitas, versao=VERSAO, perfil_aberto=perfil_aberto, logger=logger,
            pasta_das_chaves=dados.chaves, openai_base=openai_base,
        )
        return conexao if conexao.iniciar() else None
    except Exception:
        logger.exception("O complemento não conseguiu iniciar")
        return None

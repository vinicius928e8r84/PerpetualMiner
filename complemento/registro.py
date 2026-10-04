"""O logger do complemento: onde vai todo erro da Conexão.

Nada aqui toca o logging do processo (o raiz) nem stdout e stderr: o Anki abre o
diálogo de erro por conta própria quando o complemento escreve ou levanta onde ele
escuta.
"""

import logging
import logging.handlers
import os

from .configuracao import NOME_DO_LOGGER


class _ArquivoDeLog(logging.handlers.RotatingFileHandler):
    def handleError(self, record):
        # O padrão imprime o erro no stderr, que é justo o que não pode acontecer.
        pass


def criar(pasta_dos_logs):
    """O logger do complemento, gravando em `<pasta_dos_logs>/complemento.log`."""
    logger = logging.getLogger(NOME_DO_LOGGER)
    for antigo in list(logger.handlers):
        logger.removeHandler(antigo)
        antigo.close()
    logger.setLevel(logging.INFO)
    logger.propagate = False
    arquivo = _ArquivoDeLog(
        os.path.join(pasta_dos_logs, "complemento.log"), maxBytes=512 * 1024, backupCount=3, encoding="utf-8"
    )
    arquivo.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logger.addHandler(arquivo)
    return logger


def silencioso():
    """O logger do complemento sem arquivo, para quando nem a pasta de logs existe: não escreve em lugar nenhum."""
    logger = logging.getLogger(NOME_DO_LOGGER)
    if not logger.handlers:
        logger.addHandler(logging.NullHandler())
    logger.propagate = False
    return logger

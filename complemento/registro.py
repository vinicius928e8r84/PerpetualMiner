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
    """Abre o arquivo para cada registro e o solta logo depois (#501, #502): no Windows um log aberto em `user_files` impede o
    `backupUserFiles` do Anki (renomeia a pasta), o diálogo “Atualizar Extensões” falha calado e o “Remover” (apagar a pasta)
    deixa a Conexão pela metade."""

    def __init__(self, *args, **kwargs):
        kwargs["delay"] = True
        super().__init__(*args, **kwargs)

    def emit(self, record):
        try:
            super().emit(record)
        finally:
            self._soltar_o_arquivo()

    def _soltar_o_arquivo(self):
        self.acquire()
        try:
            fluxo, self.stream = self.stream, None
            if fluxo is not None:
                try:
                    fluxo.close()
                except OSError:
                    pass
        finally:
            self.release()

    def handleError(self, record):
        # O padrão imprime o erro no stderr, que é justo o que não pode acontecer.
        pass


def criar(pasta_dos_logs):
    """O logger do complemento, gravando em `<pasta_dos_logs>/complemento.log`.

    Se o arquivo não abre (sem permissão, uma pasta no lugar), devolve o logger silencioso:
    sem handler o `logging` escreveria o erro no stderr (`lastResort`).
    """
    try:
        caminho = os.path.join(pasta_dos_logs, "complemento.log")
        with open(caminho, "a", encoding="utf-8"):
            pass
        arquivo = _ArquivoDeLog(caminho, maxBytes=512 * 1024, backupCount=3, encoding="utf-8")
    except OSError:
        return silencioso()
    arquivo.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logger = logging.getLogger(NOME_DO_LOGGER)
    for antigo in list(logger.handlers):
        logger.removeHandler(antigo)
        antigo.close()
    logger.setLevel(logging.INFO)
    logger.propagate = False
    logger.addHandler(arquivo)
    return logger


def silencioso():
    """O logger do complemento sem arquivo, para quando nem a pasta de logs existe: não escreve em lugar nenhum."""
    logger = logging.getLogger(NOME_DO_LOGGER)
    if not logger.handlers:
        logger.addHandler(logging.NullHandler())
    logger.propagate = False
    return logger

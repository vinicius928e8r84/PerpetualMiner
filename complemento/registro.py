import logging
import logging.handlers
import os

from .configuracao import NOME_DO_LOGGER


class _ArquivoDeLog(logging.handlers.RotatingFileHandler):
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
        pass


def criar(pasta_dos_logs):
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
    logger = logging.getLogger(NOME_DO_LOGGER)
    if not logger.handlers:
        logger.addHandler(logging.NullHandler())
    logger.propagate = False
    return logger

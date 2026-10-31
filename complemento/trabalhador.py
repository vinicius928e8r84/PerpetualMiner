"""A thread de trabalho do Envio (#142): tira um Envio da fila de cada vez e o faz (`envio.Trabalho`)."""

import threading
import time

from .paradas_do_envio import Interrompido


class Trabalhador:
    """A thread de trabalho: tira um Envio da fila de cada vez. Nenhum erro dela sai do logger."""

    def __init__(self, trabalho, intervalo=1.0, contato=None, espera_do_contato=0.0):
        self.trabalho = trabalho
        self.fila = trabalho.fila
        self.parar = trabalho.parar
        self.intervalo = intervalo
        # Depois de subir, a thread espera `contato` (um pedido de Envio da extensão) por até `espera_do_contato` s antes de retomar o
        # que ficou parado: um Apagar tudo feito com o Anki fechado chega antes de a Conexão gastar a chave com as Frases apagadas.
        self.contato = contato
        self.espera_do_contato = espera_do_contato
        self._thread = None

    def _esperar_a_extensao(self):
        if self.contato is None or self.espera_do_contato <= 0:
            return
        self.trabalho.logger.info("Envio: esperando até %g s o primeiro pedido de Envio da extensão antes de retomar", self.espera_do_contato)
        fim = time.monotonic() + self.espera_do_contato
        while not self.contato.is_set() and not self.parar.is_set() and time.monotonic() < fim:
            self.contato.wait(min(self.intervalo, max(fim - time.monotonic(), 0)))

    def iniciar(self):
        self.fila.recuperar_os_interrompidos()
        self._thread = threading.Thread(target=self._rodar, name="perpetualminer-envio", daemon=True)
        self._thread.start()

    def _rodar(self):
        logger = self.trabalho.logger
        self._esperar_a_extensao()
        while not self.parar.is_set():
            job_id = None
            try:
                job_id = self.fila.reservar_o_proximo()
                if job_id is None:
                    self.fila.mudou.wait(self.intervalo)
                    self.fila.mudou.clear()
                    continue
                logger.info("Envio %s: começou", job_id)
                self.trabalho.fazer(job_id)
            except Interrompido:
                return
            except Exception as erro:
                logger.error("Envio: erro inesperado na thread de trabalho (%s)", type(erro).__name__, exc_info=True)
                if job_id is not None:
                    self._falhou(job_id)
                self.parar.wait(self.intervalo)

    def _falhou(self, job_id):
        try:
            self.trabalho._terminar(job_id, self.fila.pedido(job_id) or {}, "internal_error")
        except Exception:
            self.trabalho.logger.exception("Envio %s: não deu para gravar a falha", job_id)

    def encerrar(self):
        self.parar.set()
        self.fila.mudou.set()
        self.fila.despertador.set()
        if self._thread is not None:
            self._thread.join(timeout=5)
            self._thread = None

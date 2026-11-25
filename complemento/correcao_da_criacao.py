import re

from . import baralhos, tipo_de_nota
from .ia_do_envio import SemQuemPague
from .ia_dos_cartoes import CORRECAO
from .motor.openai_http import ErroDaOpenAI

LIMITE_POR_ENVIO = 20


class _ParouACorrecao(Exception):
    pass


def palavra_sem_a_pronuncia(campo):
    return re.split(r"\s+-\s+/", campo)[0]


class CorrecaoDaCriacao:
    def __init__(self, fila, colecao, motor, logger):
        self.fila, self.colecao, self.motor, self.logger = fila, colecao, motor, logger

    def corrigir(self, envio, parada):
        if parada:
            return
        try:
            self._corrigir_as_frases(envio)
        except _ParouACorrecao:
            return

    def _corrigir_as_frases(self, envio):
        verso_em_dia = False
        for nota in self._frases_da_criacao(envio):
            self._conferir_que_o_envio_segue(envio)
            correcao = self._pedir_a_correcao(envio, nota)
            if not correcao:
                continue
            self._gravar_a_correcao(envio, nota, correcao)
            if not verso_em_dia:
                verso_em_dia = True
                self._atualizar_o_verso(envio.job_id, envio.pedido["lang"])

    def _frases_da_criacao(self, envio):
        try:
            return self.colecao.frases_a_corrigir(envio.pedido["lang"], LIMITE_POR_ENVIO)
        except baralhos.ColecaoIndisponivel:
            raise _ParouACorrecao()
        except Exception as erro:
            self._avisar(envio, "não deu para ler as frases da Criação", type(erro).__name__)
            raise _ParouACorrecao()

    def _conferir_que_o_envio_segue(self, envio):
        if self.fila.estado(envio.job_id).get("wiped") or envio.ia.teto_chegou():
            raise _ParouACorrecao()

    def _pedir_a_correcao(self, envio, nota):
        try:
            pedir = envio.ia.pedido_do_texto(envio.config, CORRECAO)
        except SemQuemPague:
            raise _ParouACorrecao()
        palavra = palavra_sem_a_pronuncia(nota["palavra"])
        try:
            return self.motor.corrigir_frase.corrigir(envio.config, pedir, dict(nota, palavra=palavra))
        except ErroDaOpenAI as erro:
            self._avisar(envio, "a correção da Criação parou", erro.codigo)
        except Exception as erro:
            self._avisar(envio, "a correção da Criação falhou", type(erro).__name__)
        raise _ParouACorrecao()

    def _gravar_a_correcao(self, envio, nota, correcao):
        try:
            self.colecao.gravar_correcao(nota["guid"], nota["escrita"], correcao)
        except baralhos.ColecaoIndisponivel:
            raise _ParouACorrecao()
        except Exception as erro:
            self._avisar(envio, "o Anki não gravou a correção", type(erro).__name__)
            raise _ParouACorrecao()

    def _avisar(self, envio, o_que_houve, motivo):
        self.logger.warning("Envio %s: %s (%s)", envio.job_id, o_que_houve, motivo)

    def _atualizar_o_verso(self, job_id, lang):
        try:
            tipo_de_nota.atualizar_a_criacao(self.colecao, lang)
        except Exception as erro:
            self.logger.warning("Envio %s: o verso da Criação não foi atualizado (%s)", job_id, type(erro).__name__)

"""A correção da Criação no Envio (#169): depois dos Cartões, a IA corrige as frases que a pessoa escreveu na frente Criação (o gancho da revisão as
grava no campo “Frase escrita”, `criacao_na_revisao.py`). Cada correção vai para a nota (“Escrito antes” é a frase que a IA leu, “Correção” o que ela
devolveu) e o verso do Cartão passa a mostrar “Da última vez você escreveu … → correção”. Uma frase já lida não é pedida de novo (o adaptador só oferece
a que é diferente do “Escrito antes”); uma frase que a pessoa escreveu de novo é outra e vai no Envio seguinte.

É um extra do Envio: falhar não o derruba. O que a IA recusa, o plano que chega ao limite, o teto do mês, uma coleção ocupada ou o Anki sem os campos
deixam as frases que faltam para o próximo Envio, sem erro. O custo vai ao `costs.jsonl` do Envio à parte do custo dos Cartões (`correctionUsd`)."""

import re

from . import baralhos, tipo_de_nota
from .ia_do_envio import SemQuemPague
from .ia_dos_cartoes import CORRECAO
from .motor.openai_http import ErroDaOpenAI

LIMITE_POR_ENVIO = 20


class _ParouACorrecao(Exception):
    """A correção da Criação deste Envio acabou aqui: o que falta fica para o próximo Envio."""


def palavra_sem_a_pronuncia(campo):
    return re.split(r"\s+-\s+/", campo)[0]


class CorrecaoDaCriacao:
    """O que o `Trabalho` chama depois do último Cartão para corrigir as frases da Criação."""

    def __init__(self, fila, colecao, motor, logger):
        self.fila, self.colecao, self.motor, self.logger = fila, colecao, motor, logger

    def corrigir(self, envio, parada):
        """`envio` é o `EnvioEmAndamento` (a porta presa ao Envio, `ia_do_envio.IaDoEnvio`, diz quem paga e o teto); `parada` é o código que
        parou o Envio, ou None: a chave que o parou não corrige nada."""
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
            return self.motor.corrigir_frase.corrigir(envio.config, pedir, palavra, nota["frase"], nota["escrita"])
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
        """O Cartão da Criação que a pessoa já tinha antes da correção não tem o “Da última vez você escreveu …” no verso: o modelo dele é regravado, como
        a troca da frente faz (`tipo_de_nota.trocar_a_frente`). Só se o tipo de nota ainda tem o nosso modelo Criação sozinho; a pessoa que o mexeu, ou que
        trocou de frente, fica como está."""
        try:
            tipo_de_nota.atualizar_a_criacao(self.colecao, lang)
        except Exception as erro:
            self.logger.warning("Envio %s: o verso da Criação não foi atualizado (%s)", job_id, type(erro).__name__)

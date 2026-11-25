import logging
from collections import namedtuple

from .configuracao import NOME_DO_LOGGER
from .modelo_dos_cartoes import CHAVE, PARADO, PLANO, SEM_CHAVE, credencial, credencial_da_imagem, quem_paga

TEXTO, CORRECAO, JUIZ, IMAGEM, VOZ, OUVIR = "texto", "correcao", "juiz", "imagem", "voz", "ouvir"
PELO_PLANO = (TEXTO, CORRECAO, JUIZ)
SO_PELA_CHAVE = (IMAGEM, VOZ, OUVIR)
ETAPAS = PELO_PLANO + SO_PELA_CHAVE


class Situacao(namedtuple("Situacao", "login motivo pela_chave tem_chave")):
    pass


MotorNaOpenAI = namedtuple("MotorNaOpenAI", "motor openai_base")
SEM_MOTOR = MotorNaOpenAI(None, None)


def quem_paga_a_etapa(etapa, situacao):
    if etapa in PELO_PLANO:
        return quem_paga(*situacao)
    if etapa in SO_PELA_CHAVE:
        return (CHAVE, None) if situacao.tem_chave else (PARADO, SEM_CHAVE)
    raise ValueError(etapa)


class JuizDaImagem:
    def __init__(self, provedores, plano, presa, logger):
        self._provedores, self._plano, self._presa, self._logger = provedores, plano, presa, logger

    def julgar(self, modelo_da_chave, sistema, conteudo, rotulo):
        p = self._provedores
        if self._plano:
            try:
                texto, uso = p.texto(self._plano, sistema, conteudo, tempo=p.TEMPO_DA_IMAGEM, json=True, repeticoes=p.REPETICOES_DA_IMAGEM)
                return texto, uso, False
            except p.ErroDoProvedor as erro:
                if not (self._presa and p.passageira(erro.codigo, erro.status)):
                    raise
                self._logger.warning("image_judge plan judge failed (%s): the key judge decides keyword=%s", erro.codigo, rotulo)
        texto, uso = self._presa.texto(modelo_da_chave, sistema, conteudo, temperatura=0, json=True, repeticoes=p.REPETICOES_DA_IMAGEM)
        return texto, uso, True


class IaDosCartoes:
    def __init__(self, conta, modelos, motor=SEM_MOTOR, logger=None):
        self._conta, self._modelos = conta, modelos
        self._motor, self._openai_base = motor
        self._logger = logger or logging.getLogger(NOME_DO_LOGGER)
        self._do_envio = {}

    def novo_envio(self):
        self._do_envio = {}

    def pagador(self, etapa, pela_chave=False):
        return quem_paga_a_etapa(etapa, Situacao(*self._conta.situacao(), pela_chave, self._conta.chave() is not None))

    def para_o_texto(self, pela_chave=False):
        return credencial(self._conta, self._do_envio, self._modelos, pela_chave)

    def pedido_do_texto(self, pagador, config, etapa=TEXTO):
        if etapa not in (TEXTO, CORRECAO):
            raise ValueError(etapa)
        provedores, custos = self._motor.provedores, self._motor.cost_tracker
        modelo_do_motor = config["openai"].get("chat_model", "gpt-4o")
        cred = self._com_o_endereco(pagador.credencial)
        cred["modelo"] = cred["modelo"] or modelo_do_motor
        modelo_da_chave, pasta = modelo_do_motor if pagador.quem == PLANO else cred["modelo"], config["paths"]["log_dir"]

        def pedir(sistema, mensagem, rotulo):
            if etapa == CORRECAO:
                pelo_plano = pagador.quem == PLANO
                texto, uso = provedores.texto(cred, sistema, mensagem) if pelo_plano else provedores.texto(cred, sistema, mensagem, temperatura=0.2)
                custos.record_correction(pasta, custos.TokenUsage(cred["modelo"], uso.get("entrada", 0), uso.get("saida", 0)), paid=not pelo_plano)
            elif pagador.quem == PLANO:
                texto, uso = provedores.texto(cred, sistema, mensagem)
                custos.record_plan_tokens(pasta, custos.TokenUsage(cred["modelo"], uso["entrada"], uso["saida"]), modelo_da_chave, rotulo)
            else:
                texto, uso = provedores.texto(cred, sistema, mensagem, temperatura=0.2)
                if uso:
                    custos.record_tokens(pasta, custos.TokenUsage(cred["modelo"], uso.get("entrada", 0), uso.get("saida", 0)), keyword=rotulo)
            return texto

        return pedir

    def para_a_imagem(self, pela_chave=False):
        plano, chave = credencial_da_imagem(self._conta, self._do_envio, self._modelos, pela_chave)
        presa = self._motor.provedores.PelaChave(chave, self._openai_base) if chave else None
        plano = self._com_o_endereco(plano) if plano else None
        juiz = JuizDaImagem(self._motor.provedores, plano, presa, self._logger) if plano or presa else None
        return juiz, presa

    def _com_o_endereco(self, credencial):
        return dict(credencial, base=self._openai_base)

    def para_a_fala(self):
        return self._conta.chave()

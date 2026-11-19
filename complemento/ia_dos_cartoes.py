"""A IA dos cartões como porta (C5): quem paga cada pedido pago do Envio e do Ouvir, num lugar só. A tabela etapa × situação
(`quem_paga_a_etapa`) e o porquê de cada linha estão em `docs/design/ia-dos-cartoes.md`.

A porta é a única do Envio e das rotas que lê o login do ChatGPT e o cofre para decidir quem paga. Ela embrulha as funções de hoje
(`modelo_dos_cartoes.credencial` e `credencial_da_imagem`) e entrega a credencial de cada etapa; o texto do Cartão ela mesma pede e anota
o custo, e a correção da Criação também (`pedido_do_texto`): o motor só recebe a função. O modelo do texto lido uma vez por Envio fica aqui (`novo_envio` o esquece)."""

import logging

from .configuracao import NOME_DO_LOGGER
from .login_do_chatgpt import SEM_LOGIN
from .modelo_dos_cartoes import CHAVE, PARADO, PLANO, SEM_CHAVE, credencial, credencial_da_imagem, quem_paga

TEXTO, CORRECAO, JUIZ, IMAGEM, VOZ, OUVIR = "texto", "correcao", "juiz", "imagem", "voz", "ouvir"
PELO_PLANO = (TEXTO, CORRECAO, JUIZ)
SO_PELA_CHAVE = (IMAGEM, VOZ, OUVIR)
ETAPAS = PELO_PLANO + SO_PELA_CHAVE


def quem_paga_a_etapa(etapa, login, motivo, pela_chave, tem_chave):
    """`(PLANO | CHAVE | PARADO, o motivo do parado)` de um pedido da `etapa`. `login` e `motivo` são a `situacao()` do login;
    `pela_chave`, o Usar a minha chave do Envio (#158); `tem_chave`, se o cofre tem a chave da OpenAI. Parado é ninguém paga: o que a
    etapa faz então (parar o Envio, pular, seguir sem imagem ou sem voz, 409) é dela."""
    if etapa in PELO_PLANO:
        return quem_paga(login, motivo, pela_chave, tem_chave)
    if etapa in SO_PELA_CHAVE:
        return (CHAVE, None) if tem_chave else (PARADO, SEM_CHAVE)
    raise ValueError(etapa)


class JuizDaImagem:
    """O juiz da imagem do próximo Cartão: pelo plano do ChatGPT quando há (`plano`: a credencial dele, com o token renovado e o Automático
    da conta), senão
    pela chave presa (`presa`). O plano que recusa de passagem deixa a chave decidir; outra recusa dele (o limite, a conta) sobe e para o Envio."""

    def __init__(self, provedores, plano, presa, base, logger):
        self._provedores, self._plano, self._presa, self._base, self._logger = provedores, plano, presa, base, logger

    def julgar(self, modelo_da_chave, sistema, conteudo, rotulo):
        """`(o JSON do veredito, o uso, se a chave pagou)`. Levanta o `ErroDoProvedor` do motor."""
        p = self._provedores
        if self._plano:
            credencial = dict(self._plano, base=self._base)
            try:
                texto, uso = p.texto(credencial, sistema, conteudo, tempo=p.TEMPO_DA_IMAGEM, json=True, repeticoes=p.REPETICOES_DA_IMAGEM)
                return texto, uso, False
            except p.ErroDoProvedor as erro:
                if not (self._presa and p.passageira(erro.codigo, erro.status)):
                    raise
                self._logger.warning("image_judge plan judge failed (%s): the key judge decides keyword=%s", erro.codigo, rotulo)
        texto, uso = self._presa.texto(modelo_da_chave, sistema, conteudo, temperatura=0, json=True, repeticoes=p.REPETICOES_DA_IMAGEM)
        return texto, uso, True


class IaDosCartoes:
    """`login` é o `LoginDoChatGPT` (None: sem login), `cofre` o das chaves, `modelos` o `ModeloDosCartoes`, `motor` o de `engine/`
    (`envio.motor_do_complemento()`), `openai_base` o endereço da OpenAI e `logger` o da Conexão."""

    def __init__(self, login, cofre, modelos, motor=None, openai_base=None, logger=None):
        self._login, self._cofre, self._modelos = login, cofre, modelos
        self._motor, self._openai_base = motor, openai_base
        self._logger = logger or logging.getLogger(NOME_DO_LOGGER)
        self._do_envio = {}

    def novo_envio(self):
        self._do_envio = {}

    def pagador(self, etapa, pela_chave=False):
        """Quem paga agora um pedido da `etapa`, pela tabela, com o login e a chave guardados neste instante."""
        situacao = self._login.situacao() if self._login is not None else (SEM_LOGIN, None)
        return quem_paga_a_etapa(etapa, *situacao, pela_chave, self._cofre.ler("openai") is not None)

    def para_o_texto(self, pela_chave=False):
        """O `Pagador` do texto do próximo Cartão e da correção da Criação (`modelo_dos_cartoes.credencial`)."""
        return credencial(self._login, self._cofre, self._do_envio, self._modelos, pela_chave)

    def pedido_do_texto(self, pagador, config, etapa=TEXTO):
        """A função com que o motor pede o texto de um Cartão (ou, com `etapa` CORRECAO, a correção de uma frase da Criação),
        `pedir(sistema, mensagem, rotulo)` → o texto: vai por quem o `pagador` de `para_o_texto` diz, e o custo fica no `costs.jsonl` de
        `config["paths"]["log_dir"]`: o do Cartão com o `rotulo` (o do plano, a zero e com o que a chave teria cobrado), o da correção à
        parte (`correction_tokens`, a zero pelo plano). Uma recusa é o `ErroDoProvedor` do motor."""
        if etapa not in (TEXTO, CORRECAO):
            raise ValueError(etapa)
        provedores, custos = self._motor.provedores, self._motor.cost_tracker
        modelo_do_motor = config["openai"].get("chat_model", "gpt-4o")
        cred = dict(pagador.credencial, base=self._openai_base)
        cred["modelo"] = cred["modelo"] or modelo_do_motor
        modelo_da_chave, pasta = modelo_do_motor if pagador.quem == PLANO else cred["modelo"], config["paths"]["log_dir"]

        def pedir(sistema, mensagem, rotulo):
            if etapa == CORRECAO:
                pelo_plano = pagador.quem == PLANO
                texto, uso = provedores.texto(cred, sistema, mensagem) if pelo_plano else provedores.texto(cred, sistema, mensagem, temperatura=0.2)
                custos.record_correction(pasta, cred["modelo"], uso.get("entrada", 0), uso.get("saida", 0), paid=not pelo_plano)
            elif pagador.quem == PLANO:
                texto, uso = provedores.texto(cred, sistema, mensagem)
                custos.record_plan_tokens(pasta, cred["modelo"], modelo_da_chave, uso["entrada"], uso["saida"], rotulo)
            else:
                texto, uso = provedores.texto(cred, sistema, mensagem, temperatura=0.2)
                if uso:
                    custos.record_tokens(pasta, model=cred["modelo"], input_tokens=uso.get("entrada", 0), output_tokens=uso.get("saida", 0), keyword=rotulo)
            return texto

        return pedir

    def para_a_imagem(self, pela_chave=False):
        """`(o juiz, a chave presa)` do próximo Cartão (`modelo_dos_cartoes.credencial_da_imagem`): o `JuizDaImagem` (None sem plano nem
        chave) e a chave presa (`provedores.PelaChave` do motor, None sem chave), que paga a triagem e a imagem gerada. O motor não recebe
        segredo nenhum: nem a chave nem o token do plano."""
        plano, chave = credencial_da_imagem(self._login, self._cofre, self._do_envio, self._modelos, pela_chave)
        presa = self._motor.provedores.PelaChave(chave, self._openai_base) if chave else None
        juiz = JuizDaImagem(self._motor.provedores, plano, presa, self._openai_base, self._logger) if plano or presa else None
        return juiz, presa

    def para_a_fala(self):
        """A chave da voz de reserva e do Ouvir, ou None: o plano do ChatGPT não cobre voz."""
        return self._cofre.ler("openai")

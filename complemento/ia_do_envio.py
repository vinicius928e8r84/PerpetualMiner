"""A porta da IA dos cartões presa a um Envio (C4): o que o Motor do Cartão e o `Trabalho` pedem à IA durante um Envio.

Quem paga cada pedido continua sendo a `IaDosCartoes` (`ia_dos_cartoes.py`); esta porta lê o Usar a minha chave (#158) do Envio a cada
pedido e conduz as duas esperas: o teto do mês (#160, antes de cada Cartão) e o limite do plano do ChatGPT (#158: o texto que o plano
recusou por limite é pedido de novo depois da espera). O lado do Envio de cada espera (o `waiting` do estado, o despertador, parar a
Conexão e apagar as Frases) é a `limite_do_plano.EsperaDoEnvio`. Desenho: `docs/design/ia-dos-cartoes.md`."""

from dataclasses import dataclass

from .ia_dos_cartoes import TEXTO
from .limite_do_plano import PLANO_NO_LIMITE
from .modelo_dos_cartoes import PARADO
from .teto_do_mes import NO_TETO


class SemQuemPague(Exception):
    """Ninguém paga o pedido: `codigo` é o motivo do `Pagador` parado. O que isso faz (parar o Envio, falhar o Cartão, pular) é de quem pediu."""

    def __init__(self, codigo):
        super().__init__(codigo)
        self.codigo = codigo


@dataclass(frozen=True)
class EsperasDaPorta:
    """As duas esperas que a porta conduz: o teto do mês (`teto`, um `TetoDoMes`, conferido a cada `do_teto` s; sem ele, nada pausa pelo
    teto) e o limite do plano do ChatGPT (`do_plano` s)."""

    teto: object = None
    do_teto: float = 60
    do_plano: float = 300


class IaDoEnvio:
    """`ia` é a `IaDosCartoes` da Conexão, `espera` a `EsperaDoEnvio` deste Envio e `esperas` as `EsperasDaPorta`."""

    def __init__(self, ia, espera, logger, esperas=EsperasDaPorta()):
        self.ia, self.espera, self.logger, self.esperas = ia, espera, logger, esperas

    def pedido_do_texto(self, config, etapa=TEXTO):
        """O `pedir` do texto de um Cartão (ou da correção da Criação) por quem paga agora (`IaDosCartoes.pedido_do_texto`). Levanta
        `SemQuemPague`."""
        paga = self.ia.para_o_texto(self.espera.pela_chave())
        if paga.quem == PARADO:
            raise SemQuemPague(paga.motivo)
        return self.ia.pedido_do_texto(paga, config, etapa)

    def para_a_imagem(self):
        """`(o juiz, a chave presa)` do próximo Cartão (`IaDosCartoes.para_a_imagem`)."""
        return self.ia.para_a_imagem(self.espera.pela_chave())

    def para_a_fala(self):
        return self.ia.para_a_fala()

    def teto_chegou(self):
        return self.esperas.teto is not None and self.esperas.teto.chegou()

    def conferir_o_teto(self):
        """Antes de gastar a chave com um Cartão: no teto, o Envio espera (o estado diz `monthly_cap`) até o teto subir ou o mês virar."""
        teto = self.esperas.teto
        if teto is None:
            return
        pausou = False
        while True:
            self.espera.limpar_o_despertador()
            if not teto.chegou():
                break
            if not pausou:
                pausou = True
                self.logger.info("Envio %s: o gasto do mês chegou no teto; o Envio espera", self.espera.job_id)
            self.espera.esperar(dict(NO_TETO), self.esperas.do_teto)
        if pausou:
            self.espera.dizer(None)
            self.logger.info("Envio %s: o teto do mês deixou de valer; o Envio continua", self.espera.job_id)

    def esperar_o_plano(self):
        """O plano recusou o texto por limite de uso: o Envio espera (o estado diz `plan_limit`) até a próxima tentativa ou até o acordarem
        (Tentar de novo, Usar a minha chave). Quem pediu limpa o `waiting` depois do texto que veio."""
        self.espera.limpar_o_despertador()
        self.logger.info("Envio %s: o plano do ChatGPT está no limite; o Envio espera", self.espera.job_id)
        self.espera.esperar(dict(PLANO_NO_LIMITE), self.esperas.do_plano)

from dataclasses import dataclass

from .ia_dos_cartoes import TEXTO
from .limite_do_plano import PLANO_NO_LIMITE
from .modelo_dos_cartoes import PARADO
from .teto_do_mes import NO_TETO


class SemQuemPague(Exception):
    def __init__(self, codigo):
        super().__init__(codigo)
        self.codigo = codigo


@dataclass(frozen=True)
class EsperasDaPorta:
    teto: object = None
    do_teto: float = 60
    do_plano: float = 300


class IaDoEnvio:
    def __init__(self, ia, espera, logger, esperas=EsperasDaPorta()):
        self.ia, self.espera, self.logger, self.esperas = ia, espera, logger, esperas

    def pedido_do_texto(self, config, etapa=TEXTO):
        paga = self.ia.para_o_texto(self.espera.pela_chave())
        if paga.quem == PARADO:
            raise SemQuemPague(paga.motivo)
        return self.ia.pedido_do_texto(paga, config, etapa)

    def para_a_imagem(self):
        return self.ia.para_a_imagem(self.espera.pela_chave())

    def para_a_fala(self):
        return self.ia.para_a_fala()

    def teto_chegou(self):
        return self.esperas.teto is not None and self.esperas.teto.chegou()

    def conferir_o_teto(self):
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
        self.espera.limpar_o_despertador()
        self.logger.info("Envio %s: o plano do ChatGPT está no limite; o Envio espera", self.espera.job_id)
        self.espera.esperar(dict(PLANO_NO_LIMITE), self.esperas.do_plano)

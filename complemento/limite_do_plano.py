from .estado_do_envio import APAGADO, FIM, situacao
from .ia_dos_cartoes import TEXTO
from .modelo_dos_cartoes import CHAVE
from .paradas_do_envio import Apagado, Interrompido

LIMITE_DO_PLANO = "chatgpt_usage_limit"
PLANO_NO_LIMITE = {"reason": "plan_limit"}
ENVIO_TERMINOU = "job_finished"


def espera_pelo_plano(estado):
    return (estado.get("waiting") or {}).get("reason") == PLANO_NO_LIMITE["reason"]


def dizer_a_espera(fila, job_id, espera):
    if fila.estado(job_id).get("waiting") == espera:
        return

    def mudanca(estado):
        if espera:
            estado["waiting"] = espera
        else:
            estado.pop("waiting", None)

    fila.mudar(job_id, mudanca)


class EsperaDoEnvio:
    def __init__(self, fila, job_id, parar):
        self.fila, self.job_id, self.parar = fila, job_id, parar

    def pela_chave(self):
        return self.fila.estado(self.job_id).get("usingKey", False)

    def dizer(self, espera):
        dizer_a_espera(self.fila, self.job_id, espera)

    def limpar_o_despertador(self):
        self.fila.despertador.clear()

    def esperar(self, espera, segundos):
        if self.fila.estado(self.job_id).get("wiped"):
            raise Apagado()
        self.dizer(espera)
        self.fila.despertador.wait(segundos)
        if self.parar.is_set():
            raise Interrompido()
        if self.fila.estado(self.job_id).get("wiped"):
            raise Apagado()


def usar_a_chave(fila, ia, job_id):
    with fila.tranca:
        estado = fila.estado_ou_refazer(job_id)
        if situacao(estado) in FIM + (APAGADO,):
            return 409, {"error": ENVIO_TERMINOU}
        quem, motivo = ia.pagador(TEXTO, pela_chave=True)
        if quem != CHAVE:
            return 409, {"error": motivo}
        if not estado.get("usingKey"):
            estado = fila.mudar(job_id, lambda novo: novo.update(usingKey=True))
    fila.despertador.set()
    return 200, {"jobId": job_id, "status": estado["status"]}

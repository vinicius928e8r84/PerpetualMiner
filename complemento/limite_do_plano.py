"""O limite do plano do ChatGPT no Envio (#158): o Envio não falha, espera o plano e volta sozinho.

Quando o plano recusa o texto de um Cartão por limite de uso (`chatgpt_usage_limit`), os próximos falhariam igual, mas esperar não
perde nada: o estado do Envio segue `running` e diz `waiting: { reason: "plan_limit" }`, e a thread de trabalho pede o mesmo texto de
novo a cada `espera_do_plano` s (um pedido só). Quem conduz a espera é a porta presa ao Envio (`ia_do_envio.py`); aqui fica o lado do Envio
dela (`EsperaDoEnvio`) e a rota do Usar a minha chave. Quem acorda a espera antes: **Tentar de novo** (`POST /jobs/retry`), que só pede já;
**Usar a minha chave** (`POST /jobs/usar-a-chave`), que marca o Envio `usingKey` e faz o que falta pela chave; e o Apagar tudo ou
parar a Conexão, que a encerram. Um Cartão já no Anki, ou com o texto pago, nunca é pedido de novo.
"""

from .estado_do_envio import APAGADO, FIM, situacao
from .ia_dos_cartoes import TEXTO
from .modelo_dos_cartoes import CHAVE
from .paradas_do_envio import Apagado, Interrompido

LIMITE_DO_PLANO = "chatgpt_usage_limit"  # o mesmo de `engine/openai_http.LIMITE_DO_PLANO`
PLANO_NO_LIMITE = {"reason": "plan_limit"}
ENVIO_TERMINOU = "job_finished"


def espera_pelo_plano(estado):
    """O Envio espera o plano (o que o estado diz em `waiting`)?"""
    return (estado.get("waiting") or {}).get("reason") == PLANO_NO_LIMITE["reason"]


def dizer_a_espera(fila, job_id, espera):
    """O estado diz por que o Envio espera (`waiting`, que o painel lê: o plano, o teto, o Anki); só grava se mudou."""
    if fila.estado(job_id).get("waiting") == espera:
        return

    def mudanca(estado):
        if espera:
            estado["waiting"] = espera
        else:
            estado.pop("waiting", None)

    fila.mudar(job_id, mudanca)


class EsperaDoEnvio:
    """O lado do Envio das esperas que a porta conduz (`ia_do_envio.IaDoEnvio`: o teto do mês e o limite do plano), e o Usar a minha chave
    dele, lido do estado a cada vez. `parar` é o evento que para a Conexão."""

    def __init__(self, fila, job_id, parar):
        self.fila, self.job_id, self.parar = fila, job_id, parar

    def pela_chave(self):
        return self.fila.estado(self.job_id).get("usingKey", False)

    def dizer(self, espera):
        dizer_a_espera(self.fila, self.job_id, espera)

    def limpar_o_despertador(self):
        self.fila.despertador.clear()

    def esperar(self, espera, segundos):
        """O estado diz `espera` e a thread dorme até `segundos` ou até a acordarem. Levanta `Apagado` (as Frases foram apagadas, antes ou
        durante) e `Interrompido` (a Conexão para)."""
        if self.fila.estado(self.job_id).get("wiped"):
            raise Apagado()
        self.dizer(espera)
        self.fila.despertador.wait(segundos)
        if self.parar.is_set():
            raise Interrompido()
        if self.fila.estado(self.job_id).get("wiped"):
            raise Apagado()


def usar_a_chave(fila, ia, job_id):
    """`POST /jobs/usar-a-chave`: (status, resposta). O que falta do Envio passa a ir pela chave da OpenAI; repetido, nada é regravado.
    Se a chave não paga o texto (`ia.pagador`: sem chave guardada), 409 `openai_key_missing`; Envio que terminou (ou apagado), 409 `job_finished`."""
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

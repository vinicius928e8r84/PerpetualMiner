"""O limite do plano do ChatGPT no Envio (#158): o Envio não falha, espera o plano e volta sozinho.

Quando o plano recusa o texto de um Cartão por limite de uso (`chatgpt_usage_limit`), os próximos falhariam igual, mas esperar não
perde nada: o estado do Envio segue `running` e diz `waiting: { reason: "plan_limit" }`, e a thread de trabalho pede o mesmo texto de
novo a cada `espera_do_plano` s (um pedido só). Quem acorda a espera antes: **Tentar de novo** (`POST /jobs/retry`), que só pede já;
**Usar a minha chave** (`POST /jobs/usar-a-chave`), que marca o Envio `usingKey` e faz o que falta pela chave; e o Apagar tudo ou
parar a Conexão, que a encerram. Um Cartão já no Anki, ou com o texto pago, nunca é pedido de novo. Desenho: `docs/design/login-do-chatgpt.md`.
"""

from .paradas_do_envio import Apagado, Interrompido
from .teto_do_mes import PausaPeloTeto

LIMITE_DO_PLANO = "chatgpt_usage_limit"  # o mesmo de `engine/openai_http.LIMITE_DO_PLANO`
PLANO_NO_LIMITE = {"reason": "plan_limit"}
SEM_CHAVE = "openai_key_missing"
ENVIO_TERMINOU = "job_finished"
FIM = ("completed", "partial", "failed")


def espera_pelo_plano(estado):
    """O Envio espera o plano (o que o estado diz em `waiting`)?"""
    return (estado.get("waiting") or {}).get("reason") == PLANO_NO_LIMITE["reason"]


class LimiteDoPlano(PausaPeloTeto):
    """A parte do `Trabalho` que espera o plano e a que diz ao estado do Envio por que ele espera (e, de `PausaPeloTeto`, o teto do mês)."""

    def _dizer_a_espera(self, job_id, espera):
        """O estado diz por que o Envio espera (`waiting`, que o painel lê); só grava se mudou."""
        if self.fila.estado(job_id).get("waiting") == espera:
            return

        def mudanca(estado):
            if espera:
                estado["waiting"] = espera
            else:
                estado.pop("waiting", None)

        self.fila.mudar(job_id, mudanca)

    def _esperar_o_plano(self, job_id):
        """O plano está no limite: o estado diz que o Envio espera e a thread dorme até a próxima tentativa (ou até a acordarem)."""
        self.fila.despertador.clear()
        self.logger.info("Envio %s: o plano do ChatGPT está no limite; o Envio espera", job_id)
        self._dizer_a_espera(job_id, dict(PLANO_NO_LIMITE))
        self.fila.despertador.wait(self.espera_do_plano)
        if self.parar.is_set():
            raise Interrompido()
        if self.fila.estado(job_id).get("wiped"):
            raise Apagado()


def usar_a_chave(fila, cofre, job_id):
    """`POST /jobs/usar-a-chave`: (status, resposta). O que falta do Envio passa a ir pela chave da OpenAI; repetido, nada é regravado.
    Sem chave guardada, 409 `openai_key_missing`; Envio que terminou (ou apagado), 409 `job_finished`."""
    with fila.tranca:
        estado = fila.estado_ou_refazer(job_id)
        if estado["status"] in FIM or estado.get("wiped"):
            return 409, {"error": ENVIO_TERMINOU}
        if not cofre.ler("openai"):
            return 409, {"error": SEM_CHAVE}
        if not estado.get("usingKey"):
            estado = fila.mudar(job_id, lambda novo: novo.update(usingKey=True))
    fila.despertador.set()
    return 200, {"jobId": job_id, "status": estado["status"]}

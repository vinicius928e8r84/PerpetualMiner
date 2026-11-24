"""Quanto dura cada espera da Conexão e o que a corta. Existem para o teste não esperar."""

import threading
from dataclasses import dataclass, field

ESPERA_DO_CONTATO = 60.0


@dataclass(frozen=True)
class Esperas:
    """Os tempos, em segundos: `do_anki` (a pausa enquanto a coleção não responde), `da_openai` (uma por tentativa nova do que falhou por um motivo
    passageiro), `do_plano` (o limite do plano do ChatGPT), `do_teto` (a conferência do teto do mês), `do_contato` (o primeiro pedido de Envio da
    extensão antes de retomar), `do_envio` (entre um Envio e outro) e `da_parada` (a pausa da thread que sobe e para a Conexão).

    `parar` é o evento que corta as esperas do trabalho do Envio (levanta `Interrompido`) e `teto` é o `TetoDoMes` que a do teto confere (sem
    ele, nada pausa pelo teto)."""

    do_anki: float = 2.0
    da_openai: tuple = (2, 8, 30)
    do_plano: float = 300
    do_teto: float = 60
    do_contato: float = ESPERA_DO_CONTATO
    do_envio: float = 1.0
    da_parada: float = 0.1
    parar: threading.Event = field(default_factory=threading.Event)
    teto: object = None

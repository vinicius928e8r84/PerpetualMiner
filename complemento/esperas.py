import threading
from dataclasses import dataclass, field

ESPERA_DO_CONTATO = 60.0


@dataclass(frozen=True)
class Esperas:

    do_anki: float = 2.0
    da_openai: tuple = (2, 8, 30)
    do_plano: float = 300
    do_teto: float = 60
    do_contato: float = ESPERA_DO_CONTATO
    do_envio: float = 1.0
    da_parada: float = 0.1
    parar: threading.Event = field(default_factory=threading.Event)
    teto: object = None

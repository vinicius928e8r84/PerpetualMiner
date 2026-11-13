"""O estado gravado de um Envio (`estado/<jobId>.json`) como máquina de estados: a situação que o arquivo diz, a tabela das
transições e os eventos que mudam a situação. `Fila.mudar` (`envio.py`) é o portão: todo escritor passa por ele, e ele confere aqui.

    queued → running ⇄ esperando → completed | partial | failed → queued        (Tentar de novo)
    qualquer uma → apagado                                                      (Apagar tudo; do apagado não se sai)

O formato gravado não muda. `esperando` é `running` com `waiting` (o motivo: o plano, o teto do mês, o perfil do Anki), e
`apagado` é o Envio com `wiped`: o que andava vai a `failed` com `frases_apagadas`, e o que já tinha terminado fica com o fim que
teve. A etapa (`stage`) acompanha o status: `queued` na fila, o próprio fim no fim, e a etapa do Cartão enquanto roda (`queued`
logo depois de reservado, antes da primeira etapa).
"""

QUEUED, RUNNING, COMPLETED, PARTIAL, FAILED = "queued", "running", "completed", "partial", "failed"
FIM = (COMPLETED, PARTIAL, FAILED)
STATUS = (QUEUED, RUNNING) + FIM  # o que o campo `status` pode dizer
ESPERANDO, APAGADO = "esperando", "apagado"
FRASES_APAGADAS = "frases_apagadas"

TRANSICOES = {
    QUEUED: {RUNNING, APAGADO},
    RUNNING: {QUEUED, ESPERANDO, COMPLETED, PARTIAL, FAILED, APAGADO},
    ESPERANDO: {RUNNING, QUEUED, COMPLETED, PARTIAL, FAILED, APAGADO},
    COMPLETED: {QUEUED, APAGADO},
    PARTIAL: {QUEUED, APAGADO},
    FAILED: {QUEUED, APAGADO},
    APAGADO: set(),
}
# O que o apagado não deixa mudar. Os Cartões ficam de fora: o que já estava indo ao Anki ainda é dito.
_DO_APAGADO = ("status", "stage", "waiting", "wiped", "lastError", "progress")


class TransicaoInvalida(ValueError):
    """A mudança pedida não está na tabela, ou deixaria o status, a etapa e a espera dizendo coisas diferentes."""


def situacao(estado):
    """A situação que o estado gravado diz: uma só, da tabela."""
    if estado.get("wiped"):
        return APAGADO
    status = estado.get("status")
    return ESPERANDO if status == RUNNING and estado.get("waiting") else status


def coerente(estado):
    """O status, a etapa e a espera dizem a mesma coisa? Na fila e no fim a etapa é o status e nada espera; só o que roda tem etapa de Cartão."""
    status, etapa = estado.get("status"), estado.get("stage")
    if status == RUNNING:
        return etapa not in FIM and not estado.get("wiped")
    return status in STATUS and etapa == status and not estado.get("waiting") and not (estado.get("wiped") and status == QUEUED)


def terminou(estado):
    """O Envio chegou ao fim (ou foi apagado) e o arquivo o diz por inteiro: nada nele ainda anda."""
    return estado.get("status") in FIM and coerente(estado)


def retrato(estado):
    """O que o portão guarda de antes da mudança, para conferi-la depois."""
    return {campo: (dict(estado[campo]) if isinstance(estado[campo], dict) else estado[campo]) for campo in _DO_APAGADO if campo in estado}


def conferir(antes, estado):
    """Depois de uma mudança: do apagado nada sai (o que mudou volta ao que era); uma situação nova tem de estar na tabela; e o que
    mexeu no status, na etapa ou na espera tem de deixá-los coerentes. Levanta `TransicaoInvalida`."""
    de = situacao(antes)
    if de == APAGADO:
        for campo in _DO_APAGADO:
            estado.pop(campo, None)
        estado.update(antes)
        return
    para = situacao(estado)
    if para != de and para not in TRANSICOES.get(de, ()):
        raise TransicaoInvalida("Envio não pode ir de %s para %s" % (de, para))
    mexeu = any(antes.get(campo) != estado.get(campo) for campo in ("status", "stage", "waiting", "wiped"))
    if mexeu and not coerente(estado):
        raise TransicaoInvalida("Envio %s não pode ficar na etapa %s%s" % (estado.get("status"), estado.get("stage"), " esperando" if estado.get("waiting") else ""))


# -- os eventos: cada um deixa o status, a etapa e a espera coerentes --
def reservar(estado):
    """A thread de trabalho pegou o Envio da fila."""
    estado["status"] = RUNNING


def devolver_a_fila(estado):
    """A Conexão subiu com o Envio rodando: ele volta à fila e continua de onde parou."""
    estado.pop("waiting", None)
    estado.update(status=QUEUED, stage=QUEUED)


def repetir(estado):
    """Tentar de novo: do fim de volta à fila."""
    estado.update(status=QUEUED, stage=QUEUED, lastError=None, progress={})


def terminar(estado, status, **campos):
    """O fim do Envio: `completed`, `partial` ou `failed`, com o que mais o fim diz."""
    estado.pop("waiting", None)
    estado.update(campos, status=status, stage=status, progress={})


def apagar(estado):
    """O Apagar tudo: o que estava na fila ou rodando para em `failed`; o que já terminou fica com o fim que teve."""
    if estado.get("status") in (QUEUED, RUNNING):
        estado.pop("waiting", None)
        estado.update(status=FAILED, stage=FAILED, lastError=FRASES_APAGADAS, progress={})
    estado["wiped"] = True

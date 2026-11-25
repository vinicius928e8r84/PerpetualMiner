QUEUED, RUNNING, COMPLETED, PARTIAL, FAILED = "queued", "running", "completed", "partial", "failed"
FIM = (COMPLETED, PARTIAL, FAILED)
STATUS = (QUEUED, RUNNING) + FIM
ESPERANDO, APAGADO = "esperando", "apagado"
FRASES_APAGADAS = "frases_apagadas"
CARTOES_FALHARAM, SEM_PALAVRA = "cards_failed", "keyword_missing"

TRANSICOES = {
    QUEUED: {RUNNING, APAGADO},
    RUNNING: {QUEUED, ESPERANDO, COMPLETED, PARTIAL, FAILED, APAGADO},
    ESPERANDO: {RUNNING, QUEUED, COMPLETED, PARTIAL, FAILED, APAGADO},
    COMPLETED: {QUEUED, APAGADO},
    PARTIAL: {QUEUED, APAGADO},
    FAILED: {QUEUED, APAGADO},
    APAGADO: set(),
}
_DO_APAGADO = ("status", "stage", "waiting", "wiped", "lastError", "progress")


class TransicaoInvalida(ValueError):
    pass


def situacao(estado):
    if estado.get("wiped"):
        return APAGADO
    status = estado.get("status")
    return ESPERANDO if status == RUNNING and estado.get("waiting") else status


def coerente(estado):
    status, etapa = estado.get("status"), estado.get("stage")
    if status == RUNNING:
        return etapa not in FIM and not estado.get("wiped")
    return status in STATUS and etapa == status and not estado.get("waiting") and not (estado.get("wiped") and status == QUEUED)


def terminou(estado):
    return estado.get("status") in FIM and coerente(estado)


def retrato(estado):
    return {campo: (dict(estado[campo]) if isinstance(estado[campo], dict) else estado[campo]) for campo in _DO_APAGADO if campo in estado}


def conferir(antes, estado):
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


def reservar(estado):
    estado["status"] = RUNNING


def devolver_a_fila(estado):
    estado.pop("waiting", None)
    estado.update(status=QUEUED, stage=QUEUED)


def repetir(estado):
    estado.update(status=QUEUED, stage=QUEUED, lastError=None, progress={})


def terminar(estado, status, **campos):
    estado.pop("waiting", None)
    estado.update(campos, status=status, stage=status, progress={})


def apagar(estado):
    if estado.get("status") in (QUEUED, RUNNING):
        estado.pop("waiting", None)
        estado.update(status=FAILED, stage=FAILED, lastError=FRASES_APAGADAS, progress={})
    estado["wiped"] = True


def sem_cartao(pedido, falharam):
    entradas = pedido.get("entries", [])
    sem_palavra = {e.get("phraseId") for e in entradas if isinstance(e.get("line"), str) and e.get("keywords") == []}
    return SEM_PALAVRA if sem_palavra.intersection(falharam) else CARTOES_FALHARAM

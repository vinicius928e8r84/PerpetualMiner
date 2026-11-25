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
_CAMPOS_DA_SITUACAO = ("status", "stage", "waiting", "wiped")


class TransicaoInvalida(ValueError):
    pass


def situacao(estado):
    if estado.get("wiped"):
        return APAGADO
    status = estado.get("status")
    return ESPERANDO if status == RUNNING and estado.get("waiting") else status


def coerente(estado):
    if estado.get("status") == RUNNING:
        return estado.get("stage") not in FIM and not estado.get("wiped")
    return _etapa_e_o_status(estado) and not _espera_ou_apagado_na_fila(estado)


def _etapa_e_o_status(estado):
    status = estado.get("status")
    return status in STATUS and estado.get("stage") == status


def _espera_ou_apagado_na_fila(estado):
    if estado.get("waiting"):
        return True
    return bool(estado.get("wiped")) and estado.get("status") == QUEUED


def terminou(estado):
    return estado.get("status") in FIM and coerente(estado)


def retrato(estado):
    return {campo: (dict(estado[campo]) if isinstance(estado[campo], dict) else estado[campo]) for campo in _DO_APAGADO if campo in estado}


def conferir(antes, estado):
    de = situacao(antes)
    if de == APAGADO:
        _devolver_ao_apagado(antes, estado)
        return
    _exigir_transicao_da_tabela(de, situacao(estado))
    _exigir_estado_coerente(antes, estado)


def _devolver_ao_apagado(antes, estado):
    for campo in _DO_APAGADO:
        estado.pop(campo, None)
    estado.update(antes)


def _exigir_transicao_da_tabela(de, para):
    if para != de and para not in TRANSICOES.get(de, ()):
        raise TransicaoInvalida("Envio não pode ir de %s para %s" % (de, para))


def _mexeu_na_situacao(antes, estado):
    return any(antes.get(campo) != estado.get(campo) for campo in _CAMPOS_DA_SITUACAO)


def _exigir_estado_coerente(antes, estado):
    if _mexeu_na_situacao(antes, estado) and not coerente(estado):
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

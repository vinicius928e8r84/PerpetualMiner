import os
from datetime import datetime, timedelta

from .custos import ficha_do_envio
from .estado_do_envio import terminou
from .gravacao_de_json import apagar, gravar_json
from .pedido_do_envio import id_que_serve_de_caminho, id_valido

PRAZO_EM_DIAS = 30


def _instante(valor):
    try:
        quando = datetime.fromisoformat(valor)
    except (TypeError, ValueError):
        return None
    return quando if quando.tzinfo else quando.astimezone()


def _id_do_json(nome):
    return nome[:-5] if nome.endswith(".json") and id_valido(nome[:-5]) else None


def _e_arquivo_de_verdade(caminho):
    return os.path.isfile(caminho) and not os.path.islink(caminho)


def _json_soltos(pasta):
    if not os.path.isdir(pasta):
        return []
    soltos = []
    for nome in sorted(os.listdir(pasta)):
        job_id = _id_do_json(nome)
        if job_id is not None and _e_arquivo_de_verdade(os.path.join(pasta, nome)):
            soltos.append(job_id)
    return soltos


def _ids(fila):
    ids = [item.get("jobId") for item in fila.ordem() if isinstance(item, dict)]
    ids += _json_soltos(fila.dados.fila) + _json_soltos(fila.dados.estado)
    return [job_id for index, job_id in enumerate(ids) if id_que_serve_de_caminho(job_id) and job_id not in ids[:index]]


def _e_link(fila, job_id):
    pasta = os.path.realpath(fila.pasta_dos_textos(job_id))
    return os.path.normcase(pasta) != os.path.normcase(os.path.join(os.path.realpath(fila.dados.estado), job_id))


def _texto_pago(fila, job_id):
    pasta = fila.pasta_dos_textos(job_id)
    return os.path.isdir(pasta) and not _e_link(fila, job_id) and any(nome.endswith(".txt") for nome in os.listdir(pasta))


def venceu(fila, job_id, agora):
    estado = fila.estado(job_id)
    if not terminou(estado):
        return False
    ultima = _instante(estado.get("updatedAt"))
    if ultima is None or agora - ultima < timedelta(days=PRAZO_EM_DIAS):
        return False
    if fila.pedido(job_id) is None and fila.ficha(job_id) is None:
        return False
    return not _texto_pago(fila, job_id)


def _tirar_o_link(caminho):
    try:
        os.remove(caminho)
    except FileNotFoundError:
        pass
    except OSError:
        os.rmdir(caminho)


def _guardar_a_ficha(fila, job_id):
    pedido = fila.pedido(job_id)
    if pedido is not None:
        gravar_json(fila.arquivo_da_ficha(job_id), ficha_do_envio(fila.item_da_fila(job_id) or {}, pedido, fila.estado(job_id)))


def _e_o_item_do_envio(item, job_id):
    return isinstance(item, dict) and item.get("jobId") == job_id


def _tirar_da_fila(fila, job_id):
    ordem = fila.ordem()
    if any(_e_o_item_do_envio(item, job_id) for item in ordem):
        gravar_json(fila._arquivo_da_fila(), {"jobs": [item for item in ordem if not _e_o_item_do_envio(item, job_id)]})


def _esvaziar_e_tirar_a_pasta(pasta):
    for nome in sorted(os.listdir(pasta)):
        apagar(os.path.join(pasta, nome))
    os.rmdir(pasta)


def _apagar_a_pasta_dos_textos(fila, job_id):
    pasta = fila.pasta_dos_textos(job_id)
    if _e_link(fila, job_id):
        _tirar_o_link(pasta)
    elif os.path.isdir(pasta):
        _esvaziar_e_tirar_a_pasta(pasta)


def _apagar_o_envio(fila, job_id):
    _guardar_a_ficha(fila, job_id)
    _tirar_da_fila(fila, job_id)
    apagar(fila._arquivo_do_pedido(job_id))
    _apagar_a_pasta_dos_textos(fila, job_id)
    apagar(fila._arquivo_do_estado(job_id))


def reter(fila, agora=None):
    agora = agora or datetime.now().astimezone()
    apagados = []
    try:
        with fila.tranca:
            candidatos = _ids(fila)
    except Exception as erro:
        _registrar(fila, "warning", "a rodada não leu a fila (%s)", type(erro).__name__)
        return apagados
    for job_id in candidatos:
        try:
            with fila.tranca:
                if not venceu(fila, job_id, agora):
                    continue
                _apagar_o_envio(fila, job_id)
            apagados.append(job_id)
            _registrar(fila, "info", "Envio %s: apagado pela retenção (terminado há %d dias ou mais); os custos ficam", job_id, PRAZO_EM_DIAS)
        except Exception as erro:
            _registrar(fila, "warning", "Envio %s: a retenção não conseguiu apagar (%s); tenta de novo na próxima rodada", job_id, type(erro).__name__)
    return apagados


def _registrar(fila, nivel, mensagem, *argumentos):
    if fila.logger:
        getattr(fila.logger, nivel)("Retenção: " + mensagem, *argumentos)

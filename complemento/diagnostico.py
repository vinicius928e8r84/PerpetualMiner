"""O pacote de diagnóstico de um Envio (`POST /jobs/debug-bundle`): o que a pessoa baixa em Custos › Avançado."""

import os

from . import custos
from .envio import agora_utc, visao_do_pedido


def pacote_de_diagnostico(fila, job_id, versao, caminho_do_log):
    """O pacote de diagnóstico de um Envio: o pedido (sem as linhas das Frases), o estado, os custos, os arquivos dele e as linhas do log que o citam.

    Nada da pasta `chaves` entra, e nem o log nem os custos nem o estado têm a chave, a Palavra ou a Frase."""
    arquivos = []
    for pasta in (fila.pasta_dos_textos(job_id), fila.pasta_dos_custos(job_id)):
        for raiz, _, nomes in os.walk(pasta):
            for nome in sorted(nomes):
                arquivos.append({"path": os.path.relpath(os.path.join(raiz, nome), fila.dados.raiz).replace(os.sep, "/")})
    linhas = []
    try:
        with open(caminho_do_log, encoding="utf-8", errors="replace") as log:
            linhas = [linha.rstrip("\n") for linha in log if job_id in linha][-200:]
    except OSError:
        pass
    registros = fila.registros_de_custo(job_id)
    pedido = visao_do_pedido(fila.pedido(job_id))
    pedido["entries"] = [{chave: valor for chave, valor in entrada.items() if chave != "line"} for entrada in pedido.get("entries", [])]
    return {
        "generatedAt": agora_utc(),
        "jobId": job_id,
        "versao": versao,
        "job": pedido,
        "state": fila.estado(job_id),
        "queueItem": fila.item_da_fila(job_id),
        "costs": registros,
        "costSummary": custos.resumir(registros, custos.dia(pedido.get("createdAt")), None, None),
        "artifacts": sorted(arquivos, key=lambda a: a["path"]),
        "logTail": linhas,
    }

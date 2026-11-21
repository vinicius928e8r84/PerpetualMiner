"""O pacote de diagnóstico de um Envio (`POST /jobs/debug-bundle`): o que a pessoa baixa em Custos › Avançado."""

import os
from datetime import datetime, timezone

from . import custos
from .envio import visao_do_pedido


def agora_utc():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _arquivos_do_envio(fila, job_id):
    """Os arquivos das pastas de textos e de custos do Envio, pelo caminho a partir da pasta de dados."""
    arquivos = []
    for pasta in (fila.pasta_dos_textos(job_id), fila.pasta_dos_custos(job_id)):
        for raiz, _, nomes in os.walk(pasta):
            for nome in sorted(nomes):
                arquivos.append({"path": os.path.relpath(os.path.join(raiz, nome), fila.dados.raiz).replace(os.sep, "/")})
    return sorted(arquivos, key=lambda a: a["path"])


def _linhas_do_log(caminho_do_log, job_id):
    """As últimas 200 linhas do log que citam o Envio; nenhuma se o log não abre."""
    try:
        with open(caminho_do_log, encoding="utf-8", errors="replace") as log:
            return [linha.rstrip("\n") for linha in log if job_id in linha][-200:]
    except OSError:
        return []


def _pedido_sem_as_linhas(fila, job_id):
    pedido = visao_do_pedido(fila.pedido(job_id))
    pedido["entries"] = [{chave: valor for chave, valor in entrada.items() if chave not in ("line", "keywords")} for entrada in pedido.get("entries", [])]
    return pedido


def pacote_de_diagnostico(fila, job_id, versao, caminho_do_log):
    """O pacote de diagnóstico de um Envio: o pedido (sem as linhas das Frases), o estado, os custos, os arquivos dele e as linhas do log que o citam.

    Nada da pasta `chaves` entra (a chave e o login do ChatGPT), e o log, os custos e o estado não têm a chave, a Palavra nem a Frase."""
    arquivos = _arquivos_do_envio(fila, job_id)
    linhas = _linhas_do_log(caminho_do_log, job_id)
    registros = fila.registros_de_custo(job_id)
    pedido = _pedido_sem_as_linhas(fila, job_id)
    return {
        "generatedAt": agora_utc(),
        "jobId": job_id,
        "versao": versao,
        "job": pedido,
        "state": fila.estado(job_id),
        "queueItem": fila.item_da_fila(job_id),
        "costs": registros,
        "costSummary": custos.resumir(registros, custos.dia(pedido.get("createdAt")), None, None),
        "artifacts": arquivos,
        "logTail": linhas,
    }

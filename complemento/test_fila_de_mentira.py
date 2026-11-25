import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import envio


def _abrir_para_gravar(caminho):
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    return open(caminho, "w", encoding="utf-8")


def _gravar_json(caminho, dados):
    with _abrir_para_gravar(caminho) as arquivo:
        json.dump(dados, arquivo, ensure_ascii=False, indent=2)


def _pedido_como_a_fila_guarda(job):
    sem_hora = {chave: valor for chave, valor in job.items() if chave != "createdAt"}
    return dict(job, corpoSha256=envio.impressao(sem_hora))


def _semear_o_envio(pasta, envio_):
    job, estado = envio_["job"], envio_["state"]
    job_id = job["jobId"]
    _gravar_json(os.path.join(pasta, "fila", job_id + ".json"), _pedido_como_a_fila_guarda(job))
    _gravar_json(os.path.join(pasta, "estado", job_id + ".json"), estado)
    for stem, texto in (envio_.get("textos") or {}).items():
        with _abrir_para_gravar(os.path.join(pasta, "estado", job_id, stem + ".txt")) as arquivo:
            arquivo.write(texto)
    if envio_.get("custos"):
        with _abrir_para_gravar(os.path.join(pasta, "custos", job_id, "costs.jsonl")) as arquivo:
            arquivo.writelines(json.dumps(registro, ensure_ascii=False) + "\n" for registro in envio_["custos"])
    return {"jobId": job_id, "lang": job["lang"], "createdAt": job["createdAt"]}


def semear_a_fila(pasta, fila):
    ordem = [_semear_o_envio(pasta, envio_) for envio_ in fila]
    _gravar_json(os.path.join(pasta, "fila", "fila.json"), {"jobs": ordem})

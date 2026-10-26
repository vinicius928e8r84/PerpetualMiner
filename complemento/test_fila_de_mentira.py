"""A pasta de dados que a Conexão deixa com Envios já feitos, para os testes semearem antes de ela subir.

Não é um teste: é o que os testes do Envio e dos exemplos do contrato põem na pasta (`test_servidor.semear_a_fila` o reexporta).
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import envio  # noqa: E402


def semear_a_fila(pasta, fila):
    """Os Envios que a Conexão já tinha (`filas` do contrato): os arquivos de `envio.py`, como a Conexão os deixa.

    Cada Envio é `{ job, state, custos, textos? }` (`textos`: `{ stem: texto }` já pagos)."""
    ordem = []
    for envio_ in fila:
        job, estado = envio_["job"], envio_["state"]
        job_id = job["jobId"]
        sem_hora = {chave: valor for chave, valor in job.items() if chave != "createdAt"}
        pedido = dict(job, corpoSha256=envio.impressao(sem_hora))
        for nome, dados in ((os.path.join("fila", job_id + ".json"), pedido), (os.path.join("estado", job_id + ".json"), estado)):
            os.makedirs(os.path.dirname(os.path.join(pasta, nome)), exist_ok=True)
            with open(os.path.join(pasta, nome), "w", encoding="utf-8") as arquivo:
                json.dump(dados, arquivo, ensure_ascii=False, indent=2)
        for stem, texto in (envio_.get("textos") or {}).items():
            os.makedirs(os.path.join(pasta, "estado", job_id), exist_ok=True)
            with open(os.path.join(pasta, "estado", job_id, stem + ".txt"), "w", encoding="utf-8") as arquivo:
                arquivo.write(texto)
        if envio_.get("custos"):
            os.makedirs(os.path.join(pasta, "custos", job_id), exist_ok=True)
            with open(os.path.join(pasta, "custos", job_id, "costs.jsonl"), "w", encoding="utf-8") as arquivo:
                arquivo.writelines(json.dumps(registro, ensure_ascii=False) + "\n" for registro in envio_["custos"])
        ordem.append({"jobId": job_id, "lang": job["lang"], "createdAt": job["createdAt"]})
    os.makedirs(os.path.join(pasta, "fila"), exist_ok=True)
    with open(os.path.join(pasta, "fila", "fila.json"), "w", encoding="utf-8") as arquivo:
        json.dump({"jobs": ordem}, arquivo, ensure_ascii=False, indent=2)

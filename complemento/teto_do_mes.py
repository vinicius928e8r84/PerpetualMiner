import json
import math
import os
from datetime import date, datetime, timedelta

from . import custos

TETO_PADRAO = 10.0
TETO_MAXIMO = 1_000_000.0
NO_TETO = {"reason": "monthly_cap"}


def _e_um_numero(valor):
    return isinstance(valor, (int, float)) and not isinstance(valor, bool)


def _valor_do_teto(valor):
    if not _e_um_numero(valor) or not math.isfinite(valor):
        return None
    teto = round(float(valor), 2)
    return teto if 0 < teto <= TETO_MAXIMO else None


class TetoDoMes:
    def __init__(self, arquivo, fila, hoje=date.today):
        self.arquivo, self.fila, self.hoje = arquivo, fila, hoje

    def limite(self):
        try:
            with open(self.arquivo, encoding="utf-8") as lido:
                return _valor_do_teto(json.load(lido).get("limitUsd")) or TETO_PADRAO
        except (OSError, ValueError, AttributeError):
            return TETO_PADRAO

    def definir(self, valor):
        teto = _valor_do_teto(valor)
        if teto is None:
            return None
        if teto != self.limite() or not os.path.exists(self.arquivo):
            provisorio = self.arquivo + ".novo"
            with open(provisorio, "w", encoding="utf-8") as arquivo:
                json.dump({"limitUsd": teto}, arquivo)
            os.replace(provisorio, self.arquivo)
        self.fila.despertador.set()
        return teto

    def gasto(self):
        hoje = self.hoje()
        primeiro = hoje.replace(day=1)
        seguinte = date(primeiro.year + primeiro.month // 12, primeiro.month % 12 + 1, 1)
        desde = datetime(primeiro.year, primeiro.month, 1).timestamp()
        total = 0.0
        with self.fila.tranca:
            for item in self.fila.envios_dos_custos():
                arquivo = os.path.join(self.fila.pasta_dos_custos(item["jobId"]), "costs.jsonl")
                try:
                    if os.path.getmtime(arquivo) < desde:
                        continue
                except OSError:
                    continue
                registros = self.fila.registros_de_custo(item["jobId"])
                total += custos.resumir(registros, custos.dia(item.get("createdAt")), primeiro, seguinte - timedelta(days=1))["costs"]["totalUsd"]
        return round(total, 6)

    def estado(self):
        hoje = self.hoje()
        return {"limitUsd": self.limite(), "spentUsd": self.gasto(), "month": "%04d-%02d" % (hoje.year, hoje.month)}

    def chegou(self):
        return self.gasto() >= self.limite()

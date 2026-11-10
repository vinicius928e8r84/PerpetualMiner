"""O teto do mês (#160): quanto da chave a pessoa deixa gastar por mês, neste computador. Vem ligado com US$ 10.

O gasto é o da chave no mês do computador (`custos.resumir`: o texto, o juiz e a triagem da imagem, a imagem gerada e a voz paga; o
Cartão que o plano do ChatGPT fez custa 0, e a imagem gerada que ele pediu à chave conta). Chegando no teto, o Envio **pausa antes do
próximo Cartão**: o estado segue `running` e diz `waiting: { reason: "monthly_cap" }`, nada novo é pedido à OpenAI, e a thread de
trabalho confere de novo a cada `espera_do_teto` s. Quem acorda a espera antes é subir o teto (`POST /custos/teto/definir`); o mês
virando zera a conta sozinho. O teto fica em `user_files/teto-do-mes.json` (`{ "limitUsd" }`; sem o arquivo vale o padrão).
Desenho: `docs/design/teto-do-mes.md`.
"""

import json
import math
import os
from datetime import date, datetime, timedelta

from . import custos
from .paradas_do_envio import Apagado, Interrompido

TETO_PADRAO = 10.0
TETO_MAXIMO = 1_000_000.0
NO_TETO = {"reason": "monthly_cap"}


def espera_pelo_teto(estado):
    """O Envio espera o teto do mês (o que o estado diz em `waiting`)?"""
    return (estado.get("waiting") or {}).get("reason") == NO_TETO["reason"]


def _valor_do_teto(valor):
    """O teto em dólares com dois decimais, ou None se não é um número positivo que sirva (`bool` não é número aqui)."""
    if isinstance(valor, bool) or not isinstance(valor, (int, float)) or not math.isfinite(valor):
        return None
    teto = round(float(valor), 2)
    return teto if 0 < teto <= TETO_MAXIMO else None


class TetoDoMes:
    """O teto e o gasto do mês. O teto é lido do arquivo a cada vez (a Conexão é a única dona dele); o gasto, dos custos de cada Envio."""

    def __init__(self, arquivo, fila, hoje=date.today):
        self.arquivo, self.fila, self.hoje = arquivo, fila, hoje

    def limite(self):
        try:
            with open(self.arquivo, encoding="utf-8") as lido:
                return _valor_do_teto(json.load(lido).get("limitUsd")) or TETO_PADRAO
        except (OSError, ValueError, AttributeError):
            return TETO_PADRAO

    def definir(self, valor):
        """Guarda o teto novo (o que não muda não é regravado) e acorda o Envio que espera; None se o valor não serve."""
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
        """O que a chave gastou neste mês, em dólares, somando os custos de todos os Envios."""
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
                        continue  # nada foi anotado neste arquivo desde o começo do mês
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


class PausaPeloTeto:
    """A parte do `Trabalho` que pausa o Envio no teto do mês. Pede `self.fila`, `self.parar` e `_dizer_a_espera`; `teto` e `espera_do_teto`
    a Conexão põe depois de montar o `Trabalho` (sem `teto`, nada pausa)."""

    teto = None
    espera_do_teto = 60

    def _conferir_o_teto(self, job_id):
        """Antes de gastar a chave com um Cartão: no teto, o estado diz que o Envio espera e a thread dorme até o teto subir ou o mês virar."""
        if self.teto is None:
            return
        pausou = False
        while True:
            self.fila.despertador.clear()
            if not self.teto.chegou():
                break
            if not pausou:
                pausou = True
                self.logger.info("Envio %s: o gasto do mês chegou no teto; o Envio espera", job_id)
            self._dizer_a_espera(job_id, dict(NO_TETO))
            self.fila.despertador.wait(self.espera_do_teto)
            if self.parar.is_set():
                raise Interrompido()
            if self.fila.estado(job_id).get("wiped"):
                raise Apagado()
        if pausou:
            self._dizer_a_espera(job_id, None)
            self.logger.info("Envio %s: o teto do mês deixou de valer; o Envio continua", job_id)

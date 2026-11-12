"""Os Envios de que os custos falam (#243): a fila e os que a retenção apagou (`retencao_dos_envios.py`), cada um com a `ficha` que ela deixou
em `custos/<jobId>/ficha.json`. A mistura de `envio.Fila`; quem soma custos (a aba Custos, o teto do mês) olha `envios_dos_custos`, nunca só a fila."""

import json
import os

from . import custos
from .pedido_do_envio import id_que_serve_de_caminho


class EnviosDosCustos:
    def arquivo_da_ficha(self, job_id):
        return os.path.join(self.pasta_dos_custos(job_id), custos.ARQUIVO_DA_FICHA)

    def ficha(self, job_id):
        """A ficha que a retenção deixou do Envio, ou None (não há, não se lê ou não tem os campos)."""
        if not id_que_serve_de_caminho(job_id):
            return None
        try:
            with self.tranca, open(self.arquivo_da_ficha(job_id), encoding="utf-8") as arquivo:
                ficha = json.load(arquivo)
        except (OSError, ValueError):
            return None
        return ficha if custos.ficha_valida(ficha) else None

    def envios_dos_custos(self):
        """Os itens da fila, na ordem, e depois os Envios que só têm a ficha (cada um com a `ficha`)."""
        with self.tranca:
            itens = list(self.ordem())
            na_fila = {item.get("jobId") for item in itens}
            pasta = self.dados.custos
            for nome in sorted(os.listdir(pasta)) if os.path.isdir(pasta) else []:
                ficha = self.ficha(nome) if nome not in na_fila else None
                if ficha:
                    itens.append({"jobId": nome, "lang": ficha["lang"], "createdAt": ficha["createdAt"], "ficha": ficha})
            return itens

    def listar(self):
        """`POST /jobs/list`: cada Envio da fila, na ordem, com o `status` do estado; depois, os que a retenção apagou e que enviaram Frases,
        só com os ids delas (`ficha.successfulPhraseIds`): quem volta depois do prazo as marca como enviadas, sem pagar de novo (#372)."""
        with self.tranca:
            lista = []
            for item in self.ordem():
                estado = self.estado(item["jobId"])
                lista.append(dict(
                    item, status=estado.get("status", "queued"), updatedAt=estado.get("updatedAt", item.get("createdAt")), state=estado))
            na_fila = {item["jobId"] for item in lista}
            for item in self.envios_dos_custos():
                ficha = item.get("ficha")
                ids = ficha.get("successfulPhraseIds") if ficha else None
                if item["jobId"] in na_fila or not isinstance(ids, list) or not ids:
                    continue
                # Sempre `completed`: um `partial` ofereceria Tentar de novo (ENV-03), e o /jobs/retry de um Envio apagado dá 404.
                estado = {"jobId": item["jobId"], "status": "completed", "stage": "completed", "updatedAt": ficha["updatedAt"],
                          "successfulPhraseIds": ids, "failedPhraseIds": [], "duplicatePhraseIds": ficha.get("duplicatePhraseIds") or []}
                lista.append({"jobId": item["jobId"], "lang": ficha["lang"], "createdAt": ficha["createdAt"], "status": "completed",
                              "updatedAt": ficha["updatedAt"], "state": estado})
            return lista

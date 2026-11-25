import json
import os

from . import custos
from .pedido_do_envio import id_que_serve_de_caminho


class EnviosDosCustos:
    def arquivo_da_ficha(self, job_id):
        return os.path.join(self.pasta_dos_custos(job_id), custos.ARQUIVO_DA_FICHA)

    def ficha(self, job_id):
        if not id_que_serve_de_caminho(job_id):
            return None
        try:
            with self.tranca, open(self.arquivo_da_ficha(job_id), encoding="utf-8") as arquivo:
                ficha = json.load(arquivo)
        except (OSError, ValueError):
            return None
        return ficha if custos.ficha_valida(ficha) else None

    def envios_dos_custos(self):
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
        with self.tranca:
            lista = [self._com_o_status(item) for item in self.ordem()]
            na_fila = {item["jobId"] for item in lista}
            for item in self.envios_dos_custos():
                ids = self._frases_que_enviou(item)
                if item["jobId"] in na_fila or not ids:
                    continue
                lista.append(self._apagado_que_enviou(item, ids))
            return lista

    def _com_o_status(self, item):
        estado = self.estado(item["jobId"])
        return dict(item, status=estado.get("status", "queued"), updatedAt=estado.get("updatedAt", item.get("createdAt")), state=estado)

    @staticmethod
    def _frases_que_enviou(item):
        ficha = item.get("ficha")
        ids = ficha.get("successfulPhraseIds") if ficha else None
        return ids if isinstance(ids, list) else []

    @staticmethod
    def _apagado_que_enviou(item, ids):
        ficha = item["ficha"]
        estado = {"jobId": item["jobId"], "status": "completed", "stage": "completed", "updatedAt": ficha["updatedAt"],
                  "successfulPhraseIds": ids, "failedPhraseIds": [], "duplicatePhraseIds": ficha.get("duplicatePhraseIds") or []}
        return {"jobId": item["jobId"], "lang": ficha["lang"], "createdAt": ficha["createdAt"], "status": "completed",
                "updatedAt": ficha["updatedAt"], "state": estado}

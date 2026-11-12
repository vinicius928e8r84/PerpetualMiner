"""A Conexão de hoje (`bridge/`) de mentira dos testes da passagem (#178): a pasta do projeto dela e um servidor local que responde o
`GET /health` como ela responde, na porta que o teste escolher.

Não é um teste: é o que a passagem encontra no lugar da Conexão de hoje do dono. Só tem o que a passagem lê (`bridge/config.json`,
`engine/.env`, `engine/prompts`, a fila `queue.json` e os Envios com `job.json`, `state.json` e `log/costs.jsonl`). Nada da Conexão
nem do Windows de verdade: o pid é inventado e `parar()` só fecha o servidor daqui.
"""

import hashlib
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PID = 424242
CRIADO = "2026-10-01T10:00:00-03:00"


def _gravar(caminho, texto):
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    with open(caminho, "w", encoding="utf-8", newline="") as arquivo:
        arquivo.write(texto)


class ConexaoAntigaDeMentira:
    def __init__(self, pasta, perfil="Ingles - Ana", chave="sk-proj-chave-do-dono-0001", prompts=None):
        self.raiz = os.path.join(pasta, "projeto")
        self.motor = os.path.join(self.raiz, "engine")
        self.jobs = os.path.join(self.raiz, "bridge", "runtime", "jobs")
        self.fila = os.path.join(self.raiz, "bridge", "runtime", "queue.json")
        _gravar(os.path.join(self.raiz, "bridge", "config.json"), json.dumps({
            "anki_profile": perfil, "anki_executable": "C:\\Anki\\anki.exe", "port": 8766, "anki_wait_timeout_sec": 90}))
        if chave:
            _gravar(os.path.join(self.motor, ".env"), "# a chave do dono\nOPENAI_API_KEY=%s\n" % chave)
        for nome, texto in (prompts or {}).items():
            _gravar(os.path.join(self.motor, "prompts", nome), texto)
        _gravar(self.fila, json.dumps({"jobs": []}))
        self.servidor = None

    # -- os Envios de hoje --
    def envio(self, id_, status, frases, *, lang="en", baralho="Inglês", prontas=(), falharam=(), custos=(), criado=CRIADO):
        """`frases`: [(phraseId, linha)]. `prontas`/`falharam`: os phraseId que o estado de hoje diz já enviados/falhados."""
        _gravar(os.path.join(self.jobs, id_, "job.json"), json.dumps({
            "jobId": id_, "createdAt": criado, "lang": lang, "deckName": baralho, "imageSource": "1",
            "tts": {"wordTld": "com", "phraseTld": "co.uk"}, "status": status,
            "entries": [{"phraseId": numero, "line": linha} for numero, linha in frases]}, ensure_ascii=False))
        self.estado(id_, status, prontas, falharam)
        if custos:
            _gravar(os.path.join(self.jobs, id_, "log", "costs.jsonl"), "".join(json.dumps(c, ensure_ascii=False) + "\n" for c in custos))
        fila = self._fila()
        fila["jobs"] = [item for item in fila["jobs"] if item["jobId"] != id_] + [{"jobId": id_, "lang": lang, "status": status, "createdAt": criado}]
        _gravar(self.fila, json.dumps(fila))

    def estado(self, id_, status, prontas=(), falharam=()):
        _gravar(os.path.join(self.jobs, id_, "state.json"), json.dumps({
            "jobId": id_, "status": status, "stage": status, "completedStages": [], "successfulPhraseIds": list(prontas),
            "failedPhraseIds": list(falharam), "lastError": "texto livre do erro de hoje", "updatedAt": CRIADO}))
        fila = self._fila()
        for item in fila["jobs"]:
            if item["jobId"] == id_:
                item["status"] = status
        _gravar(self.fila, json.dumps(fila))

    def _fila(self):
        with open(self.fila, encoding="utf-8") as arquivo:
            return json.load(arquivo)

    def terminar(self, id_, prontas=()):
        self.estado(id_, "completed", prontas)

    def fotografia(self):
        """Cada arquivo da pasta do projeto com o hash do conteúdo: a origem de antes e de depois tem de ser a mesma."""
        achados = {}
        for pasta, _, nomes in os.walk(self.raiz):
            for nome in nomes:
                caminho = os.path.join(pasta, nome)
                with open(caminho, "rb") as arquivo:
                    achados[os.path.relpath(caminho, self.raiz)] = hashlib.sha256(arquivo.read()).hexdigest()
        return achados

    # -- o servidor --
    def saude(self):
        return {"ok": True, "bridge": "running", "jobs": 0, "activeJobId": None, "automaticAnkiPath": self.motor,
                "runtime": {"pid": PID, "startedAt": CRIADO, "root": self.raiz, "jobsRoot": self.jobs, "queueFile": self.fila}}

    def __enter__(self):
        dono = self

        class Atendente(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_GET(self):
                corpo = json.dumps(dono.saude()).encode("utf-8") if self.path == "/health" else b"{}"
                self.send_response(200 if self.path == "/health" else 404)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(corpo)))
                self.end_headers()
                self.wfile.write(corpo)

        self.servidor = ThreadingHTTPServer(("127.0.0.1", 0), Atendente)
        self.servidor.daemon_threads = True
        self.porta = self.servidor.server_address[1]
        threading.Thread(target=self.servidor.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True).start()
        return self

    def parar(self):
        """O processo de hoje encerrado: o servidor fecha e a porta fica livre."""
        if self.servidor is not None:
            self.servidor.shutdown()
            self.servidor.server_close()
            self.servidor = None

    def __exit__(self, *erro):
        self.parar()

    @property
    def no_ar(self):
        return self.servidor is not None

import copy
import functools
import json
import os
import threading
from datetime import datetime

from . import custos, estado_do_envio
from .envios_dos_custos import EnviosDosCustos
from .estado_do_envio import APAGADO, FAILED, FIM, QUEUED, RUNNING, STATUS, situacao
from .gravacao_de_json import apagar as _apagar, apagar_os_provisorios, gravar_json as _gravar_json, limpar_ao_subir
from .limite_do_plano import espera_pelo_plano
from .palavras_do_cartao import com_as_palavras_fixas, esquecer, quantos_cartoes
from .pedido_do_envio import id_que_serve_de_caminho, id_valido, impressao, validar_pedido

PENDENTE, TEXTO, ADICIONADO, DUPLICADO, FALHOU = "pending", "text", "added", "duplicate", "failed"
NO_ANKI = (ADICIONADO, DUPLICADO)


def agora_local():
    return datetime.now().astimezone().isoformat(timespec="seconds")


def id_do_cartao(phrase_id, posicao):
    return "%d-%d" % (phrase_id, posicao)


def _ler_json(caminho, padrao):
    try:
        with open(caminho, encoding="utf-8") as arquivo:
            return json.load(arquivo)
    except (OSError, ValueError):
        return copy.deepcopy(padrao)


def _os_cartoes_da_frase(estado, cartao_id):
    cartoes = estado.get("cards", {})
    frase = cartoes.get(cartao_id, {}).get("phraseId")
    return frase, {c: v["status"] for c, v in cartoes.items() if v["phraseId"] == frase}


def frase_inteira_no_anki(status_dos_cartoes):
    return bool(status_dos_cartoes) and all(status in NO_ANKI for status in status_dos_cartoes)


def _ainda_tem_a_frase(pedido):
    return any("line" in entrada or "keywords" in entrada for entrada in pedido.get("entries", [])) or not pedido.get("wiped")


def _estado_por_apagar(estado):
    if estado.get("status") not in STATUS:
        return False
    return not estado.get("wiped") or any(cartao["status"] == TEXTO for cartao in estado["cards"].values())


def _apagar_o_estado(estado):
    for cartao in estado["cards"].values():
        if cartao["status"] == TEXTO:
            cartao["status"] = PENDENTE
    estado_do_envio.apagar(estado)


class Fila(EnviosDosCustos):
    def __init__(self, dados, motor, logger=None):
        self.dados = dados
        self.motor = motor
        self.logger = logger
        self.tranca = threading.RLock()
        self.mudou = threading.Event()
        self.despertador = threading.Event()

    def _arquivo_da_fila(self):
        return os.path.join(self.dados.fila, "fila.json")

    def _arquivo_do_pedido(self, job_id):
        return os.path.join(self.dados.fila, job_id + ".json")

    def _arquivo_do_estado(self, job_id):
        return os.path.join(self.dados.estado, job_id + ".json")

    def pasta_dos_textos(self, job_id):
        return os.path.join(self.dados.estado, job_id)

    def arquivo_do_texto(self, job_id, cartao):
        return os.path.join(self.pasta_dos_textos(job_id), cartao + ".txt")

    def pasta_dos_custos(self, job_id):
        return os.path.join(self.dados.custos, job_id)

    def ordem(self):
        with self.tranca:
            return _ler_json(self._arquivo_da_fila(), {"jobs": []}).get("jobs", [])

    def pedido(self, job_id):
        if not id_que_serve_de_caminho(job_id):
            return None
        with self.tranca:
            return _ler_json(self._arquivo_do_pedido(job_id), None)

    def estado(self, job_id):
        with self.tranca:
            return _ler_json(self._arquivo_do_estado(job_id), {})

    def item_da_fila(self, job_id):
        return next((item for item in self.ordem() if item.get("jobId") == job_id), None)

    def registros_de_custo(self, job_id):
        with self.tranca:
            return custos.registros(self.pasta_dos_custos(job_id))

    def linha_do_cartao(self, job_id, phrase_id):
        pedido = self.pedido(job_id) or {}
        return next((e.get("line") for e in pedido.get("entries", []) if e.get("phraseId") == phrase_id), None)

    def _gravar_estado(self, job_id, estado):
        estado["updatedAt"] = agora_local()
        _gravar_json(self._arquivo_do_estado(job_id), estado)

    def _entrar_na_fila(self, pedido):
        ordem = self.ordem()
        ordem.append({"jobId": pedido["jobId"], "lang": pedido["lang"], "createdAt": pedido["createdAt"]})
        _gravar_json(self._arquivo_da_fila(), {"jobs": ordem})

    def _estado_do_pedido(self, pedido):
        cartoes = {}
        for entrada in pedido["entries"]:
            cartoes.update(self._cartoes_da_entrada(pedido, entrada))
        apagado = bool(pedido.get("wiped"))
        estado = {
            "jobId": pedido["jobId"], "status": FAILED if apagado else QUEUED, "stage": FAILED if apagado else QUEUED,
            "completedStages": [], "progress": {}, "successfulPhraseIds": [], "failedPhraseIds": [], "duplicatePhraseIds": [],
            "lastError": estado_do_envio.FRASES_APAGADAS if apagado else None, "updatedAt": pedido["createdAt"], "cards": cartoes,
        }
        if apagado:
            estado["wiped"] = True
        return estado

    def _cartoes_da_entrada(self, pedido, entrada):
        if entrada.get("noAnki"):
            return {cartao: {"phraseId": entrada["phraseId"], "status": status, "error": None} for cartao, status in entrada["noAnki"].items()}
        if not isinstance(entrada.get("line"), str):
            return {}
        return {id_do_cartao(entrada["phraseId"], posicao): {"phraseId": entrada["phraseId"], "status": PENDENTE, "error": None}
                for posicao in range(quantos_cartoes(self.motor, pedido["lang"], entrada))}

    def estado_ou_refazer(self, job_id):
        with self.tranca:
            estado = self.estado(job_id)
            if estado.get("status") in STATUS and isinstance(estado.get("cards"), dict):
                return estado
            pedido = self.pedido(job_id)
            if pedido is None:
                return None
            estado = self._estado_do_pedido(pedido)
            _gravar_json(self._arquivo_do_estado(job_id), estado)
            if self.logger:
                self.logger.info("Envio %s: o estado faltava e foi refeito do pedido", job_id)
            return estado

    def criar(self, corpo):
        pedido, recusa = validar_pedido(corpo)
        if recusa:
            return recusa[0], {"error": recusa[1]}
        job_id, marca = pedido["jobId"], impressao(pedido)
        with self.tranca:
            existente = self.pedido(job_id)
            if existente is not None:
                if existente.get("corpoSha256") != marca:
                    return 409, {"error": "job_conflict"}
                estado = self.estado_ou_refazer(job_id)
                if self.item_da_fila(job_id) is None:
                    self._entrar_na_fila(existente)
                    self.mudou.set()
                return 201, {"jobId": job_id, "status": estado["status"]}
            criado_em = agora_local()
            gravado = dict(pedido, createdAt=criado_em, corpoSha256=marca)
            gravado["entries"] = com_as_palavras_fixas(self.motor, pedido)
            _gravar_json(self._arquivo_do_pedido(job_id), gravado)
            _gravar_json(self._arquivo_do_estado(job_id), self._estado_do_pedido(gravado))
            self._entrar_na_fila(gravado)
        self.mudou.set()
        return 201, {"jobId": job_id, "status": QUEUED}

    def tentar_de_novo(self, job_id):
        with self.tranca:
            resposta = self._resposta_sem_repetir(job_id)
            if resposta is not None:
                return resposta
            self.mudar(job_id, functools.partial(self._repetir, job_id))
        self.mudou.set()
        return 200, {"jobId": job_id, "status": QUEUED}

    def _resposta_sem_repetir(self, job_id):
        pedido = self.pedido(job_id)
        if pedido is None:
            return 404, {"error": "job_not_found"}
        estado = self.estado_ou_refazer(job_id)
        if situacao(estado) == APAGADO or pedido.get("wiped"):
            return 409, {"error": "job_wiped"}
        if estado["status"] in FIM:
            return None
        if espera_pelo_plano(estado):
            self.despertador.set()
        return 200, {"jobId": job_id, "status": estado["status"]}

    def _repetir(self, job_id, estado):
        for cartao_id, cartao in estado.get("cards", {}).items():
            if cartao["status"] == FALHOU:
                pronto = os.path.exists(self.arquivo_do_texto(job_id, cartao_id))
                cartao.update(status=TEXTO if pronto else PENDENTE, error=None)
        estado_do_envio.repetir(estado)

    def reservar_o_proximo(self):
        with self.tranca:
            for item in self.ordem():
                estado = self.estado_ou_refazer(item["jobId"])
                if estado is not None and situacao(estado) == QUEUED:
                    self.mudar(item["jobId"], estado_do_envio.reservar)
                    return item["jobId"]
        return None

    def recuperar_os_interrompidos(self):
        with self.tranca:
            limpar_ao_subir(self.dados, self.estado, self.logger)
            ordem = self.ordem()
            ficam = []
            for item in ordem:
                estado = self.estado_ou_refazer(item["jobId"])
                if estado is None:
                    if self.logger:
                        self.logger.warning("Envio %s: estava na fila sem estado e sem pedido; saiu da fila", item["jobId"])
                    continue
                ficam.append(item)
                if estado["status"] == RUNNING and situacao(estado) != APAGADO:
                    self.mudar(item["jobId"], estado_do_envio.devolver_a_fila)
            if len(ficam) != len(ordem):
                _gravar_json(self._arquivo_da_fila(), {"jobs": ficam})

    def mudar(self, job_id, mudanca):
        with self.tranca:
            estado = self.estado_ou_refazer(job_id)
            antes = estado_do_envio.retrato(estado)
            mudanca(estado)
            estado_do_envio.conferir(antes, estado)
            self._gravar_estado(job_id, estado)
            return estado

    def cartao_chegou(self, job_id, cartao_id):
        with self.tranca:
            _apagar(self.arquivo_do_texto(job_id, cartao_id))
            estado, pedido = self.estado(job_id), self.pedido(job_id)
            frase, irmaos = _os_cartoes_da_frase(estado, cartao_id)
            if pedido is None or not frase_inteira_no_anki(irmaos.values()):
                return
            entrada = next((e for e in pedido["entries"] if e["phraseId"] == frase and "line" in e), None)
            if entrada is not None:
                esquecer(entrada)
                entrada["noAnki"] = irmaos
                _gravar_json(self._arquivo_do_pedido(job_id), pedido)

    def apagar_as_frases(self):
        self.despertador.set()
        with self.tranca:
            apagar_os_provisorios(self.dados)
            for job_id in self._ids_dos_pedidos_guardados():
                self._apagar_um_pedido(job_id)

    def _ids_dos_pedidos_guardados(self):
        nomes = sorted(os.listdir(self.dados.fila)) if os.path.isdir(self.dados.fila) else []
        return [nome[:-5] for nome in nomes if nome.endswith(".json") and nome != "fila.json" and id_valido(nome[:-5])]

    def _apagar_um_pedido(self, job_id):
        pedido = self.pedido(job_id)
        if pedido is None:
            return
        if _ainda_tem_a_frase(pedido):
            self._esquecer_as_frases(job_id, pedido)
        self._apagar_os_textos(job_id)
        if _estado_por_apagar(self.estado(job_id)):
            self.mudar(job_id, _apagar_o_estado)

    def _esquecer_as_frases(self, job_id, pedido):
        for entrada in pedido.get("entries", []):
            esquecer(entrada)
        pedido["wiped"] = True
        _gravar_json(self._arquivo_do_pedido(job_id), pedido)

    def _apagar_os_textos(self, job_id):
        pasta = self.pasta_dos_textos(job_id)
        for arquivo in sorted(os.listdir(pasta)) if os.path.isdir(pasta) else []:
            if arquivo.endswith((".txt", ".novo")):
                _apagar(os.path.join(pasta, arquivo))

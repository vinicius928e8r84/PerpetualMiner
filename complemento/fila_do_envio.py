"""A fila do Envio e o estado gravado de cada Cartão (#142): a `Fila`, única dona dos arquivos do Envio; quem faz o Envio é o
`Trabalho` (`envio.py`), e os estados e a máquina estão lá e em `estado_do_envio.py`.

Os arquivos em `user_files`, cada um gravado num temporário e trocado de uma vez:

    fila/fila.json              a ordem e o id de cada Envio: [{ jobId, lang, createdAt }] (nunca o status)
    fila/<jobId>.json           o pedido: o corpo do POST /jobs, `createdAt` e a impressão dele (`corpoSha256`)
    estado/<jobId>.json         o status do Envio e o estado de cada Cartão (nunca a Palavra nem a Frase)
    estado/<jobId>/<id>.txt     o texto de cada Cartão, escrito pelo motor (pago: nunca pedido de novo)
    custos/<jobId>/costs.jsonl  os custos, escritos pelo `cost_tracker` do motor (o Cartão no lugar da Palavra)

A Palavra e a Frase só existem na linha do pedido (`entries[].line`) e no texto gerado, até o Cartão chegar ao Anki: a nota
gravada tira o texto, a Frase inteira no Anki reduz a linha a `{ phraseId, noAnki }` (`cartao_chegou`) e o Apagar tudo tira o
resto (`apagar_as_frases`). Toda gravação passa por `_gravar_json` e `_apagar`, onde `test_envio_fronteiras.py` mata a Conexão.
Tudo passa pela tranca da fila (no Windows, `os.replace` de um arquivo aberto por outra thread falha).
"""

import copy
import functools
import json
import os
import threading
from datetime import datetime

from . import custos, estado_do_envio
from .envios_dos_custos import EnviosDosCustos
from .estado_do_envio import APAGADO, FAILED, FIM, QUEUED, RUNNING, STATUS, situacao
from .gravacao_de_json import apagar as _apagar, apagar_os_provisorios, avisar_do_que_ficou, gravar_json as _gravar_json
from .limite_do_plano import espera_pelo_plano
from .palavras_do_cartao import com_as_palavras_fixas, esquecer, quantos_cartoes
from .pedido_do_envio import id_que_serve_de_caminho, id_valido, impressao, validar_pedido

PENDENTE, TEXTO, ADICIONADO, DUPLICADO, FALHOU = "pending", "text", "added", "duplicate", "failed"
NO_ANKI = (ADICIONADO, DUPLICADO)


def agora_local():
    """O instante com o fuso do computador."""
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
    """A Frase do Cartão e o status de cada Cartão dela (os irmãos, ele incluído); um Cartão que o estado não tem não tem irmãos."""
    cartoes = estado.get("cards", {})
    frase = cartoes.get(cartao_id, {}).get("phraseId")
    return frase, {c: v["status"] for c, v in cartoes.items() if v["phraseId"] == frase}


def _frase_inteira_no_anki(irmaos):
    return bool(irmaos) and all(status in NO_ANKI for status in irmaos.values())


def _ainda_tem_a_frase(pedido):
    """O pedido ainda guarda a Palavra ou a Frase, ou ainda não foi marcado apagado: o Apagar tudo tem o que gravar nele."""
    return any("line" in entrada or "keywords" in entrada for entrada in pedido.get("entries", [])) or not pedido.get("wiped")


def _estado_por_apagar(estado):
    """O estado ainda anda, ou ganhou um texto depois do Apagar tudo: ele tem de passar pelo portão."""
    if estado.get("status") not in STATUS:
        return False
    return not estado.get("wiped") or any(cartao["status"] == TEXTO for cartao in estado["cards"].values())


def _apagar_o_estado(estado):
    """O texto pago saiu do disco, então o Cartão com texto volta a `pending`; e o Envio fica apagado (`estado_do_envio.apagar`)."""
    for cartao in estado["cards"].values():
        if cartao["status"] == TEXTO:
            cartao["status"] = PENDENTE
    estado_do_envio.apagar(estado)


class Fila(EnviosDosCustos):
    """A fila e o estado, únicos donos dos arquivos do Envio. Toda leitura-e-escrita passa pela tranca."""

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
        """O pedido guardado (com a impressão do corpo), ou None; um id que não serve de caminho nunca o acha."""
        if not id_que_serve_de_caminho(job_id):
            return None
        with self.tranca:
            return _ler_json(self._arquivo_do_pedido(job_id), None)

    def estado(self, job_id):
        """O estado guardado; `{}` se não há (quem trabalha usa `estado_ou_refazer`, nunca lê `{}` como um estado)."""
        with self.tranca:
            return _ler_json(self._arquivo_do_estado(job_id), {})

    def item_da_fila(self, job_id):
        return next((item for item in self.ordem() if item.get("jobId") == job_id), None)

    def registros_de_custo(self, job_id):
        with self.tranca:
            return custos.registros(self.pasta_dos_custos(job_id))

    def linha_do_cartao(self, job_id, phrase_id):
        """A linha de mineração da Frase no pedido, ou None se ela já não está (a Frase chegou ao Anki ou foi apagada)."""
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
        """O estado que um pedido guardado diz: cada Cartão `pending` (o `guid` acha as notas que já estão no Anki), os que o pedido
        diz que já chegaram ao Anki como estavam. Sem a linha (apagada) e sem `noAnki`, a Frase não tem Cartões."""
        cartoes = {}
        for entrada in pedido["entries"]:
            if entrada.get("noAnki"):
                for cartao, status in entrada["noAnki"].items():
                    cartoes[cartao] = {"phraseId": entrada["phraseId"], "status": status, "error": None}
            elif isinstance(entrada.get("line"), str):
                for posicao in range(quantos_cartoes(self.motor, pedido["lang"], entrada)):
                    cartoes[id_do_cartao(entrada["phraseId"], posicao)] = {"phraseId": entrada["phraseId"], "status": PENDENTE, "error": None}
        apagado = bool(pedido.get("wiped"))
        estado = {
            "jobId": pedido["jobId"], "status": FAILED if apagado else QUEUED, "stage": FAILED if apagado else QUEUED,
            "completedStages": [], "progress": {}, "successfulPhraseIds": [], "failedPhraseIds": [], "duplicatePhraseIds": [],
            "lastError": estado_do_envio.FRASES_APAGADAS if apagado else None, "updatedAt": pedido["createdAt"], "cards": cartoes,
        }
        if apagado:
            estado["wiped"] = True
        return estado

    def estado_ou_refazer(self, job_id):
        """O estado do Envio; se o arquivo falta (ou não se lê), refeito do pedido guardado e gravado. None se nem o pedido existe."""
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
        """`POST /jobs`: (status, resposta). O mesmo corpo de novo devolve o Envio que já existe (ou termina o criar que parou) e nada se regrava."""
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
        """`POST /jobs/retry`: (status, resposta). Um Envio que terminou volta à fila (`_repetir`); os outros pedidos só têm a
        resposta de `_resposta_sem_repetir`."""
        with self.tranca:
            resposta = self._resposta_sem_repetir(job_id)
            if resposta is not None:
                return resposta
            self.mudar(job_id, functools.partial(self._repetir, job_id))
        self.mudou.set()
        return 200, {"jobId": job_id, "status": QUEUED}

    def _resposta_sem_repetir(self, job_id):
        """A resposta do Tentar de novo que não muda nada, ou None se o Envio terminou e volta à fila. Já na fila ou rodando, só diz o
        estado (e acorda o Envio que espera o plano); com as Frases apagadas, 409 `job_wiped` (do apagado não se sai). Nada é gravado."""
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
        """A mudança do Tentar de novo: cada Cartão que falhou volta a `text` se o texto pago está no disco, senão a `pending`, sem o
        erro; e o Envio volta à fila (`estado_do_envio.repetir`)."""
        for cartao_id, cartao in estado.get("cards", {}).items():
            if cartao["status"] == FALHOU:
                pronto = os.path.exists(self.arquivo_do_texto(job_id, cartao_id))
                cartao.update(status=TEXTO if pronto else PENDENTE, error=None)
        estado_do_envio.repetir(estado)

    def reservar_o_proximo(self):
        """O próximo Envio da fila, já marcado `running` no estado; None se não há."""
        with self.tranca:
            for item in self.ordem():
                estado = self.estado_ou_refazer(item["jobId"])
                if estado is not None and situacao(estado) == QUEUED:
                    self.mudar(item["jobId"], estado_do_envio.reservar)
                    return item["jobId"]
        return None

    def recuperar_os_interrompidos(self):
        """A Conexão subiu: um estado `running` volta a `queued` e o Envio continua de onde parou; um id da fila sem estado
        tem o estado refeito do pedido, e sem pedido sai da fila (o log diz por quê). Um pedido fora da fila **não** entra nela."""
        with self.tranca:
            apagar_os_provisorios(self.dados, avisar_do_que_ficou(self.logger))
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
        """O portão do estado gravado: aplica `mudanca(estado)`, confere-a com a máquina (`estado_do_envio.conferir`: a tabela das
        transições; do apagado nada sai) e grava, sob a tranca; devolve o estado novo. Todo escritor do estado passa por aqui."""
        with self.tranca:
            estado = self.estado_ou_refazer(job_id)
            antes = estado_do_envio.retrato(estado)
            mudanca(estado)
            estado_do_envio.conferir(antes, estado)
            self._gravar_estado(job_id, estado)
            return estado

    def cartao_chegou(self, job_id, cartao_id):
        """O Cartão está no Anki: o texto dele sai da Conexão; se a Frase inteira chegou, a linha dela vira só o `phraseId`."""
        with self.tranca:
            _apagar(self.arquivo_do_texto(job_id, cartao_id))
            estado, pedido = self.estado(job_id), self.pedido(job_id)
            frase, irmaos = _os_cartoes_da_frase(estado, cartao_id)
            if pedido is None or not _frase_inteira_no_anki(irmaos):
                return
            entrada = next((e for e in pedido["entries"] if e["phraseId"] == frase and "line" in e), None)
            if entrada is not None:
                esquecer(entrada)
                entrada["noAnki"] = irmaos
                _gravar_json(self._arquivo_do_pedido(job_id), pedido)

    def apagar_as_frases(self):
        """`POST /jobs/apagar-frases` (o Apagar tudo, CFG-17): de todo pedido da pasta, tenha ou não entrada na fila, somem as linhas
        das Frases e os textos gerados; um Envio na fila ou rodando vai a `failed` com `wiped`. Ficam os `phraseId`, o estado de
        cada Cartão e os custos. Repetido, não grava nada. Cada passo grava só o que falta, então morrer no meio e pedir de novo termina."""
        self.despertador.set()
        with self.tranca:
            apagar_os_provisorios(self.dados)
            for job_id in self._ids_dos_pedidos_guardados():
                self._apagar_um_pedido(job_id)

    def _ids_dos_pedidos_guardados(self):
        """O id de cada pedido na pasta da fila, em ordem, tenha ou não entrada na fila (`fila.json` e um nome fora de UUID não contam)."""
        nomes = sorted(os.listdir(self.dados.fila)) if os.path.isdir(self.dados.fila) else []
        return [nome[:-5] for nome in nomes if nome.endswith(".json") and nome != "fila.json" and id_valido(nome[:-5])]

    def _apagar_um_pedido(self, job_id):
        """O Apagar tudo de um Envio: a linha e as Palavras saem do pedido, os textos gerados saem do disco e o estado passa pelo portão."""
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

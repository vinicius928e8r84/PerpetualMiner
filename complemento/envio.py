"""O Envio dentro da Conexão (#142): a fila, o estado de cada Cartão e o trabalho que os faz (a thread: `trabalhador.py`).

Desenho: `docs/design/envio-no-complemento.md`. Os estados: `queued` →
`running` (`generate_cards`, `wait_anki` ou `send_to_anki`) → `completed` | `partial` | `failed`; uma Frase está no Anki quando
todos os Cartões dela estão (`settle`). O estado também é **por Cartão** (`cards`: `pending` → `text` → `added` | `duplicate`,
ou `failed` com o `error`): a retomada não refaz nada pronto. Um Cartão é (`phraseId`, posição da Palavra), `<phraseId>-<n>`.

Os arquivos em `user_files`, cada um gravado num temporário e trocado de uma vez:

    fila/fila.json              a ordem e o id de cada Envio: [{ jobId, lang, createdAt }] (nunca o status)
    fila/<jobId>.json           o pedido: o corpo do POST /jobs, `createdAt` e a impressão dele (`corpoSha256`)
    estado/<jobId>.json         o status do Envio e o estado de cada Cartão (nunca a Palavra nem a Frase)
    estado/<jobId>/<id>.txt     o texto de cada Cartão, escrito pelo motor (pago: nunca pedido de novo)
    custos/<jobId>/costs.jsonl  os custos, escritos pelo `cost_tracker` do motor (o Cartão no lugar da Palavra)

A Palavra e a Frase só existem na linha do pedido (`entries[].line`) e no texto gerado, até o Cartão chegar ao Anki: a nota
gravada tira o texto dele, a Frase inteira no Anki reduz a linha a `{ phraseId, noAnki }` e o Apagar tudo tira o resto
(`apagar_as_frases`). Toda gravação passa por `_gravar_json` e `_apagar`, onde `test_envio_fronteiras.py` mata a Conexão.

A rede (a OpenAI e a voz do Google, `audio_do_cartao.py`) é da thread de trabalho; cada nota é gravada pelo adaptador da
coleção (`gravar_cartao`, na thread principal do Anki). Sem coleção, sincronizando ou ocupado, ele levanta `ColecaoIndisponivel`
e a thread espera, sem prazo. A chave (ou o login do ChatGPT) é lida antes de cada pedido de texto, só para ele; os erros são
códigos, nunca o texto da OpenAI. Tudo passa pela tranca da fila (no Windows, `os.replace` de um arquivo aberto por outra thread falha).
"""

import copy
import hashlib
import json
import os
import threading
from datetime import datetime, timezone

from . import baralhos, custos, voz
from .audio_do_cartao import FRASE_APAGADA, AudioDoCartao
from .gravacao_de_json import apagar as _apagar, gravar_json as _gravar_json
from .configuracao import OPENVERSE_BASE, VOZ_BASE
from .imagem_do_cartao import ImagemDoCartao, ParaOEnvio
from .limite_do_plano import LIMITE_DO_PLANO, LimiteDoPlano, espera_pelo_plano
from .login_do_chatgpt import RECUSOU, SAIU
from .modelo_dos_cartoes import credencial
from .motor_do_envio import configuracao_do_motor, motor_do_complemento  # noqa: F401  (`envio.motor_do_complemento`)
from .paradas_do_envio import Apagado, Interrompido  # noqa: F401  (`envio.Interrompido`)
from .tipo_do_envio import TipoDoEnvio
from .pedido_do_envio import id_que_serve_de_caminho, id_valido, impressao, validar_pedido, visao_do_pedido  # noqa: F401

QUEUED, RUNNING, COMPLETED, PARTIAL, FAILED = "queued", "running", "completed", "partial", "failed"
FIM = (COMPLETED, PARTIAL, FAILED)
TRANSICOES = {
    QUEUED: {RUNNING, FAILED},
    RUNNING: {QUEUED, COMPLETED, PARTIAL, FAILED},
    COMPLETED: {QUEUED},
    PARTIAL: {QUEUED},
    FAILED: {QUEUED},
}

PENDENTE, TEXTO, ADICIONADO, DUPLICADO, FALHOU = "pending", "text", "added", "duplicate", "failed"
NO_ANKI = (ADICIONADO, DUPLICADO)

SEM_CHAVE = "openai_key_missing"
SEM_TIPO_DE_NOTA = "note_type_missing"
FALHA_AO_GRAVAR = "anki_write_failed"
CARTOES_FALHARAM = "cards_failed"
# Chave recusada, conta sem crédito ou plano que não serve: os próximos falhariam igual (o limite de uso espera: `limite_do_plano.py`).
PARA_O_ENVIO = ("openai_key_rejected", "openai_no_credit", SAIU, "chatgpt_not_eligible", RECUSOU)
# Passageiros: tenta de novo depois de cada espera.
PASSAGEIROS = ("openai_rate_limited", "openai_unreachable", "generation_error", "empty_response")


def agora_local():
    """O instante com o fuso do computador, a aba Custos filtra pelo dia de quem usa."""
    return datetime.now().astimezone().isoformat(timespec="seconds")


def agora_utc():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def id_do_cartao(phrase_id, posicao):
    return "%d-%d" % (phrase_id, posicao)


def guid_do_cartao(job_id, cartao):
    """O `guid` da nota de um Cartão: o mesmo a cada volta, para a retomada reconhecer a nota que este Envio já gravou."""
    return "pm" + hashlib.sha1(("%s\x1f%s" % (job_id, cartao)).encode("utf-8")).hexdigest()[:20]


def ids_unicos(valores):
    vistos, ids = set(), []
    for valor in valores or []:
        try:
            numero = int(valor)
        except (TypeError, ValueError):
            continue
        if numero not in vistos:
            vistos.add(numero)
            ids.append(numero)
    return ids


def _ler_json(caminho, padrao):
    try:
        with open(caminho, encoding="utf-8") as arquivo:
            return json.load(arquivo)
    except (OSError, ValueError):
        return copy.deepcopy(padrao)


def cartoes_da_frase(motor, lang, linha):
    """Quantos Cartões uma linha de mineração tem (um por Palavra, na ordem); 0 se a linha não se lê."""
    entrada = motor.parser.parse_line(motor.estilos.estilo(lang)["entrada"], linha)
    return 0 if entrada is None else len(motor.parser.get_card_jobs(entrada))


class Fila:
    """A fila e o estado, únicos donos dos arquivos do Envio. Toda leitura-e-escrita passa pela tranca."""

    def __init__(self, dados, motor, logger=None):
        self.dados = dados
        self.motor = motor
        self.logger = logger
        self.tranca = threading.RLock()
        self.mudou = threading.Event()
        self.despertador = threading.Event()  # acorda a espera do plano

    # -- caminhos --
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

    # -- leitura --
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

    def listar(self):
        """Cada Envio da fila, na ordem; o `status` de cada item vem do estado (a fila não o tem)."""
        with self.tranca:
            lista = []
            for item in self.ordem():
                estado = self.estado(item["jobId"])
                lista.append(dict(
                    item, status=estado.get("status", QUEUED), updatedAt=estado.get("updatedAt", item.get("createdAt")), state=estado))
            return lista

    def item_da_fila(self, job_id):
        return next((item for item in self.ordem() if item.get("jobId") == job_id), None)

    def registros_de_custo(self, job_id):
        with self.tranca:
            return custos.registros(self.pasta_dos_custos(job_id))

    def linha_do_cartao(self, job_id, phrase_id):
        """A linha de mineração da Frase no pedido, ou None se ela já não está (a Frase chegou ao Anki ou foi apagada)."""
        pedido = self.pedido(job_id) or {}
        return next((e.get("line") for e in pedido.get("entries", []) if e.get("phraseId") == phrase_id), None)

    # -- escrita --
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
                for posicao in range(cartoes_da_frase(self.motor, pedido["lang"], entrada["line"])):
                    cartoes[id_do_cartao(entrada["phraseId"], posicao)] = {"phraseId": entrada["phraseId"], "status": PENDENTE, "error": None}
        apagado = bool(pedido.get("wiped"))
        estado = {
            "jobId": pedido["jobId"], "status": FAILED if apagado else QUEUED, "stage": FAILED if apagado else QUEUED,
            "completedStages": [], "progress": {}, "successfulPhraseIds": [], "failedPhraseIds": [], "duplicatePhraseIds": [],
            "lastError": "frases_apagadas" if apagado else None, "updatedAt": pedido["createdAt"], "cards": cartoes,
        }
        if apagado:
            estado["wiped"] = True
        return estado

    def estado_ou_refazer(self, job_id):
        """O estado do Envio; se o arquivo falta (ou não se lê), refeito do pedido guardado e gravado. None se nem o pedido existe."""
        with self.tranca:
            estado = self.estado(job_id)
            if estado.get("status") in TRANSICOES and isinstance(estado.get("cards"), dict):
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
                # Compara a impressão gravada no criar, nunca o pedido, que o fim do Envio e o Apagar tudo reescrevem.
                if existente.get("corpoSha256") != marca:
                    return 409, {"error": "job_conflict"}
                estado = self.estado_ou_refazer(job_id)
                if self.item_da_fila(job_id) is None:
                    self._entrar_na_fila(existente)  # o criar parou antes da confirmação: o mesmo corpo o termina
                    self.mudou.set()
                return 201, {"jobId": job_id, "status": estado["status"]}
            criado_em = agora_local()
            gravado = dict(pedido, createdAt=criado_em, corpoSha256=marca)
            # O pedido, depois o estado e por último a entrada na fila: é a confirmação.
            _gravar_json(self._arquivo_do_pedido(job_id), gravado)
            _gravar_json(self._arquivo_do_estado(job_id), self._estado_do_pedido(gravado))
            self._entrar_na_fila(gravado)
        self.mudou.set()
        return 201, {"jobId": job_id, "status": QUEUED}

    def tentar_de_novo(self, job_id):
        """`POST /jobs/retry`: (status, resposta). Já na fila ou rodando, ou com as Frases apagadas, só diz o estado; nada é gravado."""
        with self.tranca:
            pedido = self.pedido(job_id)
            if pedido is None:
                return 404, {"error": "job_not_found"}
            estado = self.estado_ou_refazer(job_id)
            if estado.get("status") in (QUEUED, RUNNING) or estado.get("wiped") or pedido.get("wiped"):
                if espera_pelo_plano(estado):
                    self.despertador.set()  # Tentar de novo no limite: pede já
                return 200, {"jobId": job_id, "status": estado["status"]}
            for cartao_id, cartao in estado.get("cards", {}).items():
                if cartao["status"] == FALHOU:
                    pronto = os.path.exists(self.arquivo_do_texto(job_id, cartao_id))
                    cartao.update(status=TEXTO if pronto else PENDENTE, error=None)
            estado.update(status=QUEUED, stage=QUEUED, lastError=None, progress={})
            self._gravar_estado(job_id, estado)
        self.mudou.set()
        return 200, {"jobId": job_id, "status": QUEUED}

    def reservar_o_proximo(self):
        """O próximo Envio da fila, já marcado `running` no estado; None se não há."""
        with self.tranca:
            for item in self.ordem():
                estado = self.estado_ou_refazer(item["jobId"])
                if estado is not None and estado["status"] == QUEUED:
                    estado.update(status=RUNNING)
                    self._gravar_estado(item["jobId"], estado)
                    return item["jobId"]
        return None

    def recuperar_os_interrompidos(self):
        """A Conexão subiu: um estado `running` volta a `queued` e o Envio continua de onde parou; um id da fila sem estado
        tem o estado refeito do pedido, e sem pedido sai da fila (o log diz por quê). Um pedido fora da fila **não** entra nela."""
        with self.tranca:
            ordem = self.ordem()
            ficam = []
            for item in ordem:
                estado = self.estado_ou_refazer(item["jobId"])
                if estado is None:
                    if self.logger:
                        self.logger.warning("Envio %s: estava na fila sem estado e sem pedido; saiu da fila", item["jobId"])
                    continue
                ficam.append(item)
                if estado["status"] == RUNNING:
                    estado.pop("waiting", None)
                    estado.update(status=QUEUED, stage=QUEUED)
                    self._gravar_estado(item["jobId"], estado)
            if len(ficam) != len(ordem):
                _gravar_json(self._arquivo_da_fila(), {"jobs": ficam})

    def mudar(self, job_id, mudanca):
        """Aplica `mudanca(estado)` ao estado guardado e grava, sob a tranca; devolve o estado novo."""
        with self.tranca:
            estado = self.estado_ou_refazer(job_id)
            anterior = estado.get("status")
            mudanca(estado)
            novo = estado.get("status")
            if anterior in TRANSICOES and novo != anterior and novo not in TRANSICOES[anterior]:
                raise ValueError("Envio não pode ir de %s para %s" % (anterior, novo))
            self._gravar_estado(job_id, estado)
            return estado

    def cartao_chegou(self, job_id, cartao_id):
        """O Cartão está no Anki: o texto dele sai da Conexão; se a Frase inteira chegou, a linha dela vira só o `phraseId`."""
        with self.tranca:
            _apagar(self.arquivo_do_texto(job_id, cartao_id))
            estado, pedido = self.estado(job_id), self.pedido(job_id)
            frase = estado.get("cards", {}).get(cartao_id, {}).get("phraseId")
            irmaos = {c: v["status"] for c, v in estado.get("cards", {}).items() if v["phraseId"] == frase}
            if pedido is None or not irmaos or not all(status in NO_ANKI for status in irmaos.values()):
                return
            for entrada in pedido["entries"]:
                if entrada["phraseId"] == frase and "line" in entrada:
                    entrada.pop("line")
                    entrada["noAnki"] = irmaos
                    _gravar_json(self._arquivo_do_pedido(job_id), pedido)
                    break

    def apagar_as_frases(self):
        """`POST /jobs/apagar-frases` (o Apagar tudo, CFG-17): de todo pedido da pasta, tenha ou não entrada na fila, somem as linhas
        das Frases e os textos gerados; um Envio na fila ou rodando vai a `failed` com `wiped`. Ficam os `phraseId`, o estado de
        cada Cartão e os custos. Repetido, não grava nada. Cada passo grava só o que falta, então morrer no meio e pedir de novo termina."""
        self.despertador.set()  # o Envio que espera o plano vê as Frases apagadas
        with self.tranca:
            # Todo `<nome>.novo` (a gravação que morreu entre escrever e renomear) guarda a Palavra e a Frase e ninguém o reescreve.
            for pasta in (self.dados.fila, self.dados.estado, self.dados.custos):
                for raiz, _, nomes in os.walk(pasta):
                    for nome in sorted(nomes):
                        if nome.endswith(".novo"):
                            _apagar(os.path.join(raiz, nome))
            for nome in sorted(os.listdir(self.dados.fila)) if os.path.isdir(self.dados.fila) else []:
                job_id = nome[:-5] if nome.endswith(".json") else None
                if job_id is None or job_id == "fila" or not id_valido(job_id):
                    continue
                pedido = self.pedido(job_id)
                if pedido is None:
                    continue
                if any("line" in entrada for entrada in pedido.get("entries", [])) or not pedido.get("wiped"):
                    for entrada in pedido.get("entries", []):
                        entrada.pop("line", None)
                    pedido["wiped"] = True
                    _gravar_json(self._arquivo_do_pedido(job_id), pedido)
                pasta = self.pasta_dos_textos(job_id)
                for arquivo in sorted(os.listdir(pasta)) if os.path.isdir(pasta) else []:
                    if arquivo.endswith((".txt", ".novo")):
                        _apagar(os.path.join(pasta, arquivo))
                estado = self.estado(job_id)
                if estado.get("status") in TRANSICOES and (not estado.get("wiped") or any(c["status"] == TEXTO for c in estado["cards"].values())):
                    for cartao in estado["cards"].values():
                        if cartao["status"] == TEXTO:
                            cartao["status"] = PENDENTE
                    if estado["status"] in (QUEUED, RUNNING):
                        estado.pop("waiting", None)
                        estado.update(status=FAILED, stage=FAILED, lastError="frases_apagadas", progress={})
                    estado["wiped"] = True
                    self._gravar_estado(job_id, estado)


def resolver(pedido, estado):
    """O fim do Envio pelo estado guardado de cada Cartão."""
    pedidas = ids_unicos(entrada.get("phraseId") for entrada in pedido.get("entries", []))
    por_frase = {}
    for cartao in estado.get("cards", {}).values():
        por_frase.setdefault(cartao["phraseId"], []).append(cartao["status"])
    no_anki = [frase for frase in pedidas if por_frase.get(frase) and all(s in NO_ANKI for s in por_frase[frase])]
    duplicadas = [frase for frase in no_anki if all(s == DUPLICADO for s in por_frase[frase])]
    falharam = [frase for frase in pedidas if frase not in no_anki]
    status = COMPLETED if pedidas and not falharam else (PARTIAL if no_anki else FAILED)
    return status, no_anki, falharam, duplicadas


class Trabalho(AudioDoCartao, ImagemDoCartao, LimiteDoPlano, TipoDoEnvio):
    """Faz um Envio: confere o tipo de nota e, Cartão a Cartão, acha a nota no Anki, gera o texto, o áudio e a imagem e grava a nota."""

    def __init__(self, fila, colecao, cofre, logger, openai_base, parar, espera_do_anki=2.0, esperas_da_openai=(2, 8, 30),
                 voz_base=VOZ_BASE, openverse_base=OPENVERSE_BASE, adaptador_de_imagem=None, chatgpt=None, espera_do_plano=300, modelos=None):
        self.fila, self.chatgpt, self.modelos, self.plano = fila, chatgpt, modelos, {}
        self.espera_do_plano = espera_do_plano
        self.motor = fila.motor
        self.colecao = colecao
        self.cofre = cofre
        self.logger = logger
        self.openai_base = openai_base
        self.voz_base = voz_base
        self.openverse_base = openverse_base
        self.adaptador_de_imagem = adaptador_de_imagem
        self.parar = parar
        self.espera_do_anki = espera_do_anki
        self.esperas_da_openai = tuple(esperas_da_openai)

    # -- ajudas --
    def _dormir(self, segundos):
        if self.parar.wait(segundos):
            raise Interrompido()

    def _etapa(self, job_id, etapa, progress=None, concluida=False):
        def mudanca(estado):
            estado["stage"] = etapa
            if progress is not None:
                estado["progress"] = progress
            if concluida and etapa not in estado["completedStages"]:
                estado["completedStages"].append(etapa)

        return self.fila.mudar(job_id, mudanca)

    def _com_a_colecao(self, job_id, leitura):
        """Roda `leitura()` na coleção; sem ela (perfil fechado, sincronizando, ocupado), espera em `wait_anki` e tenta de novo."""
        esperando_desde = None
        while True:
            try:
                resultado = leitura()
            except baralhos.ColecaoIndisponivel as motivo:
                if esperando_desde is None:
                    esperando_desde = self.fila.estado(job_id).get("stage")
                    self.logger.info("Envio %s: esperando o Anki (%s)", job_id, motivo)
                    self._etapa(job_id, "wait_anki")
                self._dizer_a_espera(job_id, baralhos.espera_pelo_perfil(motivo))
                if str(motivo) == "collection_not_open":
                    self._entrar_no_perfil(job_id)
                self._dormir(self.espera_do_anki)
                if self.fila.estado(job_id).get("wiped"):
                    raise Apagado()
                continue
            if esperando_desde is not None:
                self._dizer_a_espera(job_id, None)
            if esperando_desde not in (None, QUEUED, "wait_anki"):
                self._etapa(job_id, esperando_desde)
            return resultado

    def _entrar_no_perfil(self, job_id):
        """O Anki está na tela de perfis (ou fechado o perfil): ninguém estuda, e a Conexão abre o perfil marcado. Com um perfil aberto o
        adaptador não faz nada, e a troca só vem do clique da pessoa."""
        try:
            if self.colecao.entrar_no_perfil_fixo():
                self.logger.info("Envio %s: o Anki estava sem perfil aberto; a Conexão abriu o perfil marcado", job_id)
        except Exception as erro:  # o Envio só continua esperando
            self.logger.warning("Envio %s: não deu para abrir o perfil marcado (%s)", job_id, type(erro).__name__)

    def _cartao(self, job_id, cartao_id, **mudanca):
        self.fila.mudar(job_id, lambda estado: estado["cards"][cartao_id].update(mudanca))

    def _terminar(self, job_id, pedido, erro=None):
        def mudanca(estado):
            if estado.get("wiped"):
                return  # o Apagar tudo já pôs o Envio em `failed`: nada o desfaz
            status, no_anki, falharam, duplicadas = resolver(pedido, estado)
            if erro:
                status = PARTIAL if no_anki else FAILED
            primeiro = next((c["error"] for c in estado["cards"].values() if c["status"] == FALHOU and c["error"]), None)
            estado.pop("waiting", None)
            estado.update(
                status=status, stage=status, successfulPhraseIds=no_anki, failedPhraseIds=falharam, duplicatePhraseIds=duplicadas,
                progress={}, lastError=None if status == COMPLETED else (erro or primeiro or CARTOES_FALHARAM),
            )

        estado = self.fila.mudar(job_id, mudanca)
        self.logger.info("Envio %s: %s (%s)", job_id, estado["status"], estado["lastError"] or "sem erro")

    # -- o Envio --
    def fazer(self, job_id):
        self.plano = {}
        pedido = self.fila.pedido(job_id)
        if self.fila.estado_ou_refazer(job_id).get("wiped"):
            return
        config = configuracao_do_motor(self.motor, self.fila, pedido, None)
        try:
            nome, serve = self._o_tipo_do_envio(job_id, pedido)
        except Apagado:
            return
        if not serve:
            self.logger.warning("Envio %s: o tipo de nota %r não tem os campos do Cartão", job_id, nome)
            return self._terminar(job_id, pedido, SEM_TIPO_DE_NOTA)
        try:
            self._os_cartoes(job_id, pedido, config)
        except Apagado:
            self.logger.info("Envio %s: parou, as Frases foram apagadas", job_id)

    def _os_cartoes(self, job_id, pedido, config):
        parada = None
        total = len(self.fila.estado(job_id)["cards"])
        for cartao_id in list(self.fila.estado(job_id)["cards"]):
            estado = self.fila.estado(job_id)
            if estado.get("wiped"):
                return
            cartao = estado["cards"][cartao_id]
            if cartao["status"] in NO_ANKI:
                self.fila.cartao_chegou(job_id, cartao_id)  # a morte pode ter vindo entre `added` e o fim dele; repetir não regrava
                continue
            feitos = sum(1 for c in estado["cards"].values() if c["status"] in NO_ANKI)
            self._etapa(job_id, "generate_cards", progress={"done": feitos, "total": total})
            parada = self._um_cartao(job_id, pedido, config, cartao_id, cartao, parada) or parada
        self._etapa(job_id, "send_to_anki", concluida=True)
        self._terminar(job_id, pedido, parada)

    def _um_cartao(self, job_id, pedido, config, cartao_id, cartao, parada):
        """Faz um Cartão: o `guid` antes de tudo (a nota já está: nada se gera nem se paga), depois o texto e a nota.
        Devolve o código que para o Envio, ou None."""
        guid = guid_do_cartao(job_id, cartao_id)
        if guid in self._com_a_colecao(job_id, lambda: self.colecao.guids_existentes([guid])):
            self._cartao(job_id, cartao_id, status=ADICIONADO, error=None)
            self.fila.cartao_chegou(job_id, cartao_id)
            return None
        self._conferir_o_teto(job_id)
        arquivo = self.fila.arquivo_do_texto(job_id, cartao_id)
        if not os.path.exists(arquivo):
            if parada:
                return None  # a chave parou o Envio: sem texto pago, o Cartão fica como está
            linha = self.fila.linha_do_cartao(job_id, cartao["phraseId"])
            if linha is None:
                self._cartao(job_id, cartao_id, status=FALHOU, error=FRASE_APAGADA)
                return None
            while True:
                pela_chave = self.fila.estado(job_id).get("usingKey", False)
                chave = credencial(self.chatgpt, self.cofre, self.plano, self.modelos, pela_chave)  # o plano, a chave, None ou um código
                if not isinstance(chave, dict):
                    return SEM_CHAVE if chave is None else chave if chave in PARA_O_ENVIO else self._cartao(job_id, cartao_id, status=FALHOU, error=chave)
                falha = self._gerar_o_texto(job_id, pedido, dict(config, **chave), cartao_id, cartao["phraseId"], linha)
                chave = None
                if self.fila.estado(job_id).get("wiped"):
                    with self.fila.tranca:
                        _apagar(arquivo)  # o Apagar tudo veio no meio do pedido: o texto que chegou depois sai
                    return None
                if falha != LIMITE_DO_PLANO:
                    break
                self._esperar_o_plano(job_id)
            self._dizer_a_espera(job_id, None)
            if falha:
                self.logger.warning("Envio %s: o texto do Cartão %s não veio (%s)", job_id, cartao_id, falha)
                self._cartao(job_id, cartao_id, status=FALHOU, error=falha)
                return falha if falha in PARA_O_ENVIO else None
            self._cartao(job_id, cartao_id, status=TEXTO, error=None)
        try:
            self._gravar_a_nota(job_id, pedido, config, cartao_id, guid, arquivo)
        except ParaOEnvio as parada:  # o plano não deixou escolher a imagem (#156): o texto fica pago; Tentar de novo termina o Cartão
            self._cartao(job_id, cartao_id, status=FALHOU, error=parada.codigo)
            return parada.codigo
        return None

    def _gerar_o_texto(self, job_id, pedido, config, cartao_id, phrase_id, linha):
        """Gera o texto de um Cartão, tentando de novo o que falha por um motivo passageiro; devolve o código da falha, ou None."""
        entrada = self.motor.parser.parse_line(config["estilo"]["entrada"], linha)
        if entrada is None:
            return "invalid_card"
        nome = lambda trabalho, posicao: id_do_cartao(phrase_id, posicao)  # noqa: E731
        falhas = {}
        for espera in (None,) + self.esperas_da_openai:
            if espera is not None:
                self._dormir(espera)
            falhas = {}
            self.motor.generate_cards.run(
                [entrada], config, openai_base=self.openai_base, skip_existing=True, failures=falhas, card_stem=nome, only_stems={cartao_id})
            codigo = falhas.get(cartao_id)
            if codigo not in PASSAGEIROS:
                break
        return falhas.get(cartao_id)

    def _gravar_a_nota(self, job_id, pedido, config, cartao_id, guid, arquivo):
        envio = self.motor.send_to_anki
        lang, baralho, tipo = pedido["lang"], pedido["deckName"], config["anki"]["note_type"]
        with open(arquivo, encoding="utf-8") as texto:
            conteudo = texto.read()
        try:
            arquivos, da_frase, da_palavra, palavra = self._o_audio(job_id, pedido, config, cartao_id, guid, conteudo)
        except voz.ErroDaVoz as erro:
            return self._cartao(job_id, cartao_id, status=FALHOU, error=erro.codigo)
        imagem, da_imagem = self._a_imagem(job_id, pedido, config, cartao_id, guid, conteudo)  # só a imagem falha: o Cartão vai sem
        arquivos.update(imagem)
        if self.fila.estado(job_id).get("wiped"):
            raise Apagado()
        nota = self.motor.nota_do_cartao.campos_da_nota(
            conteudo, lang, nivel=pedido.get("nivel"), palavra=palavra, audio_da_frase=da_frase, audio_da_palavra=da_palavra, imagem=da_imagem)
        frentes = (nota["campo_da_frente"],) + self.motor.estilos.nomes_da_frente_de_antes()
        tipo, frentes, nota = self._a_nota_no_tipo(pedido, tipo, frentes, nota)
        self._etapa(job_id, "send_to_anki")
        try:
            resultado = self._com_a_colecao(job_id, lambda: self.colecao.gravar_cartao(
                baralho, tipo, nota["campos"], nota["etiquetas"], guid,
                frentes, nota["frente_normalizada"], lambda valor: envio.normalize_front(valor, lang), arquivos))
        except baralhos.TipoDeNotaAusente:
            return self._cartao(job_id, cartao_id, status=FALHOU, error=SEM_TIPO_DE_NOTA)
        except (Interrompido, Apagado):
            raise
        except Exception as erro:
            self.logger.error("Envio %s: o Anki não gravou o Cartão %s (%s)", job_id, cartao_id, type(erro).__name__)
            return self._cartao(job_id, cartao_id, status=FALHOU, error=FALHA_AO_GRAVAR)
        self._cartao(job_id, cartao_id, status=resultado, error=None)
        self.fila.cartao_chegou(job_id, cartao_id)

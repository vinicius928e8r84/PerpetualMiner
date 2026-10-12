"""O Envio dentro da Conexão (#142): a fila, o estado de cada Cartão e a thread de trabalho que os faz.

O desenho (dono de cada dado, estados, transições, variantes e limites) está em `docs/design/envio-no-complemento.md`.
Os estados e as regras são os do Envio de hoje (`bridge/envio.py`), que o painel já lê: `queued` → `running` (etapa
`generate_cards`, `wait_anki` ou `send_to_anki`) → `completed` | `partial` | `failed`, e uma Frase está no Anki quando todos
os Cartões dela estão (`settle`). Aqui o estado também é **por Cartão** (`cards`: `pending` → `text` → `added` | `duplicate`,
ou `failed` com o `error`), e é ele que faz a retomada não refazer nada pronto.

Os arquivos, em `user_files` (`pasta_de_dados.py`), cada um escrito num temporário e trocado de uma vez, sob a tranca da fila:

    fila/fila.json              a ordem: [{ jobId, lang, status, createdAt, updatedAt }]
    fila/<jobId>.json           o pedido (o corpo do POST /jobs, mais `createdAt`)
    estado/<jobId>.json         o estado do Envio e de cada Cartão
    estado/<jobId>/<stem>.txt   o texto de cada Cartão, escrito pelo motor (pago: nunca pedido de novo)
    custos/<jobId>/costs.jsonl  os custos, escritos pelo `cost_tracker` do motor

As chamadas de rede (a OpenAI) acontecem na thread de trabalho; cada nota é gravada pelo adaptador da coleção (que, no Anki,
roda na thread principal, numa operação curta). Sem coleção (perfil fechado), sincronizando ou com o Anki ocupado, o
adaptador levanta `ColecaoIndisponivel` e a thread espera e tenta de novo, sem prazo. A chave é lida do cofre só para o pedido
que a gasta; `lastError` e o erro de cada Cartão são códigos, nunca o que a OpenAI escreveu.
"""

import copy
import hashlib
import json
import os
import re
import threading
from types import SimpleNamespace
from datetime import datetime, timezone

from . import baralhos

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
# A OpenAI recusou a chave ou a conta não tem como pagar: os Cartões seguintes falhariam igual, então o Envio para.
PARA_O_ENVIO = ("openai_key_rejected", "openai_no_credit")
# Passageiros: o Cartão tenta de novo depois de cada espera de `esperas_da_openai`.
PASSAGEIROS = ("openai_rate_limited", "openai_unreachable", "generation_error", "empty_response")

_ID_DO_ENVIO = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
IDIOMAS = ("en", "ru")


def motor_do_complemento():
    """Os módulos do motor de texto que o Envio usa (`complemento.motor`, ver `motor/__init__.py`)."""
    from .motor import config_loader, generate_cards, parser, send_to_anki

    return SimpleNamespace(config_loader=config_loader, generate_cards=generate_cards, parser=parser, send_to_anki=send_to_anki)


class Interrompido(Exception):
    """A Conexão está parando (o Anki fecha): o Envio fica `running` e volta à fila quando ela subir de novo."""


def agora_local():
    """O instante com o fuso do computador, como a Conexão de hoje: a aba Custos filtra pelo dia de quem usa."""
    return datetime.now().astimezone().isoformat(timespec="seconds")


def agora_utc():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def id_valido(job_id):
    return isinstance(job_id, str) and bool(_ID_DO_ENVIO.match(job_id))


def guid_do_cartao(job_id, stem):
    """O `guid` da nota de um Cartão: o mesmo a cada volta, para a retomada reconhecer a nota que este Envio já gravou."""
    return "pm" + hashlib.sha1(("%s\x1f%s" % (job_id, stem)).encode("utf-8")).hexdigest()[:20]


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


def _gravar_json(caminho, dados):
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    provisorio = caminho + ".novo"
    with open(provisorio, "w", encoding="utf-8") as arquivo:
        json.dump(dados, arquivo, ensure_ascii=False, indent=2)
    os.replace(provisorio, caminho)


def _canonico(dados):
    return json.dumps(dados, ensure_ascii=False, sort_keys=True)


def cartoes_da_frase(motor, lang, linha):
    """Os Cartões de uma linha de mineração: [(stem, Palavra)], na ordem; vazio se a linha não se lê."""
    entrada = motor.parser.parse_mining_line_ru(linha) if lang == "ru" else motor.parser.parse_mining_line(linha)
    if entrada is None:
        return entrada, []
    return entrada, [(job.filename_stem, job.keyword) for job in motor.parser.get_card_jobs(entrada)]


def validar_pedido(corpo):
    """O pedido de `POST /jobs` normalizado, ou (status, erro) se ele não serve."""
    if not id_valido(corpo.get("jobId")):
        return None, (400, "invalid_job_id")
    if corpo.get("lang") not in IDIOMAS:
        return None, (400, "invalid_lang")
    deck = corpo.get("deckName")
    if not isinstance(deck, str) or not deck.strip() or len(deck) > 256:
        return None, (400, "invalid_request")
    entradas = corpo.get("entries")
    if not isinstance(entradas, list) or not entradas:
        return None, (400, "entries_required")
    limpas = []
    for entrada in entradas:
        if not isinstance(entrada, dict) or not isinstance(entrada.get("line"), str) or not ids_unicos([entrada.get("phraseId")]):
            return None, (400, "entries_required")
        limpas.append({"phraseId": ids_unicos([entrada["phraseId"]])[0], "line": entrada["line"]})
    tts = corpo.get("tts") if isinstance(corpo.get("tts"), dict) else {}
    return {
        "jobId": corpo["jobId"],
        "lang": corpo["lang"],
        "deckName": deck.strip(),
        "imageSource": str(corpo.get("imageSource") or "1"),
        "tts": {chave: str(valor) for chave, valor in tts.items() if isinstance(valor, str)},
        "entries": limpas,
    }, None


class Fila:
    """A fila e o estado, únicos donos dos arquivos do Envio. Toda leitura-e-escrita passa pela tranca."""

    def __init__(self, dados, motor):
        self.dados = dados
        self.motor = motor
        self.tranca = threading.RLock()
        self.mudou = threading.Event()

    # -- caminhos --
    def _arquivo_da_fila(self):
        return os.path.join(self.dados.fila, "fila.json")

    def _arquivo_do_pedido(self, job_id):
        return os.path.join(self.dados.fila, job_id + ".json")

    def _arquivo_do_estado(self, job_id):
        return os.path.join(self.dados.estado, job_id + ".json")

    def pasta_dos_textos(self, job_id):
        return os.path.join(self.dados.estado, job_id)

    def pasta_dos_custos(self, job_id):
        return os.path.join(self.dados.custos, job_id)

    # -- leitura --
    def ordem(self):
        return _ler_json(self._arquivo_da_fila(), {"jobs": []}).get("jobs", [])

    def pedido(self, job_id):
        return _ler_json(self._arquivo_do_pedido(job_id), None) if id_valido(job_id) else None

    def estado(self, job_id):
        return _ler_json(self._arquivo_do_estado(job_id), {})

    def listar(self):
        with self.tranca:
            return [dict(item, state=self.estado(item["jobId"])) for item in self.ordem()]

    def item_da_fila(self, job_id):
        return next((item for item in self.ordem() if item.get("jobId") == job_id), None)

    # -- escrita --
    def _gravar_estado(self, job_id, estado, status_da_fila=True):
        estado["updatedAt"] = agora_local()
        _gravar_json(self._arquivo_do_estado(job_id), estado)
        if status_da_fila:
            ordem = self.ordem()
            for item in ordem:
                if item["jobId"] == job_id:
                    item["status"] = estado["status"]
                    item["updatedAt"] = estado["updatedAt"]
            _gravar_json(self._arquivo_da_fila(), {"jobs": ordem})

    def criar(self, corpo):
        """`POST /jobs`: (status, resposta). O mesmo pedido de novo devolve o Envio que já existe, sem gravar nada."""
        pedido, recusa = validar_pedido(corpo)
        if recusa:
            return recusa[0], {"error": recusa[1]}
        job_id = pedido["jobId"]
        with self.tranca:
            existente = self.pedido(job_id)
            if existente is not None:
                sem_hora = {chave: valor for chave, valor in existente.items() if chave != "createdAt"}
                if _canonico(sem_hora) != _canonico(pedido):
                    return 409, {"error": "job_conflict"}
                return 201, {"jobId": job_id, "status": self.estado(job_id).get("status", QUEUED)}
            criado_em = agora_local()
            cartoes = {}
            for entrada in pedido["entries"]:
                _, da_frase = cartoes_da_frase(self.motor, pedido["lang"], entrada["line"])
                for stem, palavra in da_frase:
                    cartoes.setdefault(stem, {"phraseId": entrada["phraseId"], "keyword": palavra, "status": PENDENTE, "error": None})
            estado = {
                "jobId": job_id, "status": QUEUED, "stage": QUEUED, "completedStages": [], "progress": {},
                "successfulPhraseIds": [], "failedPhraseIds": [], "duplicatePhraseIds": [], "lastError": None,
                "updatedAt": criado_em, "cards": cartoes,
            }
            # O pedido primeiro, a fila por último: um Envio só existe para a thread quando está na fila.
            _gravar_json(self._arquivo_do_pedido(job_id), dict(pedido, createdAt=criado_em))
            _gravar_json(self._arquivo_do_estado(job_id), estado)
            ordem = self.ordem()
            ordem.append({"jobId": job_id, "lang": pedido["lang"], "status": QUEUED, "createdAt": criado_em, "updatedAt": criado_em})
            _gravar_json(self._arquivo_da_fila(), {"jobs": ordem})
        self.mudou.set()
        return 201, {"jobId": job_id, "status": QUEUED}

    def tentar_de_novo(self, job_id):
        """`POST /jobs/retry`: (status, resposta). Já na fila ou rodando, só diz o estado; nada é gravado."""
        with self.tranca:
            if self.pedido(job_id) is None:
                return 404, {"error": "job_not_found"}
            estado = self.estado(job_id)
            if estado.get("status") in (QUEUED, RUNNING):
                return 200, {"jobId": job_id, "status": estado["status"]}
            pasta = self.pasta_dos_textos(job_id)
            for stem, cartao in estado.get("cards", {}).items():
                if cartao["status"] == FALHOU:
                    pronto = os.path.exists(os.path.join(pasta, stem + ".txt"))
                    cartao.update(status=TEXTO if pronto else PENDENTE, error=None)
            estado.update(status=QUEUED, stage=QUEUED, lastError=None, progress={})
            self._gravar_estado(job_id, estado)
        self.mudou.set()
        return 200, {"jobId": job_id, "status": QUEUED}

    def reservar_o_proximo(self):
        """O próximo Envio da fila, já marcado `running` no estado e na fila juntos; None se não há."""
        with self.tranca:
            for item in self.ordem():
                if item.get("status") == QUEUED:
                    estado = self.estado(item["jobId"])
                    estado.update(status=RUNNING)
                    self._gravar_estado(item["jobId"], estado)
                    return item["jobId"]
        return None

    def recuperar_os_interrompidos(self):
        """A Conexão subiu com Envios `running` (o Anki fechou no meio): voltam à fila e continuam de onde pararam."""
        with self.tranca:
            for item in self.ordem():
                if item.get("status") == RUNNING:
                    estado = self.estado(item["jobId"])
                    estado.update(status=QUEUED, stage=QUEUED)
                    self._gravar_estado(item["jobId"], estado)

    def mudar(self, job_id, mudanca):
        """Aplica `mudanca(estado)` ao estado guardado e grava, sob a tranca; devolve o estado novo."""
        with self.tranca:
            estado = self.estado(job_id)
            anterior = estado.get("status")
            mudanca(estado)
            novo = estado.get("status")
            if anterior in TRANSICOES and novo != anterior and novo not in TRANSICOES[anterior]:
                raise ValueError("Envio não pode ir de %s para %s" % (anterior, novo))
            self._gravar_estado(job_id, estado, status_da_fila=novo != anterior)
            return estado


def resolver(pedido, estado):
    """O fim do Envio pelo estado guardado de cada Cartão (as regras de `settle` de `bridge/envio.py`)."""
    pedidas = ids_unicos(entrada.get("phraseId") for entrada in pedido.get("entries", []))
    por_frase = {}
    for cartao in estado.get("cards", {}).values():
        por_frase.setdefault(cartao["phraseId"], []).append(cartao["status"])
    no_anki = [frase for frase in pedidas if por_frase.get(frase) and all(s in NO_ANKI for s in por_frase[frase])]
    duplicadas = [frase for frase in no_anki if all(s == DUPLICADO for s in por_frase[frase])]
    falharam = [frase for frase in pedidas if frase not in no_anki]
    status = COMPLETED if pedidas and not falharam else (PARTIAL if no_anki else FAILED)
    return status, no_anki, falharam, duplicadas


class Trabalho:
    """Faz um Envio: confere a chave e o tipo de nota, gera o texto de cada Cartão e grava cada nota."""

    def __init__(self, fila, colecao, cofre, logger, openai_base, parar, espera_do_anki=2.0, esperas_da_openai=(2, 8, 30)):
        self.fila = fila
        self.motor = fila.motor
        self.colecao = colecao
        self.cofre = cofre
        self.logger = logger
        self.openai_base = openai_base
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
                self._dormir(self.espera_do_anki)
                continue
            if esperando_desde not in (None, QUEUED, "wait_anki"):
                self._etapa(job_id, esperando_desde)
            return resultado

    def _cartao(self, job_id, stem, **mudanca):
        self.fila.mudar(job_id, lambda estado: estado["cards"][stem].update(mudanca))

    def _terminar(self, job_id, pedido, erro=None):
        def mudanca(estado):
            status, no_anki, falharam, duplicadas = resolver(pedido, estado)
            if erro:
                status = PARTIAL if no_anki else FAILED
            primeiro = next((c["error"] for c in estado["cards"].values() if c["status"] == FALHOU and c["error"]), None)
            estado.update(
                status=status, stage=status, successfulPhraseIds=no_anki, failedPhraseIds=falharam, duplicatePhraseIds=duplicadas,
                progress={}, lastError=None if status == COMPLETED else (erro or primeiro or CARTOES_FALHARAM),
            )

        estado = self.fila.mudar(job_id, mudanca)
        self.logger.info("Envio %s: %s (%s)", job_id, estado["status"], estado["lastError"] or "sem erro")

    def _configuracao(self, pedido, chave):
        config = self.motor.config_loader.load_config(openai_api_key=chave)
        config["lang"] = pedido["lang"]
        config["anki"]["deck_name"] = pedido["deckName"]
        do_idioma = config.get("languages", {}).get(pedido["lang"], {})
        config["anki"]["note_type"] = do_idioma.get("note_type") or config["anki"]["note_type"]
        config["anki"]["fields"] = do_idioma.get("fields") or config["anki"]["fields"]
        pasta_do_motor = os.path.dirname(os.path.abspath(self.motor.config_loader.__file__))
        config["paths"]["prompts"] = {chave_: os.path.join(pasta_do_motor, caminho) for chave_, caminho in config["paths"]["prompts"].items()}
        config["paths"]["output_dir"] = self.fila.pasta_dos_textos(pedido["jobId"])
        config["paths"]["log_dir"] = self.fila.pasta_dos_custos(pedido["jobId"])
        return config

    # -- o Envio --
    def fazer(self, job_id):
        pedido = self.fila.pedido(job_id)
        chave = self.cofre.ler("openai")
        if not chave:
            return self._terminar(job_id, pedido, SEM_CHAVE)
        config = self._configuracao(pedido, chave)
        chave = None  # daqui em diante só o `config` do motor a leva, até o pedido à OpenAI
        tipo, campos = config["anki"]["note_type"], config["anki"]["fields"]
        nomes = self._com_a_colecao(job_id, lambda: self.colecao.tipo_de_nota(tipo))
        if nomes is None or not {campos["front"], campos["back"]} <= set(nomes):
            self.logger.warning("Envio %s: a coleção não tem o tipo de nota %r com os campos %r", job_id, tipo, campos)
            return self._terminar(job_id, pedido, SEM_TIPO_DE_NOTA)
        parada = self._gerar_os_textos(job_id, pedido, config)
        if parada:
            return self._terminar(job_id, pedido, parada)
        self._gravar_as_notas(job_id, pedido, config)
        self._terminar(job_id, pedido)

    def _gerar_os_textos(self, job_id, pedido, config):
        """Gera o texto de cada Cartão `pending`; devolve o código que para o Envio, ou None."""
        estado = self.fila.estado(job_id)
        faltam = [stem for stem, cartao in estado["cards"].items() if cartao["status"] == PENDENTE]
        total = len(estado["cards"])
        feitos = total - len(faltam)
        self._etapa(job_id, "generate_cards", progress={"done": feitos, "total": total})
        for entrada in pedido["entries"]:
            frase, da_frase = cartoes_da_frase(self.motor, pedido["lang"], entrada["line"])
            stems = [stem for stem, _ in da_frase if stem in faltam]
            if not stems:
                continue
            falhas = self._gerar_com_espera(frase, config, stems)
            for stem in stems:
                if stem in falhas:
                    self._cartao(job_id, stem, status=FALHOU, error=falhas[stem])
                else:
                    self._cartao(job_id, stem, status=TEXTO, error=None)
                feitos += 1
            self._etapa(job_id, "generate_cards", progress={"done": feitos, "total": total})
            parada = next((codigo for codigo in falhas.values() if codigo in PARA_O_ENVIO), None)
            if parada:
                return parada
        self._etapa(job_id, "generate_cards", concluida=True)
        return None

    def _gerar_com_espera(self, frase, config, stems):
        """Os textos de uma Frase, tentando de novo os Cartões que falharam por um motivo passageiro; devolve {stem: código}."""
        falhas = {}
        for espera in (None,) + self.esperas_da_openai:
            if espera is not None:
                self._dormir(espera)
            falhas = {}
            self.motor.generate_cards.run([frase], config, openai_base=self.openai_base, skip_existing=True, failures=falhas)
            falhas = {stem: codigo for stem, codigo in falhas.items() if stem in stems}
            if not falhas or any(codigo not in PASSAGEIROS for codigo in falhas.values()):
                return falhas
        return falhas

    def _gravar_as_notas(self, job_id, pedido, config):
        envio = self.motor.send_to_anki
        lang, baralho = pedido["lang"], pedido["deckName"]
        tipo, campos = config["anki"]["note_type"], config["anki"]["fields"]
        estado = self.fila.estado(job_id)
        prontos = [stem for stem, cartao in estado["cards"].items() if cartao["status"] == TEXTO]
        self._etapa(job_id, "send_to_anki", progress={"done": 0, "total": len(prontos)})
        if not prontos:
            return
        guids = {stem: guid_do_cartao(job_id, stem) for stem in prontos}
        ja_gravados = self._com_a_colecao(job_id, lambda: self.colecao.guids_existentes(list(guids.values())))
        cartoes_do_baralho = self._com_a_colecao(job_id, lambda: self.colecao.cartoes_do_baralho(baralho))
        frentes = {
            envio._normalize_front_text(valor, lang)
            for cartao in cartoes_do_baralho for nome, valor in cartao["campos"] if nome == campos["front"] and valor
        }
        pasta = self.fila.pasta_dos_textos(job_id)
        for feitos, stem in enumerate(prontos, start=1):
            with open(os.path.join(pasta, stem + ".txt"), encoding="utf-8") as arquivo:
                conteudo = arquivo.read().replace("## Anki Card", "").strip()
            frente = envio._build_front(conteudo, None, lang=lang)
            verso = envio._build_back(conteudo, None, None, lang=lang)
            normalizada = envio._normalize_front_text(frente, lang)
            if guids[stem] in ja_gravados:
                self._cartao(job_id, stem, status=ADICIONADO, error=None)
            elif normalizada in frentes:
                self._cartao(job_id, stem, status=DUPLICADO, error=None)
            else:
                try:
                    self._com_a_colecao(job_id, lambda: self.colecao.adicionar_nota(
                        baralho, tipo, {campos["front"]: frente, campos["back"]: verso}, envio._extract_tags_from_card(conteudo), guids[stem]))
                except baralhos.TipoDeNotaAusente:
                    self._cartao(job_id, stem, status=FALHOU, error=SEM_TIPO_DE_NOTA)
                except Interrompido:
                    raise
                except Exception:
                    self.logger.exception("Envio %s: o Anki não gravou o Cartão %s", job_id, stem)
                    self._cartao(job_id, stem, status=FALHOU, error=FALHA_AO_GRAVAR)
                else:
                    frentes.add(normalizada)
                    self._cartao(job_id, stem, status=ADICIONADO, error=None)
            self._etapa(job_id, "send_to_anki", progress={"done": feitos, "total": len(prontos)})
        self._etapa(job_id, "send_to_anki", concluida=True)


class Trabalhador:
    """A thread de trabalho: tira um Envio da fila de cada vez. Nenhum erro dela sai do logger."""

    def __init__(self, trabalho, intervalo=1.0):
        self.trabalho = trabalho
        self.fila = trabalho.fila
        self.parar = trabalho.parar
        self.intervalo = intervalo
        self._thread = None

    def iniciar(self):
        self.fila.recuperar_os_interrompidos()
        self._thread = threading.Thread(target=self._rodar, name="perpetualminer-envio", daemon=True)
        self._thread.start()

    def _rodar(self):
        logger = self.trabalho.logger
        while not self.parar.is_set():
            job_id = None
            try:
                job_id = self.fila.reservar_o_proximo()
                if job_id is None:
                    self.fila.mudou.wait(self.intervalo)
                    self.fila.mudou.clear()
                    continue
                logger.info("Envio %s: começou", job_id)
                self.trabalho.fazer(job_id)
            except Interrompido:
                return
            except Exception:
                logger.exception("Envio: erro inesperado na thread de trabalho")
                if job_id is not None:
                    self._falhou(job_id)
                self.parar.wait(self.intervalo)

    def _falhou(self, job_id):
        try:
            self.trabalho._terminar(job_id, self.fila.pedido(job_id) or {}, "internal_error")
        except Exception:
            self.trabalho.logger.exception("Envio %s: não deu para gravar a falha", job_id)

    def encerrar(self):
        self.parar.set()
        self.fila.mudou.set()
        if self._thread is not None:
            self._thread.join(timeout=5)
            self._thread = None


def pacote_de_diagnostico(fila, job_id, versao, caminho_do_log, custos):
    """O pacote de diagnóstico de um Envio: o pedido, o estado, os custos, os arquivos dele e as linhas do log que o citam.

    Nada da pasta `chaves` entra, e o log nunca tem a chave (`registro.py`)."""
    arquivos = []
    for pasta in (fila.pasta_dos_textos(job_id), fila.pasta_dos_custos(job_id)):
        for raiz, _, nomes in os.walk(pasta):
            for nome in sorted(nomes):
                arquivos.append({"path": os.path.relpath(os.path.join(raiz, nome), fila.dados.raiz).replace(os.sep, "/")})
    linhas = []
    try:
        with open(caminho_do_log, encoding="utf-8", errors="replace") as log:
            linhas = [linha.rstrip("\n") for linha in log if job_id in linha][-200:]
    except OSError:
        pass
    registros = custos.registros(fila, job_id)
    pedido = fila.pedido(job_id)
    return {
        "generatedAt": agora_utc(),
        "jobId": job_id,
        "versao": versao,
        "job": pedido,
        "state": fila.estado(job_id),
        "queueItem": fila.item_da_fila(job_id),
        "costs": registros,
        "costSummary": custos.resumir(registros, custos.dia(pedido.get("createdAt")), None, None),
        "artifacts": sorted(arquivos, key=lambda a: a["path"]),
        "logTail": linhas,
    }


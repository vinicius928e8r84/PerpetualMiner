"""O Envio dentro da Conexão (#142): a fila, o estado de cada Cartão e o trabalho que os faz (a thread: `trabalhador.py`).

Desenho: `docs/design/envio-no-complemento.md`. Estados (a máquina e a tabela: `estado_do_envio.py`; o portão: `Fila.mudar`, em `fila_do_envio.py`): `queued` →
`running` (`generate_cards`, `wait_anki` ou `send_to_anki`) ⇄ esperando → `completed` | `partial` | `failed`, e apagado; uma Frase está no Anki quando
todos os Cartões dela estão (`settle`). O estado também é **por Cartão** (`cards`: `pending` → `text` → `added` | `duplicate`,
ou `failed` com o `error`; `added` leva o `guid` da nota): a retomada não refaz nada pronto. Um Cartão é (`phraseId`, posição da Palavra), `<phraseId>-<n>`.

Os arquivos em `user_files` e quem os lê e grava (a `Fila`): `fila_do_envio.py`.

A rede (a OpenAI e a voz do Google, `audio_do_cartao.py`) é da thread de trabalho; cada nota é gravada pelo adaptador da
coleção (`gravar_cartao`, na thread principal do Anki). Sem coleção, sincronizando ou ocupado, ele levanta `ColecaoIndisponivel`
e a thread espera, sem prazo. A chave (ou o login do ChatGPT) é lida antes de cada pedido de texto, só para ele; os erros são
códigos, nunca o texto da OpenAI.
"""

import functools
import hashlib
import os
from dataclasses import dataclass

from . import baralhos, voz
from .audio_do_cartao import FRASE_APAGADA, AudioDoCartao, VozDeReserva, VozDoGoogle
from .correcao_da_criacao import CorrecaoDaCriacao
from .fila_do_envio import ADICIONADO, DUPLICADO, FALHOU, NO_ANKI, TEXTO, Fila, frase_inteira_no_anki, id_do_cartao
from .gravacao_de_json import apagar as _apagar, gravar_json as _gravar_json
from .configuracao import OPENVERSE_BASE, VOZ_BASE
from .imagem_do_cartao import ImagemDoCartao, ParaOEnvio
from .ia_do_envio import EsperasDaPorta, IaDoEnvio, SemQuemPague
from .limite_do_plano import EsperaDoEnvio, dizer_a_espera
from .login_do_chatgpt import RECUSOU, SAIU
from .motor_do_cartao import Cartao, EsperasDaOpenai, MotorDoCartao
from .motor_do_envio import configuracao_do_motor, motor_do_complemento
from .paradas_do_envio import Apagado, Interrompido  # noqa: F401  (`envio.Interrompido`)
from .tipo_do_envio import TipoDoEnvio
from .pedido_do_envio import ETIQUETA_DE_TESTE, id_que_serve_de_caminho, id_valido, ids_unicos, impressao, visao_do_pedido

from . import estado_do_envio
from .estado_do_envio import COMPLETED, FAILED, FIM, PARTIAL, QUEUED, RUNNING

SEM_CHAVE = "openai_key_missing"
SEM_TIPO_DE_NOTA = "note_type_missing"
FALHA_AO_GRAVAR = "anki_write_failed"
PARA_O_ENVIO = ("openai_key_rejected", "openai_no_credit", SAIU, "chatgpt_not_eligible", RECUSOU)


def guid_do_cartao(job_id, cartao):
    """O `guid` da nota de um Cartão: o mesmo a cada volta, para a retomada reconhecer a nota que este Envio já gravou."""
    return "pm" + hashlib.sha1(("%s\x1f%s" % (job_id, cartao)).encode("utf-8")).hexdigest()[:20]


def resolver(pedido, estado):
    """O fim do Envio pelo estado guardado de cada Cartão: o status e as Frases pedidas que chegaram ao Anki, as que falharam e, das que
    chegaram, as que já estavam lá (todos os Cartões `duplicate`)."""
    por_frase = _status_por_frase(estado)
    no_anki, falharam, duplicadas = [], [], []
    for frase in ids_unicos(entrada.get("phraseId") for entrada in pedido.get("entries", [])):
        status_dos_cartoes = por_frase.get(frase, ())
        if not frase_inteira_no_anki(status_dos_cartoes):
            falharam.append(frase)
            continue
        no_anki.append(frase)
        if all(status == DUPLICADO for status in status_dos_cartoes):
            duplicadas.append(frase)
    return _status_do_fim(no_anki, falharam), no_anki, falharam, duplicadas


def _status_por_frase(estado):
    por_frase = {}
    for cartao in estado.get("cards", {}).values():
        por_frase.setdefault(cartao["phraseId"], []).append(cartao["status"])
    return por_frase


def _status_do_fim(no_anki, falharam):
    if no_anki and not falharam:
        return COMPLETED
    return PARTIAL if no_anki else FAILED


def _terminar_o_estado(pedido, erro, estado):
    """A mudança do fim do Envio pelo estado de cada Cartão (`resolver`); com `erro` (o código que parou o Envio) ele é `partial` ou
    `failed`. O `lastError` é o `erro`, senão o do primeiro Cartão que falhou, senão o motivo das Frases sem Cartão. O apagado fica como está."""
    if estado.get("wiped"):
        return
    status, no_anki, falharam, duplicadas = resolver(pedido, estado)
    if erro:
        status = PARTIAL if no_anki else FAILED
    primeiro = next((c["error"] for c in estado["cards"].values() if c["status"] == FALHOU and c["error"]), None)
    estado_do_envio.terminar(
        estado, status, successfulPhraseIds=no_anki, failedPhraseIds=falharam, duplicatePhraseIds=duplicadas,
        lastError=None if status == COMPLETED else (erro or primeiro or estado_do_envio.sem_cartao(pedido, falharam)),
    )


@dataclass(frozen=True)
class EnvioEmAndamento:
    """Um Envio enquanto o `Trabalho` faz os Cartões dele: o id, o pedido guardado, a configuração do motor para ele (`motor_do_envio`), a
    porta da IA presa a ele (`ia_do_envio.IaDoEnvio`) e o tipo de nota conferido no começo (`TipoDoEnvio`)."""

    job_id: str
    pedido: dict
    config: dict
    ia: IaDoEnvio
    tipo: TipoDoEnvio

    def cartao(self, cartao_id, guid, linha):
        """O Cartão como o Motor do Cartão o vê."""
        return Cartao(cartao_id, guid, linha, self.pedido, self.config, self.job_id)


class Trabalho:
    """Faz um Envio: confere o tipo de nota e, Cartão a Cartão, acha a nota no Anki, gera o texto, monta a nota e a grava."""

    def __init__(self, fila, colecao, ia, logger, openai_base, parar, espera_do_anki=2.0, esperas_da_openai=(2, 8, 30),
                 voz_base=VOZ_BASE, openverse_base=OPENVERSE_BASE, adaptador_de_imagem=None, espera_do_plano=300, teto=None, espera_do_teto=60):
        self.fila, self.ia = fila, ia
        self.correcao = CorrecaoDaCriacao(fila, colecao, fila.motor, logger)
        self.da_porta = EsperasDaPorta(teto, do_teto=espera_do_teto, do_plano=espera_do_plano)
        self.motor = fila.motor
        self.colecao = colecao
        self.logger = logger
        self.parar = parar
        self.espera_do_anki = espera_do_anki
        esperas = EsperasDaOpenai(parar, esperas_da_openai)
        audio = AudioDoCartao(self.motor, logger, VozDoGoogle(voz_base, esperas), VozDeReserva(openai_base, fila.tranca, logger))
        self.motor_do_cartao = MotorDoCartao(self.motor, esperas, audio, ImagemDoCartao(self.motor, logger, openverse_base, adaptador_de_imagem))

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
                    esperando_desde = self._comecar_a_esperar_o_anki(job_id, motivo)
                self._esperar_o_anki(job_id, motivo)
                continue
            if esperando_desde is not None:
                dizer_a_espera(self.fila, job_id, None)
            if esperando_desde not in (None, QUEUED, "wait_anki"):
                self._etapa(job_id, esperando_desde)
            return resultado

    def _comecar_a_esperar_o_anki(self, job_id, motivo):
        """O Envio passa a `wait_anki`; devolve a etapa em que estava, para voltar a ela quando a coleção responder."""
        etapa = self.fila.estado(job_id).get("stage")
        self.logger.info("Envio %s: esperando o Anki (%s)", job_id, motivo)
        self._etapa(job_id, "wait_anki")
        return etapa

    def _esperar_o_anki(self, job_id, motivo):
        """Uma volta da espera pelo Anki: o estado diz por que espera, o perfil marcado é aberto se nenhum está e, depois da pausa, o
        Envio apagado no meio para (`Apagado`)."""
        dizer_a_espera(self.fila, job_id, baralhos.espera_pelo_perfil(motivo))
        if str(motivo) == "collection_not_open":
            self._entrar_no_perfil(job_id)
        self._dormir(self.espera_do_anki)
        if self.fila.estado(job_id).get("wiped"):
            raise Apagado()

    def _entrar_no_perfil(self, job_id):
        """O Anki está na tela de perfis (ou fechado o perfil): ninguém estuda, e a Conexão abre o perfil marcado. Com um perfil aberto o
        adaptador não faz nada, e a troca só vem do clique da pessoa."""
        try:
            if self.colecao.entrar_no_perfil_fixo():
                self.logger.info("Envio %s: o Anki estava sem perfil aberto; a Conexão abriu o perfil marcado", job_id)
        except Exception as erro:
            self.logger.warning("Envio %s: não deu para abrir o perfil marcado (%s)", job_id, type(erro).__name__)

    def _cartao(self, job_id, cartao_id, **mudanca):
        self.fila.mudar(job_id, lambda estado: estado["cards"][cartao_id].update(mudanca))

    def _terminar(self, job_id, pedido, erro=None):
        estado = self.fila.mudar(job_id, functools.partial(_terminar_o_estado, pedido, erro))
        self.logger.info("Envio %s: %s (%s)", job_id, estado["status"], estado["lastError"] or "sem erro")

    def fazer(self, job_id):
        self.ia.novo_envio()
        pedido = self.fila.pedido(job_id)
        if self.fila.estado_ou_refazer(job_id).get("wiped"):
            return
        config = configuracao_do_motor(self.motor, self.fila, pedido)
        try:
            tipo = TipoDoEnvio.conferir(self.colecao, pedido, lambda leitura: self._com_a_colecao(job_id, leitura))
        except Apagado:
            return
        if not tipo.serve:
            self.logger.warning("Envio %s: o tipo de nota %r não tem os campos do Cartão", job_id, tipo.nome)
            return self._terminar(job_id, pedido, SEM_TIPO_DE_NOTA)
        ia = IaDoEnvio(self.ia, EsperaDoEnvio(self.fila, job_id, self.parar), self.logger, self.da_porta)
        try:
            self._os_cartoes(EnvioEmAndamento(job_id, pedido, config, ia, tipo))
        except Apagado:
            self.logger.info("Envio %s: parou, as Frases foram apagadas", job_id)

    def _os_cartoes(self, envio):
        job_id = envio.job_id
        parada = None
        total = len(self.fila.estado(job_id)["cards"])
        for cartao_id in list(self.fila.estado(job_id)["cards"]):
            estado = self.fila.estado(job_id)
            if estado.get("wiped"):
                return
            cartao = estado["cards"][cartao_id]
            if cartao["status"] in NO_ANKI:
                self.fila.cartao_chegou(job_id, cartao_id)
                continue
            feitos = sum(1 for c in estado["cards"].values() if c["status"] in NO_ANKI)
            self._etapa(job_id, "generate_cards", progress={"done": feitos, "total": total})
            parada = self._um_cartao(envio, cartao_id, cartao, parada) or parada
        self.correcao.corrigir(job_id, envio.pedido, envio.config, envio.ia, parada)
        self._etapa(job_id, "send_to_anki", concluida=True)
        self._terminar(job_id, envio.pedido, parada)

    def _um_cartao(self, envio, cartao_id, cartao, parada):
        """Faz um Cartão: o `guid` antes de tudo (a nota já está: nada se gera nem se paga), depois o texto e a nota.
        Devolve o código que para o Envio, ou None."""
        job_id = envio.job_id
        guid = guid_do_cartao(job_id, cartao_id)
        if guid in self._com_a_colecao(job_id, lambda: self.colecao.guids_existentes([guid])):
            self._cartao(job_id, cartao_id, status=ADICIONADO, error=None, guid=guid)
            self.fila.cartao_chegou(job_id, cartao_id)
            return None
        envio.ia.conferir_o_teto()
        arquivo = self.fila.arquivo_do_texto(job_id, cartao_id)
        if not os.path.exists(arquivo):
            if parada:
                return None
            pronto, codigo = self._escrever_o_texto(envio, cartao_id, cartao["phraseId"], guid)
            if not pronto:
                return codigo
        try:
            self._gravar_a_nota(envio, cartao_id, guid, arquivo)
        except ParaOEnvio as parada:
            self._cartao(job_id, cartao_id, status=FALHOU, error=parada.codigo)
            return parada.codigo
        return None

    def _escrever_o_texto(self, envio, cartao_id, frase, guid):
        """O texto pago do Cartão: o Motor do Cartão o escreve no disco e o Cartão fica `text`. Devolve (o texto está pronto, o código que
        para o Envio ou None); sem a linha da Frase, sem quem pague, com uma falha ou com as Frases apagadas no meio, ele não está."""
        job_id = envio.job_id
        linha = self.fila.linha_do_cartao(job_id, frase)
        if linha is None:
            self._cartao(job_id, cartao_id, status=FALHOU, error=FRASE_APAGADA)
            return False, None
        try:
            falha = self.motor_do_cartao.escrever(envio.cartao(cartao_id, guid, linha), envio.ia)
        except SemQuemPague as parado:
            if parado.codigo in PARA_O_ENVIO + (SEM_CHAVE,):
                return False, parado.codigo
            self._cartao(job_id, cartao_id, status=FALHOU, error=parado.codigo)
            return False, None
        if self.fila.estado(job_id).get("wiped"):
            with self.fila.tranca:
                _apagar(self.fila.arquivo_do_texto(job_id, cartao_id))
            return False, None
        dizer_a_espera(self.fila, job_id, None)
        if falha:
            self.logger.warning("Envio %s: o texto do Cartão %s não veio (%s)", job_id, cartao_id, falha)
            self._cartao(job_id, cartao_id, status=FALHOU, error=falha)
            return False, (falha if falha in PARA_O_ENVIO else None)
        self._cartao(job_id, cartao_id, status=TEXTO, error=None)
        return True, None

    def _gravar_a_nota(self, envio, cartao_id, guid, arquivo):
        job_id, pedido = envio.job_id, envio.pedido
        send_to_anki = self.motor.send_to_anki
        lang, baralho = pedido["lang"], pedido["deckName"]
        with open(arquivo, encoding="utf-8") as texto:
            conteudo = texto.read()
        linha = self.fila.linha_do_cartao(job_id, int(cartao_id.rsplit("-", 1)[0]))
        if linha is None:
            return self._cartao(job_id, cartao_id, status=FALHOU, error=FRASE_APAGADA)
        try:
            nota, arquivos = self.motor_do_cartao.montar(envio.cartao(cartao_id, guid, linha), conteudo, envio.ia, lambda etapa: self._etapa(job_id, etapa))
        except voz.ErroDaVoz as erro:
            return self._cartao(job_id, cartao_id, status=FALHOU, error=erro.codigo)
        if self.fila.estado(job_id).get("wiped"):
            raise Apagado()
        frentes = (nota["campo_da_frente"],) + self.motor.estilos.nomes_da_frente_de_antes()
        nome, frentes, nota = envio.tipo.nota_no_tipo(frentes, nota)
        self._etapa(job_id, "send_to_anki")
        try:
            resultado = self._com_a_colecao(job_id, lambda: self.colecao.gravar_cartao(
                baralho, nome, nota["campos"], nota["etiquetas"] + [ETIQUETA_DE_TESTE] * bool(pedido.get("teste")), guid,
                frentes, nota["frente_normalizada"], lambda valor: send_to_anki.normalize_front(valor, lang), arquivos))
        except baralhos.TipoDeNotaAusente:
            return self._cartao(job_id, cartao_id, status=FALHOU, error=SEM_TIPO_DE_NOTA)
        except (Interrompido, Apagado):
            raise
        except Exception as erro:
            self.logger.error("Envio %s: o Anki não gravou o Cartão %s (%s)", job_id, cartao_id, type(erro).__name__)
            return self._cartao(job_id, cartao_id, status=FALHOU, error=FALHA_AO_GRAVAR)
        self._cartao(job_id, cartao_id, status=resultado, error=None, **({"guid": guid} if resultado == ADICIONADO else {}))
        self.fila.cartao_chegou(job_id, cartao_id)

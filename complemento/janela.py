from collections import namedtuple

from . import envio, texto_da_janela

ENVIOS_LIDOS = 20
INTERVALO_S = 1.5

Estado = namedtuple("Estado", "conexao versao perfil envio ultimo_erro navegadores")
EnvioNaJanela = namedtuple("EnvioNaJanela", "progresso etapa feitos total baralho")

_ETAPAS = {
    envio.QUEUED: "naFila",
    "generate_cards": "criandoCartoes",
    "extract_prompts": "preparandoImagens",
    "generate_audio": "gerandoAudio",
    "generate_images": "escolhendoImagens",
    "wait_anki": "esperandoOAnki",
    "send_to_anki": "enviandoAoAnki",
}
_FIM = {envio.COMPLETED: "concluido", envio.PARTIAL: "concluidoEmParte", envio.FAILED: "falhou"}


def baralho_legivel(nome):
    return " › ".join(parte.strip() for parte in str(nome or "").split("::") if parte.strip())


class _Lido:
    def __init__(self, job_id, estado, baralho):
        self.job_id, self.estado, self.baralho = job_id, estado, baralho_legivel(baralho)
        cartoes = estado.get("cards") or {}
        self.total = len(cartoes)
        self.status = estado.get("status", envio.QUEUED)
        contagem = lambda *status: sum(1 for c in cartoes.values() if c.get("status") in status)
        self.adicionados, self.duplicados = contagem(envio.ADICIONADO), contagem(envio.DUPLICADO)
        self.feitos = self.adicionados + self.duplicados
        self.ativo = self.status in (envio.QUEUED, envio.RUNNING)

    def na_janela(self):
        chave = _ETAPAS.get(self.estado.get("stage"), "naFila") if self.ativo else _FIM.get(self.status, "falhou")
        return EnvioNaJanela(
            progresso=texto_da_janela.texto("ANK-02.progresso", feitos=self.feitos, total=self.total),
            etapa=texto_da_janela.texto("ENV-07." + chave),
            feitos=self.feitos,
            total=self.total,
            baralho=self.baralho,
        )

    def erro(self):
        codigo = self.estado.get("lastError")
        if self.ativo or not codigo:
            return None
        return texto_da_janela.texto("ANK-02.falhou", n=max(self.total - self.feitos, 0), baralho=self.baralho, codigo=codigo)

    def aviso_do_comeco(self):
        return texto_da_janela.texto("ANK-03.comecou", total=self.total, baralho=self.baralho)

    def aviso_do_fim(self):
        if not self.feitos:
            return texto_da_janela.texto("ANK-03.naoTerminou", baralho=self.baralho)
        partes = [texto_da_janela.texto("ANK-03.terminou", n=self.adicionados, baralho=self.baralho)]
        if self.duplicados:
            partes.append(texto_da_janela.texto("ENV-10.jaEstavam", n=self.duplicados))
        if self.total > self.feitos:
            partes.append(texto_da_janela.texto("ENV-10.naoEntraram", n=self.total - self.feitos))
        return " · ".join(partes)


class Janela:
    def __init__(self, conexao, perfil_aberto, versao, logger):
        self._conexao = conexao
        self._perfil_aberto = perfil_aberto
        self._versao = versao
        self.logger = logger
        self._ultimo_erro_registrado = None
        self._primeiro_passo = True
        self._base = set()
        self._ativos_vistos = set()
        self._fim_anunciado = set()

    def _registrar(self, o_que, erro):
        marca = (o_que, type(erro).__name__, str(erro))
        if marca != self._ultimo_erro_registrado:
            self._ultimo_erro_registrado = marca
            self.logger.exception("A janela não leu %s", o_que)

    def _perfil(self):
        try:
            nome = self._perfil_aberto()
        except Exception as erro:
            self._registrar("o perfil", erro)
            nome = None
        return nome or texto_da_janela.texto("ANK-02.semPerfil")

    def _envios(self):
        if self._conexao is None:
            return []
        try:
            fila = self._conexao.fila
            lidos = []
            for item in fila.ordem()[-ENVIOS_LIDOS:]:
                job_id = item["jobId"]
                estado = fila.estado(job_id)
                if estado:
                    lidos.append(_Lido(job_id, estado, (fila.pedido(job_id) or {}).get("deckName")))
            return lidos
        except Exception as erro:
            self._registrar("a fila de Envios", erro)
            return []

    def _situacao_da_conexao(self):
        if self._conexao is None:
            return "ANK-02.desligada"
        if self._conexao.situacao_da_passagem == "esperando":
            return "ANK-04.esperando"
        return "ANK-02.ligada" if self._conexao.no_ar else "ANK-02.desligada"

    def estado(self):
        envios = self._envios()
        agora = next((e for e in envios if e.ativo), envios[-1] if envios else None)
        terminado = next((e for e in reversed(envios) if not e.ativo), None)
        return Estado(
            conexao=texto_da_janela.texto(self._situacao_da_conexao()),
            versao=self._versao,
            perfil=self._perfil(),
            envio=agora.na_janela() if agora else None,
            ultimo_erro=terminado.erro() if terminado else None,
            navegadores=self._navegadores(),
        )

    def pareamento_na_tela(self, na_tela):
        if self._conexao is not None:
            self._conexao.pareamento.na_tela = na_tela

    def _navegadores(self):
        if self._conexao is None:
            return 0
        try:
            return self._conexao.pareamento.quantos()
        except Exception as erro:
            self._registrar("os navegadores conectados", erro)
            return 0

    def desconectar_navegadores(self):
        if self._conexao is None:
            return 0
        return self._conexao.pareamento.desconectar()

    def passo(self):
        envios = self._envios()
        if self._primeiro_passo:
            self._primeiro_passo = False
            self._base = {e.job_id for e in envios if not e.ativo}
        avisos = [aviso for aviso in map(self._aviso_novo, envios) if aviso is not None]
        return _rotulo_do_item(envios), avisos

    def _aviso_novo(self, lido):
        if lido.ativo:
            return self._comecou(lido)
        return self._terminou(lido)

    def _comecou(self, lido):
        self._base.discard(lido.job_id)
        self._fim_anunciado.discard(lido.job_id)
        if lido.job_id in self._ativos_vistos:
            return None
        self._ativos_vistos.add(lido.job_id)
        return lido.aviso_do_comeco()

    def _terminou(self, lido):
        self._ativos_vistos.discard(lido.job_id)
        if lido.job_id in self._base or lido.job_id in self._fim_anunciado:
            return None
        self._fim_anunciado.add(lido.job_id)
        return lido.aviso_do_fim()


def _rotulo_do_item(envios):
    agora = next((e for e in envios if e.ativo), None)
    if agora is None:
        return texto_da_janela.texto("ANK-01.parado")
    return texto_da_janela.texto("ANK-01.enviando", feitos=agora.feitos, total=agora.total)


def protegido(funcao, logger, o_que):
    def chamada(*argumentos):
        try:
            return funcao(*argumentos)
        except Exception:
            logger.exception("O complemento não conseguiu %s", o_que)

    return chamada


class NaTelaDoAnki:
    def __init__(self, mw, qt):
        self._mw, self._qt = mw, qt

    def mostrar_codigo(self, codigo, validade_s, ao_cancelar):
        self._qt.mostrar_codigo(self._mw, texto_da_janela.texto("ANK-05.codigo", codigo=codigo), texto_da_janela.texto("ANK-05.cancelar"), ao_cancelar)

    def fechar_codigo(self):
        self._qt.fechar_codigo(self._mw)

    def conectou(self):
        self._qt.avisar_de_outra_thread(self._mw, texto_da_janela.texto("ANK-05.conectado"))


def ligar(mw, janela, qt, modulo):
    logger = janela.logger
    janela.pareamento_na_tela(NaTelaDoAnki(mw, qt))
    abrir = protegido(lambda: qt.abrir_janela(mw, janela.estado, janela.desconectar_navegadores), logger, "abrir a janela")
    item = qt.item_do_menu(mw, texto_da_janela.texto("ANK-01.parado"), abrir)
    try:
        qt.acao_de_configuracao(mw, modulo, abrir)
    except Exception:
        logger.exception("O botão Config do complemento não abriu a janela; o Anki mostra a configuração dele")
    rotulo = [texto_da_janela.texto("ANK-01.parado")]

    def conferir():
        texto, avisos = janela.passo()
        if texto != rotulo[0]:
            rotulo[0] = texto
            item.mudar_texto(texto)
        for aviso in avisos:
            qt.aviso(aviso)

    qt.a_cada(mw, INTERVALO_S, protegido(conferir, logger, "conferir o Envio"))

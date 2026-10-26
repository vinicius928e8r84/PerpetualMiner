"""O item “PerpetualMiner…” em Ferramentas, a janela dele e os avisos do Envio (#175), sem o Qt.

`Janela` lê o que a Conexão guardou (a fila e o estado de cada Envio, `envio.py`) e o devolve já em texto da Voz (`texto_da_janela.py`):
`estado()` é o que a janela mostra e `passo()` o rótulo do item e os avisos novos. Nada daqui lê o cofre das chaves nem o pedido
das Frases: a chave da OpenAI, a Palavra e a Frase não têm por onde chegar à tela do Anki.

O Qt fica atrás de uma fronteira de cinco chamadas (`ligar`), implementada em `qt_do_anki.py`; os testes põem outra no lugar.
Todo callback que o Anki chama passa por `protegido`: um erro vai ao registro e nunca sai para o Anki, que abriria o diálogo
de erro culpando o complemento.
"""

from collections import namedtuple

from . import envio, texto_da_janela

# Quantos Envios, do mais recente para trás, o item olha a cada passo (a fila não tem limpeza: #151).
ENVIOS_LIDOS = 20
# De quanto em quanto tempo o item confere o Envio, em segundos.
INTERVALO_S = 1.5

Estado = namedtuple("Estado", "conexao versao perfil envio ultimo_erro")
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
    """O Baralho como a extensão o mostra: sem o `::` do Anki, com os níveis separados por ›."""
    return " › ".join(parte.strip() for parte in str(nome or "").split("::") if parte.strip())


class _Lido:
    """Um Envio como a janela o lê: o estado guardado e o Baralho do pedido."""

    def __init__(self, job_id, estado, baralho):
        self.job_id, self.estado, self.baralho = job_id, estado, baralho_legivel(baralho)
        cartoes = estado.get("cards") or {}
        self.total = len(cartoes)
        self.status = estado.get("status", envio.QUEUED)
        contagem = lambda *status: sum(1 for c in cartoes.values() if c.get("status") in status)  # noqa: E731
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
    """O que a janela mostra e o que o item diz, lidos da Conexão (`None`: ela não subiu).

    `perfil_aberto` devolve o nome do perfil aberto, ou None. Nada aqui levanta erro por causa da Conexão: o que não se lê
    vira “sem Envio” e vai ao registro (uma vez por erro diferente, não a cada passo)."""

    def __init__(self, conexao, perfil_aberto, versao, logger):
        self._conexao = conexao
        self._perfil_aberto = perfil_aberto
        self._versao = versao
        self._logger = logger
        self._ultimo_erro_registrado = None
        # A memória dos avisos: o que já foi anunciado, para cada Envio ganhar um aviso de começo e um de fim por vez que anda.
        self._primeiro_passo = True
        self._base = set()
        self._ativos_vistos = set()
        self._fim_anunciado = set()

    def _registrar(self, o_que, erro):
        marca = (o_que, type(erro).__name__, str(erro))
        if marca != self._ultimo_erro_registrado:
            self._ultimo_erro_registrado = marca
            self._logger.exception("A janela não leu %s", o_que)

    def _perfil(self):
        try:
            nome = self._perfil_aberto()
        except Exception as erro:
            self._registrar("o perfil", erro)
            nome = None
        return nome or texto_da_janela.texto("ANK-02.semPerfil")

    def _envios(self):
        """Os últimos Envios da fila, do mais antigo ao mais novo; vazio se a Conexão não subiu ou a fila não se lê."""
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

    def estado(self):
        envios = self._envios()
        agora = next((e for e in envios if e.ativo), envios[-1] if envios else None)
        terminado = next((e for e in reversed(envios) if not e.ativo), None)
        return Estado(
            conexao=texto_da_janela.texto("ANK-02.ligada" if self._conexao is not None else "ANK-02.desligada"),
            versao=self._versao,
            perfil=self._perfil(),
            envio=agora.na_janela() if agora else None,
            ultimo_erro=terminado.erro() if terminado else None,
        )

    def passo(self):
        """(o rótulo do item, os avisos novos): o que o item tem de dizer agora e o que ainda não foi anunciado."""
        envios = self._envios()
        avisos = []
        if self._primeiro_passo:
            self._primeiro_passo = False
            self._base = {e.job_id for e in envios if not e.ativo}  # o que terminou antes de o Anki abrir não ganha aviso
        for lido in envios:
            if lido.ativo:
                self._base.discard(lido.job_id)
                self._fim_anunciado.discard(lido.job_id)
                if lido.job_id not in self._ativos_vistos:
                    self._ativos_vistos.add(lido.job_id)
                    avisos.append(lido.aviso_do_comeco())
            else:
                self._ativos_vistos.discard(lido.job_id)
                if lido.job_id not in self._base and lido.job_id not in self._fim_anunciado:
                    self._fim_anunciado.add(lido.job_id)
                    avisos.append(lido.aviso_do_fim())
        agora = next((e for e in envios if e.ativo), None)
        if agora is None:
            return texto_da_janela.texto("ANK-01.parado"), avisos
        return texto_da_janela.texto("ANK-01.enviando", feitos=agora.feitos, total=agora.total), avisos


def protegido(funcao, logger, o_que):
    """A mesma função, sem nunca levantar: o Anki chama estes callbacks, e um erro que sai deles abre o diálogo de erro dele."""
    def chamada(*argumentos):
        try:
            return funcao(*argumentos)
        except Exception:
            logger.exception("O complemento não conseguiu %s", o_que)

    return chamada


def ligar(mw, janela, qt, modulo, logger):
    """Põe no Anki o item de Ferramentas, o botão Config do complemento `modulo` e a conferência do Envio, pela fronteira `qt`.

    O item e o Config abrem a mesma janela. Cada passo é independente: se o Anki não aceita um, os outros ficam."""
    abrir = protegido(lambda: qt.abrir_janela(mw, janela.estado), logger, "abrir a janela")
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

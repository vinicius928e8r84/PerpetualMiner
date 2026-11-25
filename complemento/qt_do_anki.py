"""A fronteira de `janela.ligar` com o Qt do Anki: a única parte do item “PerpetualMiner…” que só existe dentro do Anki.

Nada daqui roda fora do Anki (`aqt` só existe lá, e cada chamada importa o que usa), então o `unittest` não a exercita: o ensaio do
dono, num Anki de verdade, confere o item, a janela, o botão Config e os avisos. O que a janela diz vem
pronto de `janela.Janela.estado()`, já em texto da Voz. Todo callback que o Qt chama aqui passa por `janela.protegido`.
"""

import html

from . import janela, texto_da_janela


class _Item:
    def __init__(self, acao):
        self._acao = acao

    def mudar_texto(self, texto):
        self._acao.setText(texto)


class QtDoAnki:
    """As chamadas de `janela.ligar` sobre o `aqt`."""

    def __init__(self, logger):
        self._logger = logger
        self._aberta = None
        self._mostrar = None
        self._relogio = None
        self._codigo = None

    def item_do_menu(self, mw, texto, ao_clicar):
        from aqt.qt import QAction, qconnect

        acao = QAction(texto, mw)
        qconnect(acao.triggered, lambda *_: ao_clicar())
        mw.form.menuTools.addAction(acao)
        return _Item(acao)

    def acao_de_configuracao(self, mw, modulo, ao_clicar):
        # Com uma ação própria, o botão Config do Anki abre a janela e não a configuração em texto cru.
        mw.addonManager.setConfigAction(modulo, ao_clicar)

    def aviso(self, texto):
        from aqt.utils import tooltip

        # O tooltip do Anki lê texto rico, e o nome do Baralho vem da extensão: `<` e `&` nunca viram marcação.
        tooltip(html.escape(texto, quote=False), period=max(4000, 80 * len(texto)))

    def _na_thread_principal(self, mw, funcao, o_que):
        """Quem chama é a thread do servidor: o Qt só se mexe na principal. Um erro vai ao registro, nunca ao Anki."""
        mw.taskman.run_on_main(janela.protegido(funcao, self._logger, o_que))

    def avisar_de_outra_thread(self, mw, texto):
        self._na_thread_principal(mw, lambda: self.aviso(texto), "avisar na tela")

    def mostrar_codigo(self, mw, texto, rotulo_de_cancelar, ao_cancelar):
        """O diálogo do código do pareamento (#192), sem travar o Anki. Um só: aberto de novo, mostra o mesmo (e o texto de agora).
        Fechá-lo (Cancelar ou o X) chama `ao_cancelar`, a menos que `fechar_codigo` o tenha fechado antes (o código certo, vencido)."""
        self._na_thread_principal(mw, lambda: self._desenhar_o_codigo(mw, texto, rotulo_de_cancelar, ao_cancelar), "mostrar o código do pareamento")

    def _desenhar_o_codigo(self, mw, texto, rotulo_de_cancelar, ao_cancelar):
        if self._codigo is not None:
            dialogo = self._codigo["dialogo"]
            self._codigo["texto"].setText(texto)
            self._codigo["ao_cancelar"] = ao_cancelar
            if not dialogo.isVisible():
                dialogo.show()
                dialogo.raise_()
                dialogo.activateWindow()
            return
        from aqt.qt import QDialog, QLabel, QPushButton, Qt, QVBoxLayout, qconnect

        dialogo = QDialog(mw)
        dialogo.setWindowTitle(texto_da_janela.texto("ANK-02.titulo"))
        dialogo.setMinimumWidth(420)
        layout = QVBoxLayout(dialogo)
        rotulo = QLabel(texto)
        rotulo.setTextFormat(Qt.TextFormat.PlainText)
        rotulo.setWordWrap(True)
        rotulo.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        layout.addWidget(rotulo)
        cancelar = QPushButton(rotulo_de_cancelar)
        qconnect(cancelar.clicked, dialogo.close)
        layout.addWidget(cancelar)
        estado = {"dialogo": dialogo, "texto": rotulo, "ao_cancelar": ao_cancelar, "fechado_por_nos": False}

        def terminou(*_):
            self._codigo = None
            dialogo.deleteLater()   # um QDialog(mw) fechado seguiria filho do Anki para sempre
            if not estado["fechado_por_nos"]:
                estado["ao_cancelar"]()

        qconnect(dialogo.finished, janela.protegido(terminou, self._logger, "fechar o código do pareamento"))
        self._codigo = estado
        dialogo.show()
        dialogo.raise_()
        dialogo.activateWindow()

    def fechar_codigo(self, mw):
        """Fecha o diálogo do código (o código certo, o que venceu ou o que gastou as tentativas): sem avisar o pareamento."""
        def fechar():
            if self._codigo is not None:
                self._codigo["fechado_por_nos"] = True
                self._codigo["dialogo"].close()

        self._na_thread_principal(mw, fechar, "fechar o código do pareamento")

    def a_cada(self, mw, segundos, funcao):
        from aqt.qt import QTimer, qconnect

        self._relogio = QTimer(mw)
        self._relogio.setInterval(int(segundos * 1000))
        qconnect(self._relogio.timeout, funcao)
        self._relogio.start()

    def abrir_janela(self, mw, ler_estado, desconectar=None):
        """Abre a janela pequena (sem travar o Anki). A janela é uma só: aberta de novo, ela é mostrada e trazida para a frente.
        `desconectar` é o que o botão Desconectar navegadores faz (#192); sem ele a janela não tem o botão."""
        if self._aberta is not None:
            self._aberta.show()
            self._aberta.raise_()
            self._aberta.activateWindow()
            self._relogio_da_janela.start()
            self._mostrar()
            return
        from aqt.qt import QTimer, qconnect

        pequena = _JanelaPequena(mw, ler_estado, self._logger, desconectar)
        relogio = QTimer(pequena.dialogo)
        relogio.setInterval(int(janela.INTERVALO_S * 1000))
        qconnect(relogio.timeout, pequena.mostrar_protegido)
        qconnect(pequena.dialogo.finished, relogio.stop)
        relogio.start()
        pequena.dialogo.show()
        pequena.mostrar_protegido()
        self._aberta, self._mostrar, self._relogio_da_janela = pequena.dialogo, pequena.mostrar_protegido, relogio


class _JanelaPequena:
    """A janela pequena do item “PerpetualMiner…”: as linhas que ela mostra e o que cada passo do relógio escreve nelas."""

    def __init__(self, mw, ler_estado, logger, desconectar):
        from aqt.qt import QDialog, QFormLayout, QLabel, QProgressBar, Qt, QVBoxLayout

        self._ler_estado, self._ultima_medida = ler_estado, None
        self.dialogo = QDialog(mw)
        self.dialogo.setWindowTitle(texto_da_janela.texto("ANK-02.titulo"))
        self.dialogo.setMinimumWidth(420)
        self.layout = QVBoxLayout(self.dialogo)
        self._formulario = QFormLayout()
        self._formulario.setFieldGrowthPolicy(QFormLayout.FieldGrowthPolicy.AllNonFixedFieldsGrow)
        self.layout.addLayout(self._formulario)
        self.conexao, self.versao, self.perfil = self._linha("ANK-02.conexao"), self._linha("ANK-02.versao"), self._linha("ANK-02.perfil")
        self.envio = self._linha("ANK-02.envio")
        self.barra, self.baralho = QProgressBar(), QLabel("")
        self.barra.setTextVisible(False)
        self.baralho.setTextFormat(Qt.TextFormat.PlainText)
        self._formulario.addRow(self.barra)
        self._formulario.addRow(self.baralho)
        self.erro = self._linha("ANK-02.erro")
        self.mostrar_protegido = janela.protegido(self.mostrar, logger, "atualizar a janela")
        self.desconectar_botao = self._botao_desconectar(desconectar, logger)
        self._botao_fechar()

    def _linha(self, rotulo):
        from aqt.qt import QLabel, Qt

        valor = QLabel("")
        valor.setTextFormat(Qt.TextFormat.PlainText)
        valor.setWordWrap(True)
        valor.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        self._formulario.addRow(texto_da_janela.texto(rotulo), valor)
        return valor

    def _botao_desconectar(self, desconectar, logger):
        if desconectar is None:
            return None
        from aqt.qt import QPushButton, qconnect

        botao = QPushButton(texto_da_janela.texto("ANK-02.desconectar"))
        qconnect(botao.clicked, janela.protegido(lambda *_: (desconectar(), self.mostrar_protegido()), logger, "desconectar os navegadores"))
        self.layout.addWidget(botao)
        return botao

    def _botao_fechar(self):
        from aqt.qt import QPushButton, qconnect

        fechar = QPushButton(texto_da_janela.texto("ANK-02.fechar"))
        qconnect(fechar.clicked, self.dialogo.close)
        self.layout.addWidget(fechar)

    def mostrar(self):
        if not self.dialogo.isVisible():
            return
        estado = self._ler_estado()
        self.conexao.setText(estado.conexao)
        self.versao.setText(estado.versao)
        self.perfil.setText(estado.perfil)
        self._mostrar_o_envio(estado.envio)
        self.erro.setText(estado.ultimo_erro or texto_da_janela.texto("ANK-02.semErro"))
        self._caber_o_texto_novo(estado.envio is not None)
        if self.desconectar_botao is not None:
            self.desconectar_botao.setEnabled(estado.navegadores > 0)

    def _mostrar_o_envio(self, atual):
        self.envio.setText("%s · %s" % (atual.progresso, atual.etapa) if atual else texto_da_janela.texto("ANK-02.semEnvio"))
        self.barra.setVisible(atual is not None)
        self.baralho.setVisible(atual is not None)
        if atual:
            self.barra.setRange(0, max(atual.total, 1))
            self.barra.setValue(atual.feitos)
            self.baralho.setText(texto_da_janela.texto("ANK-02.baralho", baralho=atual.baralho))

    def _caber_o_texto_novo(self, com_envio):
        medida = (self.conexao.text(), self.versao.text(), self.perfil.text(), self.envio.text(), self.erro.text(), self.baralho.text(), com_envio)
        if medida == self._ultima_medida:
            return
        self._ultima_medida = medida
        largura = self.dialogo.width()
        self.layout.activate()
        self.dialogo.adjustSize()
        if largura > self.dialogo.width():
            self.dialogo.resize(largura, max(self.dialogo.minimumSizeHint().height(), self.layout.totalHeightForWidth(largura)))

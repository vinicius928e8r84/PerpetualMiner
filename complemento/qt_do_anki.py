"""A fronteira de `janela.ligar` com o Qt do Anki: a única parte do item “PerpetualMiner…” que só existe dentro do Anki.

Nada daqui roda fora do Anki (`aqt` só existe lá, e cada chamada importa o que usa), então o `unittest` não a exercita: o ensaio do
dono, num Anki de verdade, confere o item, a janela, o botão Config e os avisos (`docs/design/dentro-do-anki.md`). O que a janela diz vem
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
    """As cinco chamadas de `janela.ligar` sobre o `aqt`."""

    def __init__(self, logger):
        self._logger = logger
        self._aberta = None
        self._mostrar = None
        self._relogio = None

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
        tooltip(html.escape(texto, quote=False), period=max(4000, 80 * len(texto)))  # some sozinho; o tempo acompanha o tamanho do texto

    def a_cada(self, mw, segundos, funcao):
        from aqt.qt import QTimer, qconnect

        self._relogio = QTimer(mw)
        self._relogio.setInterval(int(segundos * 1000))
        qconnect(self._relogio.timeout, funcao)
        self._relogio.start()

    def abrir_janela(self, mw, ler_estado):
        """Abre a janela pequena (sem travar o Anki). A janela é uma só: aberta de novo, ela é mostrada e trazida para a frente."""
        if self._aberta is not None:
            self._aberta.show()
            self._aberta.raise_()
            self._aberta.activateWindow()
            self._mostrar()
            return
        from aqt.qt import QDialog, QFormLayout, QLabel, QProgressBar, QPushButton, QTimer, Qt, QVBoxLayout, qconnect

        dialogo = QDialog(mw)
        dialogo.setWindowTitle(texto_da_janela.texto("ANK-02.titulo"))
        dialogo.setMinimumWidth(420)
        layout = QVBoxLayout(dialogo)
        formulario = QFormLayout()
        layout.addLayout(formulario)

        def linha(rotulo):
            valor = QLabel("")
            valor.setTextFormat(Qt.TextFormat.PlainText)  # o nome de um Baralho nunca vira marcação
            valor.setWordWrap(True)
            valor.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
            formulario.addRow(texto_da_janela.texto(rotulo), valor)
            return valor

        conexao, versao, perfil = linha("ANK-02.conexao"), linha("ANK-02.versao"), linha("ANK-02.perfil")
        envio = linha("ANK-02.envio")
        barra, baralho = QProgressBar(), QLabel("")
        barra.setTextVisible(False)
        baralho.setTextFormat(Qt.TextFormat.PlainText)
        formulario.addRow(barra)
        formulario.addRow(baralho)
        erro = linha("ANK-02.erro")
        fechar = QPushButton(texto_da_janela.texto("ANK-02.fechar"))
        qconnect(fechar.clicked, dialogo.close)
        layout.addWidget(fechar)

        def mostrar():
            if not dialogo.isVisible():
                return  # fechada, a janela não lê a Conexão
            estado = ler_estado()
            conexao.setText(estado.conexao)
            versao.setText(estado.versao)
            perfil.setText(estado.perfil)
            atual = estado.envio
            envio.setText("%s · %s" % (atual.progresso, atual.etapa) if atual else texto_da_janela.texto("ANK-02.semEnvio"))
            barra.setVisible(atual is not None)
            baralho.setVisible(atual is not None)
            if atual:
                barra.setRange(0, max(atual.total, 1))  # (0, 0) seria a barra sem fim
                barra.setValue(atual.feitos)
                baralho.setText(texto_da_janela.texto("ANK-02.baralho", baralho=atual.baralho))
            erro.setText(estado.ultimo_erro or texto_da_janela.texto("ANK-02.semErro"))

        mostrar_protegido = janela.protegido(mostrar, self._logger, "atualizar a janela")
        relogio = QTimer(dialogo)
        relogio.setInterval(int(janela.INTERVALO_S * 1000))
        qconnect(relogio.timeout, mostrar_protegido)
        relogio.start()
        dialogo.show()
        mostrar_protegido()
        self._aberta, self._mostrar = dialogo, mostrar_protegido

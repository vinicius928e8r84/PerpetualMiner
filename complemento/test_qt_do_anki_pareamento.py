"""O diálogo do código do pareamento e o botão Desconectar navegadores (#192) pedidos ao Qt do Anki (`qt_do_anki.py`), com um `aqt` de mentira que guarda
o texto de cada peça e liga o clique de cada botão. A janela de verdade num Anki de verdade é o ensaio do dono (`docs/design/pareamento-da-conexao.md` § 6).

    python3.9 complemento/test_qt_do_anki_pareamento.py
"""

import io
import logging
import os
import sys
import types
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import janela, qt_do_anki  # noqa: E402


class Sinal:
    def __init__(self):
        self.ligados = []

    def emitir(self, *argumentos):
        for ligado in self.ligados:
            ligado(*argumentos)


class _Enum:
    def __getattr__(self, nome):
        return self


class AqtComPecas:
    """O `aqt` que `QtDoAnki` usa para o código e para a janela: cada peça sabe o texto que recebeu e quem a clicou."""

    def __init__(self, quebra_ao_abrir=False):
        self.dialogos, self.botoes, self.rotulos, self.tooltips, self.relogios = [], [], [], [], []
        aqui = self

        class Dialogo:
            def __init__(self, *_):
                if quebra_ao_abrir:
                    raise RuntimeError("o Qt mudou")
                self.finished, self.visivel, self.mostradas, self.titulo = Sinal(), False, 0, None
                self.trazidas, self.ativadas, self.apagado = 0, 0, 0
                aqui.dialogos.append(self)

            def setWindowTitle(self, titulo):
                self.titulo = titulo

            def setMinimumWidth(self, *_):
                pass

            def show(self):
                self.visivel, self.mostradas = True, self.mostradas + 1

            def close(self):
                if self.visivel:
                    self.visivel = False
                    self.finished.emitir(0)

            def isVisible(self):
                return self.visivel

            def raise_(self):
                self.trazidas += 1

            def activateWindow(self):
                self.ativadas += 1

            def deleteLater(self):
                self.apagado += 1

        class Rotulo:
            def __init__(self, texto=""):
                self.texto = texto
                aqui.rotulos.append(self)

            def setText(self, texto):
                self.texto = texto

            def __getattr__(self, nome):
                return lambda *_, **__: None

        class Botao:
            def __init__(self, texto=""):
                self.texto, self.clicked, self.ligado = texto, Sinal(), True
                aqui.botoes.append(self)

            def setEnabled(self, ligado):
                self.ligado = ligado

            def __getattr__(self, nome):
                return lambda *_, **__: None

        class Relogio:
            def __init__(self, *_):
                self.timeout = Sinal()
                aqui.relogios.append(self)

            def __getattr__(self, nome):
                return lambda *_, **__: None

        class Layout:
            def __init__(self, *_):
                pass

            def __getattr__(self, nome):
                return lambda *_, **__: None

        qt = types.SimpleNamespace(
            QDialog=Dialogo, QLabel=Rotulo, QPushButton=Botao, QTimer=Relogio, QVBoxLayout=Layout, QFormLayout=Layout, QProgressBar=Layout, Qt=_Enum(),
            qconnect=lambda sinal, funcao: sinal.ligados.append(funcao))
        utils = types.SimpleNamespace(tooltip=lambda texto, period=None: self.tooltips.append(texto))
        self.modulos = {"aqt": types.SimpleNamespace(qt=qt, utils=utils), "aqt.qt": qt, "aqt.utils": utils}

    def __enter__(self):
        self._troca = mock.patch.dict(sys.modules, self.modulos)
        self._troca.__enter__()
        return self

    def __exit__(self, *erro):
        return self._troca.__exit__(*erro)


def anki_de_mentira():
    """O `mw` do Anki: `taskman.run_on_main` roda na hora, que é o que acontece na thread principal."""
    return types.SimpleNamespace(taskman=types.SimpleNamespace(run_on_main=lambda funcao: funcao()))


def estado_da_janela(navegadores):
    return types.SimpleNamespace(conexao="Ligada", versao="0.4.25", perfil="Usuário 1", envio=None, ultimo_erro=None, navegadores=navegadores)


def registro_na_memoria():
    saida = io.StringIO()
    logger = logging.getLogger("teste-qt-pareamento-%d" % id(saida))
    logger.handlers = [logging.StreamHandler(saida)]
    logger.propagate = False
    return logger, saida


class ODialogoDoCodigo(unittest.TestCase):
    def test_o_dialogo_mostra_o_texto_do_catalogo_e_e_um_so_mesmo_pedido_de_novo_sem_roubar_o_foco(self):
        with AqtComPecas() as aqt:
            qt, mw = qt_do_anki.QtDoAnki(logging.getLogger("t")), anki_de_mentira()
            qt.mostrar_codigo(mw, "Código para conectar o PerpetualMiner: K7M-4PX. Vale por 5 minutos", "Cancelar", lambda: None)
            qt.mostrar_codigo(mw, "Código para conectar o PerpetualMiner: K7M-4PX. Vale por 5 minutos", "Cancelar", lambda: None)
        dialogo = aqt.dialogos[0]
        self.assertEqual((len(aqt.dialogos), dialogo.titulo, dialogo.visivel), (1, "PerpetualMiner", True))
        self.assertEqual((dialogo.mostradas, dialogo.trazidas, dialogo.ativadas), (1, 1, 1))   # o pedido repetido, com o diálogo à vista, não o traz de novo
        self.assertEqual([r.texto for r in aqt.rotulos], ["Código para conectar o PerpetualMiner: K7M-4PX. Vale por 5 minutos"])
        self.assertEqual([b.texto for b in aqt.botoes], ["Cancelar"])

    def test_cada_dialogo_fechado_e_destruido_e_o_pedido_seguinte_abre_outro_a_frente(self):
        with AqtComPecas() as aqt:
            qt, mw = qt_do_anki.QtDoAnki(logging.getLogger("t")), anki_de_mentira()
            for _ in range(3):
                qt.mostrar_codigo(mw, "texto", "Cancelar", lambda: None)
                qt.fechar_codigo(mw)
        self.assertEqual(([d.apagado for d in aqt.dialogos], [d.trazidas for d in aqt.dialogos]), ([1, 1, 1], [1, 1, 1]))

    def test_cancelar_fecha_o_dialogo_e_avisa_o_pareamento_uma_vez(self):
        cancelados = []
        with AqtComPecas() as aqt:
            qt_do_anki.QtDoAnki(logging.getLogger("t")).mostrar_codigo(anki_de_mentira(), "texto", "Cancelar", lambda: cancelados.append(1))
            aqt.botoes[0].clicked.emitir()
        self.assertEqual((cancelados, aqt.dialogos[0].visivel), ([1], False))

    def test_fechar_pelo_x_do_dialogo_tambem_cancela(self):
        cancelados = []
        with AqtComPecas() as aqt:
            qt_do_anki.QtDoAnki(logging.getLogger("t")).mostrar_codigo(anki_de_mentira(), "texto", "Cancelar", lambda: cancelados.append(1))
            aqt.dialogos[0].close()
        self.assertEqual(cancelados, [1])

    def test_o_codigo_certo_fecha_o_dialogo_sem_contar_como_cancelamento(self):
        cancelados = []
        with AqtComPecas() as aqt:
            qt, mw = qt_do_anki.QtDoAnki(logging.getLogger("t")), anki_de_mentira()
            qt.mostrar_codigo(mw, "texto", "Cancelar", lambda: cancelados.append(1))
            qt.fechar_codigo(mw)
            qt.mostrar_codigo(mw, "outro", "Cancelar", lambda: cancelados.append(2))
        self.assertEqual((cancelados, [d.visivel for d in aqt.dialogos]), ([], [False, True]))

    def test_o_aviso_de_conectado_chega_ao_tooltip_do_anki_pela_thread_principal(self):
        chamadas = []
        mw = types.SimpleNamespace(taskman=types.SimpleNamespace(run_on_main=lambda funcao: (chamadas.append("na principal"), funcao())))
        with AqtComPecas() as aqt:
            qt_do_anki.QtDoAnki(logging.getLogger("t")).avisar_de_outra_thread(mw, "PerpetualMiner conectado")
        self.assertEqual((chamadas, aqt.tooltips), (["na principal"], ["PerpetualMiner conectado"]))

    def test_o_qt_que_quebra_vai_ao_registro_e_nunca_sai_para_o_anki(self):
        logger, saida = registro_na_memoria()
        with AqtComPecas(quebra_ao_abrir=True):
            qt_do_anki.QtDoAnki(logger).mostrar_codigo(anki_de_mentira(), "texto", "Cancelar", lambda: None)
        self.assertIn("o Qt mudou", saida.getvalue())


class OBotaoDesconectarNavegadores(unittest.TestCase):
    def abrir(self, aqt, navegadores, desconectou):
        qt = qt_do_anki.QtDoAnki(logging.getLogger("t"))
        qt.abrir_janela(anki_de_mentira(), lambda: estado_da_janela(navegadores[0]), lambda: (desconectou.append(1), navegadores.__setitem__(0, 0)))
        aqt.relogios[-1].timeout.emitir()
        return next(b for b in aqt.botoes if b.texto == "Desconectar navegadores")

    def test_o_botao_so_vale_com_navegador_conectado_e_desconectar_o_desliga(self):
        desconectou, navegadores = [], [2]
        with AqtComPecas() as aqt:
            botao = self.abrir(aqt, navegadores, desconectou)
            ligado_antes = botao.ligado
            botao.clicked.emitir()
        self.assertEqual((ligado_antes, desconectou, botao.ligado), (True, [1], False))

    def test_sem_navegador_conectado_o_botao_fica_desligado(self):
        with AqtComPecas() as aqt:
            botao = self.abrir(aqt, [0], [])
        self.assertFalse(botao.ligado)

    def test_a_janela_sem_o_desconectar_nao_tem_o_botao(self):
        with AqtComPecas() as aqt:
            qt_do_anki.QtDoAnki(logging.getLogger("t")).abrir_janela(anki_de_mentira(), lambda: estado_da_janela(1))
        self.assertNotIn("Desconectar navegadores", [b.texto for b in aqt.botoes])


if __name__ == "__main__":
    unittest.main()

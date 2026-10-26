"""O que o complemento pede ao Qt do Anki (`qt_do_anki.py`): a janela é uma só e os avisos nunca viram marcação, com um `aqt` de mentira.

    python3.9 complemento/test_qt_do_anki.py
"""

import os
import sys
import types
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import configuracao, janela, qt_do_anki, registro  # noqa: E402


class _Qualquer:
    """Qualquer nome do Qt (um enum, um sinal, um método) que a fronteira use: aceita tudo e anota o que o complemento pediu."""

    def __getattr__(self, nome):
        return self if nome[:1].isupper() else lambda *argumentos, **nomeados: None


class AqtDeMentira:
    """O `aqt` do Anki, só o que `qt_do_anki.py` importa, anotando o que o complemento pede a ele."""

    def __init__(self):
        self.tooltips, self.dialogos, self.relogios = [], [], []
        aqui = self

        class Sinal:
            def __init__(self):
                self.ligados = []

        class Dialogo(_Qualquer):
            def __init__(self, *_):
                self.finished = Sinal()
                self.visivel, self.mostradas, self.trazidas, self.ativadas = False, 0, 0, 0
                aqui.dialogos.append(self)

            def show(self):
                self.visivel, self.mostradas = True, self.mostradas + 1

            def close(self):
                self.visivel = False
                for ligado in self.finished.ligados:
                    ligado()

            def isVisible(self):
                return self.visivel

            def raise_(self):
                self.trazidas += 1

            def activateWindow(self):
                self.ativadas += 1

        class Relogio(_Qualquer):
            def __init__(self, *_):
                self.rodando = False
                aqui.relogios.append(self)

            def start(self):
                self.rodando = True

            def stop(self):
                self.rodando = False

        qt = types.SimpleNamespace(
            QDialog=Dialogo, QTimer=Relogio, Qt=_Qualquer(), qconnect=lambda sinal, funcao: sinal.ligados.append(funcao) if isinstance(sinal, Sinal) else None,
            **{nome: (lambda *_: _Qualquer()) for nome in ("QFormLayout", "QLabel", "QProgressBar", "QPushButton", "QVBoxLayout")})
        utils = types.SimpleNamespace(tooltip=lambda texto, period=None: self.tooltips.append((texto, period)))
        self.modulos = {"aqt": types.SimpleNamespace(qt=qt, utils=utils), "aqt.qt": qt, "aqt.utils": utils}

    def __enter__(self):
        self._troca = mock.patch.dict(sys.modules, self.modulos)
        self._troca.__enter__()
        return self

    def __exit__(self, *erro):
        return self._troca.__exit__(*erro)


class AFronteiraComOQtDoAnki(unittest.TestCase):
    def test_fechada_a_janela_o_relogio_para_e_aberta_de_novo_ele_volta_a_rodar(self):
        with AqtDeMentira() as aqt:
            qt = qt_do_anki.QtDoAnki(registro.silencioso())
            estado = janela.Janela(None, lambda: "Usuário 1", configuracao.VERSAO, registro.silencioso()).estado
            qt.abrir_janela(object(), estado)
            aberta = aqt.relogios[0].rodando
            aqt.dialogos[0].close()
            fechada = aqt.relogios[0].rodando
            qt.abrir_janela(object(), estado)
            reaberta = aqt.relogios[0].rodando
        self.assertEqual((aberta, fechada, reaberta), (True, False, True))

    def test_o_nome_do_baralho_no_aviso_nunca_vira_marcacao_no_tooltip_do_anki(self):
        with AqtDeMentira() as aqt:
            qt_do_anki.QtDoAnki(registro.silencioso()).aviso('12 cartões enviados ao Baralho <b>Meu</b> & "Outro"')
        self.assertEqual([texto for texto, _ in aqt.tooltips], ['12 cartões enviados ao Baralho &lt;b&gt;Meu&lt;/b&gt; &amp; "Outro"'])

    def test_o_aviso_sem_marcacao_chega_ao_tooltip_como_foi_escrito(self):
        with AqtDeMentira() as aqt:
            qt_do_anki.QtDoAnki(registro.silencioso()).aviso("Enviando 12 cartões ao Baralho Inglês")
        self.assertEqual([texto for texto, _ in aqt.tooltips], ["Enviando 12 cartões ao Baralho Inglês"])

    def test_abrir_a_janela_de_novo_depois_de_fechada_mostra_a_mesma_sem_criar_outra_janela_nem_outro_relogio(self):
        with AqtDeMentira() as aqt:
            qt = qt_do_anki.QtDoAnki(registro.silencioso())
            estado = janela.Janela(None, lambda: "Usuário 1", configuracao.VERSAO, registro.silencioso()).estado
            qt.abrir_janela(object(), estado)
            aqt.dialogos[0].close()
            qt.abrir_janela(object(), estado)
            qt.abrir_janela(object(), estado)
        dialogo = aqt.dialogos[0]
        self.assertEqual((len(aqt.dialogos), len(aqt.relogios)), (1, 1))
        self.assertEqual((dialogo.visivel, dialogo.mostradas, dialogo.trazidas, dialogo.ativadas), (True, 3, 2, 2))


if __name__ == "__main__":
    unittest.main()

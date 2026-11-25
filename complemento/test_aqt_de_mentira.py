import sys
import unittest

from complemento import texto_da_janela
from complemento.test_qt_do_anki import AqtDeMentira


class OAqtDeMentira(unittest.TestCase):
    def test_o_aqt_e_posto_no_lugar_dos_modulos_do_anki_so_dentro_do_with(self):
        antes = sys.modules.get("aqt")
        with AqtDeMentira() as aqt:
            self.assertIs(sys.modules["aqt.qt"], aqt.modulos["aqt.qt"])
            self.assertIs(sys.modules["aqt"].qt, aqt.modulos["aqt.qt"])
            self.assertIs(sys.modules["aqt.utils"], aqt.modulos["aqt"].utils)
        self.assertIs(sys.modules.get("aqt"), antes)
        self.assertNotIn("aqt.qt", sys.modules)

    def test_o_tooltip_anota_o_texto_e_o_prazo(self):
        with AqtDeMentira() as aqt:
            sys.modules["aqt.utils"].tooltip("um")
            sys.modules["aqt.utils"].tooltip("dois", period=3000)
        self.assertEqual(aqt.tooltips, [("um", None), ("dois", 3000)])

    def test_o_dialogo_nasce_fechado_e_anota_mostrar_trazer_e_ativar(self):
        with AqtDeMentira() as aqt:
            dialogo = sys.modules["aqt.qt"].QDialog(None)
            self.assertEqual((dialogo.isVisible(), aqt.dialogos), (False, [dialogo]))
            dialogo.show()
            dialogo.show()
            dialogo.raise_()
            dialogo.activateWindow()
            dialogo.activateWindow()
        self.assertEqual((dialogo.isVisible(), dialogo.mostradas, dialogo.trazidas, dialogo.ativadas), (True, 2, 1, 2))

    def test_fechar_o_dialogo_o_esconde_e_avisa_quem_ligou_no_finished(self):
        with AqtDeMentira() as aqt:
            qt = sys.modules["aqt.qt"]
            dialogo = qt.QDialog(None)
            avisos = []
            qt.qconnect(dialogo.finished, lambda: avisos.append("fechou"))
            qt.qconnect(object(), lambda: avisos.append("de outro"))
            dialogo.show()
            dialogo.close()
        self.assertEqual((dialogo.isVisible(), avisos), (False, ["fechou"]))

    def test_o_tamanho_do_dialogo_anota_o_resize_e_o_adjust_size_volta_a_largura_de_420_e_guarda_os_textos_dos_rotulos(self):
        with AqtDeMentira() as aqt:
            qt = sys.modules["aqt.qt"]
            dialogo = qt.QDialog(None)
            rotulo = qt.QLabel("x")
            rotulo.setText("escrito")
            self.assertEqual((dialogo.width(), rotulo.text()), (420, "escrito"))
            dialogo.resize(700, 150)
            self.assertEqual(dialogo.width(), 700)
            dialogo.adjustSize()
            self.assertEqual((dialogo.width(), dialogo.minimumSizeHint().height()), (420, 100))
        self.assertEqual((dialogo.redimensionamentos, dialogo.ajustes, aqt.eventos), ([(700, 150)], [["escrito"]], ["adjustSize"]))

    def test_o_layout_anota_o_activate_e_diz_a_altura_de_150(self):
        with AqtDeMentira() as aqt:
            layout = sys.modules["aqt.qt"].QVBoxLayout(None)
            layout.activate()
            self.assertEqual(layout.totalHeightForWidth(300), 150)
        self.assertEqual(aqt.eventos, ["activate"])

    def test_o_formulario_guarda_a_politica_e_as_linhas_na_ordem(self):
        with AqtDeMentira() as aqt:
            formulario = sys.modules["aqt.qt"].QFormLayout(None)
            formulario.setFieldGrowthPolicy("cresce")
            formulario.addRow("a", "b")
            formulario.addRow("c")
        self.assertEqual((aqt.formularios, formulario.politica, formulario.linhas), ([formulario], "cresce", [("a", "b"), ("c",)]))

    def test_o_relogio_anota_se_roda_e_tem_um_sinal_proprio(self):
        with AqtDeMentira() as aqt:
            relogio = sys.modules["aqt.qt"].QTimer(None)
            self.assertFalse(relogio.rodando)
            relogio.start()
            rodando = relogio.rodando
            relogio.stop()
            outro = sys.modules["aqt.qt"].QTimer(None)
        self.assertEqual((rodando, relogio.rodando, aqt.relogios, outro.timeout is relogio.timeout), (True, False, [relogio, outro], False))

    def test_a_barra_guarda_a_faixa_e_o_valor_e_o_rotulo_e_a_barra_podem_ser_escondidos(self):
        with AqtDeMentira():
            qt = sys.modules["aqt.qt"]
            barra, rotulo = qt.QProgressBar(), qt.QLabel("x")
            self.assertEqual((barra.visivel, barra.faixa, barra.valor), (True, None, None))
            barra.setRange(0, 12)
            barra.setValue(3)
            barra.setVisible(False)
            rotulo.setVisible(False)
        self.assertEqual((barra.visivel, barra.faixa, barra.valor, rotulo.visivel), (False, (0, 12), 3, False))

    def test_qualquer_outro_nome_do_qt_e_aceito_e_o_enum_devolve_o_proprio_objeto(self):
        with AqtDeMentira():
            qt = sys.modules["aqt.qt"]
            botao = qt.QPushButton("ok")
            self.assertIsNone(botao.setEnabled(False))
            self.assertIs(qt.Qt.AlignLeft, qt.Qt)
            self.assertIsNone(qt.Qt.fazAlgo(1, a=2))

    def test_o_campo_e_o_sem_rotulo_leem_as_linhas_do_formulario_da_janela(self):
        with AqtDeMentira() as aqt:
            formulario = sys.modules["aqt.qt"].QFormLayout(None)
            formulario.addRow(texto_da_janela.texto("ANK-02.envio"), "campo do envio")
            formulario.addRow("barra")
            self.assertEqual(aqt.campo("ANK-02.envio"), "campo do envio")
            self.assertEqual(aqt.sem_rotulo(), ["barra"])


if __name__ == "__main__":
    unittest.main()

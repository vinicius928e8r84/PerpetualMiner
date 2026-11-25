import os
import struct
import sys
import types
import unittest
from unittest import mock

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from PyQt6 import QtCore, QtGui
except ImportError:
    QtCore = QtGui = None

from complemento import imagem_qt
from complemento.motor import image_utils
from complemento.motor.image_utils import UnsupportedImageFormatError


def aqt_do_pyqt6():
    qt = types.ModuleType("aqt.qt")
    for modulo in (QtCore, QtGui):
        for nome in dir(modulo):
            setattr(qt, nome, getattr(modulo, nome))
    aqt = types.ModuleType("aqt")
    aqt.qt = qt
    return {"aqt": aqt, "aqt.qt": qt}


def codificar(imagem, formato):
    saida = QtCore.QByteArray()
    destino = QtCore.QBuffer(saida)
    destino.open(QtCore.QIODevice.OpenModeFlag.WriteOnly)
    assert imagem.save(destino, formato), formato
    destino.close()
    return bytes(saida)


def decodificar(dados):
    imagem = QtGui.QImage()
    assert imagem.loadFromData(dados), "não é uma imagem"
    return imagem


def jpeg_com_orientacao(largura, altura, cor, orientacao):
    imagem = QtGui.QImage(largura, altura, QtGui.QImage.Format.Format_RGB32)
    imagem.fill(QtGui.QColor(*cor))
    jpeg = codificar(imagem, "JPEG")
    tiff = b"II*\x00\x08\x00\x00\x00" + struct.pack("<H", 1) + struct.pack("<HHIHH", 0x0112, 3, 1, orientacao, 0) + b"\x00\x00\x00\x00"
    exif = b"Exif\x00\x00" + tiff
    return jpeg[:2] + b"\xff\xe1" + struct.pack(">H", len(exif) + 2) + exif + jpeg[2:]


@unittest.skipIf(QtCore is None, "sem PyQt6: o Qt de verdade só vem com o Anki (ou com `pip install PyQt6`)")
class OQtDoAnkiTrataAImagem(unittest.TestCase):
    def setUp(self):
        patch = mock.patch.dict(sys.modules, aqt_do_pyqt6())
        patch.start()
        self.addCleanup(patch.stop)
        self.adaptador = imagem_qt.AdaptadorQt()

    def test_um_jpeg_vira_um_png_do_mesmo_tamanho_e_da_mesma_cor(self):
        origem = QtGui.QImage(6, 4, QtGui.QImage.Format.Format_RGB32)
        origem.fill(QtGui.QColor(200, 30, 40))

        png = self.adaptador.converter(codificar(origem, "JPEG"), "PNG")

        self.assertEqual(png[:8], b"\x89PNG\r\n\x1a\n")
        feito = decodificar(png)
        self.assertEqual((feito.width(), feito.height()), (6, 4))
        cor = feito.pixelColor(3, 2)
        self.assertTrue(abs(cor.red() - 200) < 12 and abs(cor.green() - 30) < 12 and abs(cor.blue() - 40) < 12, cor.getRgb())

    def test_a_orientacao_do_exif_vale_e_a_foto_deitada_sai_em_pe(self):
        png = self.adaptador.converter(jpeg_com_orientacao(8, 4, (10, 200, 10), 6), "PNG")

        feito = decodificar(png)
        self.assertEqual((feito.width(), feito.height()), (4, 8))

    def test_o_png_com_transparencia_vira_jpeg_sobre_o_branco(self):
        origem = QtGui.QImage(4, 4, QtGui.QImage.Format.Format_ARGB32)
        origem.fill(QtGui.QColor(0, 0, 0, 0))

        jpeg = self.adaptador.converter(codificar(origem, "PNG"), "JPEG")

        self.assertEqual(jpeg[:2], b"\xff\xd8")
        cor = decodificar(jpeg).pixelColor(2, 2)
        self.assertTrue(min(cor.red(), cor.green(), cor.blue()) > 240, cor.getRgb())

    def test_o_que_o_qt_nao_le_e_recusado_como_imagem_nao_suportada(self):
        for lixo in (b"isto nao e uma imagem" * 5, b"\xff\xd8\xff\xe0" + b"\x00" * 40, b""):
            with self.subTest(lixo[:8]), self.assertRaises(UnsupportedImageFormatError):
                self.adaptador.converter(lixo, "PNG")

    def test_o_motor_guarda_o_png_que_o_qt_fez_de_um_jpeg_baixado(self):
        origem = QtGui.QImage(3, 3, QtGui.QImage.Format.Format_RGB32)
        origem.fill(QtGui.QColor(5, 5, 250))
        image_utils.usar_adaptador(self.adaptador)
        self.addCleanup(image_utils.usar_adaptador, None)

        dados, mime = image_utils.normalize_image_bytes(codificar(origem, "JPEG"), target_format="PNG")

        self.assertEqual((mime, image_utils.detect_supported_image_format(dados)), ("image/png", "png"))


class SemOQtNaoHaConversao(unittest.TestCase):
    def test_sem_o_aqt_a_conversao_e_recusada_e_nao_levanta_outra_coisa(self):
        with mock.patch.dict(sys.modules, {"aqt": None, "aqt.qt": None}):
            with self.assertRaises(UnsupportedImageFormatError):
                imagem_qt.AdaptadorQt().converter(b"\xff\xd8\xff\xe0" + b"\x00" * 40, "PNG")


if __name__ == "__main__":
    unittest.main()

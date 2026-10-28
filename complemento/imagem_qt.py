"""O tratamento de imagem do Cartão com o Qt do Anki (#144): o adaptador que o motor usa no lugar do Pillow (`motor/image_utils.py`).

O Anki traz o Qt (`aqt.qt`, PyQt5 ou PyQt6 conforme a versão); o complemento não traz biblioteca de imagem. Só `QImage` e
`QImageReader`, que servem fora da thread principal (`QPixmap` não): é a thread de trabalho do Envio que converte. Um arquivo
que o Qt não lê, ou um Qt que falta, vira `UnsupportedImageFormatError` do motor: a imagem falha e o Cartão vai sem ela.
"""

from .motor.image_utils import UnsupportedImageFormatError


def _qt():
    try:
        from aqt import qt
    except ImportError as erro:
        raise UnsupportedImageFormatError("Qt is required to convert this image") from erro
    return qt


def _enum(classe, grupo, nome):
    """O valor de um enum do Qt, escopado (PyQt6: `QIODevice.OpenModeFlag.ReadOnly`) ou solto (PyQt5: `QIODevice.ReadOnly`)."""
    return getattr(getattr(classe, grupo, classe), nome)


class AdaptadorQt:
    """`converter(dados, formato)`: os bytes de uma imagem que o Qt lê, no `formato` pedido (`PNG`, `JPEG`), com a orientação do EXIF aplicada."""

    def converter(self, dados, formato):
        qt = _qt()
        entrada = qt.QBuffer()
        entrada.setData(qt.QByteArray(dados))
        entrada.open(_enum(qt.QIODevice, "OpenModeFlag", "ReadOnly"))
        leitor = qt.QImageReader(entrada)
        leitor.setAutoTransform(True)
        imagem = leitor.read()
        if imagem.isNull():
            raise UnsupportedImageFormatError("not a supported raster image")
        if formato == "JPEG":
            imagem = _sobre_o_branco(qt, imagem)
        saida = qt.QByteArray()
        destino = qt.QBuffer(saida)
        destino.open(_enum(qt.QIODevice, "OpenModeFlag", "WriteOnly"))
        if not imagem.save(destino, formato):
            raise UnsupportedImageFormatError("the image could not be converted")
        destino.close()
        return bytes(saida)


def _sobre_o_branco(qt, imagem):
    """JPEG não tem transparência: o que é transparente fica sobre o branco, como o Pillow fazia."""
    if not imagem.hasAlphaChannel():
        return imagem.convertToFormat(_enum(qt.QImage, "Format", "Format_RGB32"))
    fundo = qt.QImage(imagem.size(), _enum(qt.QImage, "Format", "Format_RGB32"))
    fundo.fill(qt.QColor(255, 255, 255))
    pintor = qt.QPainter(fundo)
    pintor.drawImage(0, 0, imagem)
    pintor.end()
    return fundo

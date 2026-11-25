from .motor.image_utils import UnsupportedImageFormatError


def _qt():
    try:
        from aqt import qt
    except ImportError as erro:
        raise UnsupportedImageFormatError("Qt is required to convert this image") from erro
    return qt


def _enum(classe, grupo, nome):
    return getattr(getattr(classe, grupo, classe), nome)


class AdaptadorQt:
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
    if not imagem.hasAlphaChannel():
        return imagem.convertToFormat(_enum(qt.QImage, "Format", "Format_RGB32"))
    fundo = qt.QImage(imagem.size(), _enum(qt.QImage, "Format", "Format_RGB32"))
    fundo.fill(qt.QColor(255, 255, 255))
    pintor = qt.QPainter(fundo)
    pintor.drawImage(0, 0, imagem)
    pintor.end()
    return fundo

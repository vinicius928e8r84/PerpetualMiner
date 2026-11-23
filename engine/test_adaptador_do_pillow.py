"""O adaptador do Pillow, caso a caso: cada modo de cor que chega e cada formato que se pede, conferindo os pixels que saem.
Só roda onde o Pillow está; os outros testes do motor usam um adaptador de mentira."""

import sys
import unittest
from io import BytesIO
from unittest import mock

import image_utils
from image_utils import AdaptadorDoPillow, UnsupportedImageFormatError

ORIENTACAO_GIRADA_90_GRAUS = 0x0112
COM_PILLOW = image_utils.pillow_disponivel()
if COM_PILLOW:
    from PIL import Image


def bytes_de(imagem, formato, **opcoes):
    saida = BytesIO()
    imagem.save(saida, format=formato, **opcoes)
    return saida.getvalue()


def abrir(dados):
    imagem = Image.open(BytesIO(dados))
    imagem.load()
    return imagem


@unittest.skipUnless(COM_PILLOW, "sem Pillow: o adaptador do Pillow não tem o que converter")
class ConversaoDoPillow(unittest.TestCase):
    def converter(self, imagem, formato_de_origem, formato):
        return abrir(AdaptadorDoPillow().converter(bytes_de(imagem, formato_de_origem), formato))

    def test_o_jpeg_pedido_a_partir_de_um_png_com_transparencia_fica_sobre_fundo_branco(self):
        vazado = Image.new("RGBA", (2, 1), (255, 0, 0, 0))

        saida = self.converter(vazado, "PNG", "JPEG")

        self.assertEqual((saida.format, saida.mode), ("JPEG", "RGB"))
        self.assertTrue(all(canal >= 250 for canal in saida.getpixel((0, 0))))

    def test_o_jpeg_pedido_a_partir_de_cinza_com_transparencia_fica_sobre_fundo_branco(self):
        vazado = Image.new("LA", (2, 1), (0, 0))

        saida = self.converter(vazado, "PNG", "JPEG")

        self.assertEqual((saida.format, saida.mode), ("JPEG", "RGB"))
        self.assertTrue(all(canal >= 250 for canal in saida.getpixel((0, 0))))

    def test_o_jpeg_pedido_a_partir_de_uma_imagem_opaca_so_troca_o_modo_para_rgb(self):
        saida = self.converter(Image.new("P", (2, 1), 0), "PNG", "JPEG")

        self.assertEqual((saida.format, saida.mode), ("JPEG", "RGB"))

    def test_o_jpeg_pedido_a_partir_de_cmyk_vira_rgb(self):
        saida = self.converter(Image.new("CMYK", (2, 1), (0, 0, 0, 0)), "JPEG", "JPEG")

        self.assertEqual((saida.format, saida.mode), ("JPEG", "RGB"))

    def test_o_png_pedido_mantem_os_modos_que_o_png_guarda(self):
        modos = {}
        for modo in ("RGB", "RGBA", "L", "LA", "P"):
            modos[modo] = self.converter(Image.new(modo, (2, 1)), "PNG", "PNG").mode
        self.assertEqual(modos, {"RGB": "RGB", "RGBA": "RGBA", "L": "L", "LA": "LA", "P": "P"})

    def test_o_png_pedido_a_partir_de_cmyk_vira_rgba(self):
        saida = self.converter(Image.new("CMYK", (2, 1), (0, 0, 0, 0)), "JPEG", "PNG")

        self.assertEqual((saida.format, saida.mode), ("PNG", "RGBA"))

    def test_o_png_pedido_a_partir_de_16_bits_vira_rgba(self):
        saida = self.converter(Image.new("I;16", (2, 1)), "PNG", "PNG")

        self.assertEqual((saida.format, saida.mode), ("PNG", "RGBA"))

    def test_o_webp_pedido_guarda_a_transparencia_sem_trocar_o_modo(self):
        saida = self.converter(Image.new("RGBA", (2, 1), (255, 0, 0, 0)), "PNG", "WEBP")

        self.assertEqual((saida.format, saida.mode, saida.getpixel((0, 0))[3]), ("WEBP", "RGBA", 0))

    def test_a_orientacao_do_exif_e_aplicada_na_imagem_que_sai(self):
        imagem = Image.new("RGB", (4, 2), (0, 0, 255))
        exif = Image.Exif()
        exif[ORIENTACAO_GIRADA_90_GRAUS] = 6
        origem = bytes_de(imagem, "JPEG", exif=exif)

        saida = abrir(AdaptadorDoPillow().converter(origem, "PNG"))

        self.assertEqual(saida.size, (2, 4))

    def test_o_que_o_pillow_nao_abre_vira_formato_nao_suportado(self):
        with self.assertRaisesRegex(UnsupportedImageFormatError, "not a supported raster image"):
            AdaptadorDoPillow().converter(b"isto nao e uma imagem", "PNG")

    def test_a_imagem_cortada_ao_meio_vira_formato_nao_suportado(self):
        inteira = bytes_de(Image.new("RGB", (64, 64), (1, 2, 3)), "PNG")

        with self.assertRaisesRegex(UnsupportedImageFormatError, "not a supported raster image"):
            AdaptadorDoPillow().converter(inteira[: len(inteira) // 2], "JPEG")


class SemPillow(unittest.TestCase):
    def test_sem_o_pillow_o_adaptador_diz_que_precisa_dele_em_vez_de_quebrar(self):
        with mock.patch.dict(sys.modules, {"PIL": None}):
            with self.assertRaisesRegex(UnsupportedImageFormatError, "Pillow is required"):
                AdaptadorDoPillow().converter(b"\x89PNG\r\n\x1a\n", "JPEG")


if __name__ == "__main__":
    unittest.main()

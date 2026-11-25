import base64
import tempfile
import unittest
from pathlib import Path

import google_images
import image_judge
import image_utils
from image_utils import UnsupportedImageFormatError, detect_supported_image_format, normalize_image_bytes
from test_servidor_de_mentira import ServidorDeMentira


PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
)
JPEG_BYTES = b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"\x00" * 64


class AdaptadorDeMentira:
    def __init__(self, resultado=PNG_BYTES):
        self.resultado = resultado
        self.pedidos = []

    def converter(self, dados, formato):
        self.pedidos.append((dados, formato))
        if isinstance(self.resultado, Exception):
            raise self.resultado
        return self.resultado


class ComAdaptador(unittest.TestCase):
    def usar(self, adaptador):
        image_utils.usar_adaptador(adaptador)
        self.addCleanup(image_utils.usar_adaptador, None)
        return adaptador


class ImageNormalizationTests(ComAdaptador):
    def test_image_data_url_uses_real_mime_not_extension(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "wrong.png"
            path.write_bytes(JPEG_BYTES)

            data_url = image_judge._image_data_url(path)

        self.assertTrue(data_url.startswith("data:image/jpeg;base64,"))

    def test_image_data_url_rejects_markup(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "fake.png"
            path.write_text("<html>not an image</html>", encoding="utf-8")

            with self.assertRaises(UnsupportedImageFormatError):
                image_judge._image_data_url(path)

    def test_normalize_image_bytes_accepts_png_without_asking_the_adapter(self):
        adaptador = self.usar(AdaptadorDeMentira())

        data, mime = normalize_image_bytes(PNG_BYTES, target_format="PNG")

        self.assertEqual((data, mime, adaptador.pedidos), (PNG_BYTES, "image/png", []))

    def test_normalize_image_bytes_has_the_adapter_convert_a_jpeg_to_png(self):
        adaptador = self.usar(AdaptadorDeMentira())

        data, mime = normalize_image_bytes(JPEG_BYTES, target_format="PNG")

        self.assertEqual((data, mime, adaptador.pedidos), (PNG_BYTES, "image/png", [(JPEG_BYTES, "PNG")]))

    def test_normalize_image_bytes_rejects_what_the_adapter_cannot_read(self):
        self.usar(AdaptadorDeMentira(UnsupportedImageFormatError("not a supported raster image")))

        with self.assertRaises(UnsupportedImageFormatError):
            normalize_image_bytes(JPEG_BYTES, target_format="PNG")

    def test_normalize_image_bytes_rejects_an_adapter_answer_that_is_not_an_image(self):
        self.usar(AdaptadorDeMentira(b"not an image at all"))

        with self.assertRaises(UnsupportedImageFormatError):
            normalize_image_bytes(JPEG_BYTES, target_format="PNG")


class DownloadDeCandidatas(ComAdaptador):
    def baixar(self, tipo, conteudo, adaptador=None):
        self.usar(adaptador or AdaptadorDeMentira())
        with tempfile.TemporaryDirectory() as td, ServidorDeMentira({"/foto": (200, (tipo, conteudo))}) as servidor:
            dest = Path(td) / "real.png"
            ok = google_images.download_candidate({"url": servidor.base + "/foto"}, dest)
            return ok, dest.read_bytes() if dest.exists() else None

    def test_download_candidate_rejects_html_with_image_header(self):
        self.assertEqual(self.baixar("image/jpeg", b"<html>blocked</html>"), (False, None))

    def test_download_candidate_rejects_svg(self):
        self.assertEqual(self.baixar("image/svg+xml", b"<svg></svg>"), (False, None))

    def test_download_candidate_stores_the_png_the_adapter_made_from_a_jpeg(self):
        self.assertEqual(self.baixar("image/jpeg", JPEG_BYTES), (True, PNG_BYTES))

    def test_download_candidate_accepts_valid_image_with_generic_header(self):
        self.assertEqual(self.baixar("application/octet-stream", JPEG_BYTES), (True, PNG_BYTES))

    def test_download_candidate_keeps_a_png_as_it_came(self):
        self.assertEqual(self.baixar("image/png", PNG_BYTES), (True, PNG_BYTES))

    def test_download_candidate_leaves_nothing_when_the_adapter_cannot_convert(self):
        adaptador = AdaptadorDeMentira(UnsupportedImageFormatError("x"))
        self.assertEqual(self.baixar("image/jpeg", JPEG_BYTES, adaptador), (False, None))

    def test_download_candidate_never_opens_a_file_or_ftp_address_an_openverse_result_may_carry(self):
        self.usar(AdaptadorDeMentira())
        with tempfile.TemporaryDirectory() as td:
            local = Path(td) / "segredo.png"
            local.write_bytes(PNG_BYTES)
            dest = Path(td) / "real.png"
            ok = google_images.download_candidate({"url": local.as_uri(), "thumbnail": "ftp://exemplo.invalid/a.png"}, dest)
            existe = dest.exists()

        self.assertEqual((ok, existe), (False, False))

    def test_download_candidate_falls_back_to_the_thumbnail_when_the_original_fails(self):
        self.usar(AdaptadorDeMentira())
        rotas = {"/original": (404, "nada"), "/miniatura": (200, ("image/png", PNG_BYTES))}
        with tempfile.TemporaryDirectory() as td, ServidorDeMentira(rotas) as servidor:
            dest = Path(td) / "real.png"
            ok = google_images.download_candidate({"url": servidor.base + "/original", "thumbnail": servidor.base + "/miniatura"}, dest)
            guardado = dest.read_bytes()

        self.assertEqual((ok, guardado), (True, PNG_BYTES))

    def test_download_candidate_takes_the_thumbnail_when_the_original_is_too_small_to_be_a_photo(self):
        adaptador = self.usar(AdaptadorDeMentira())
        pequena, minima = JPEG_BYTES[:31], JPEG_BYTES[:32]
        rotas = {"/pequena": (200, ("image/jpeg", pequena)), "/minima": (200, ("image/jpeg", minima))}
        with tempfile.TemporaryDirectory() as td, ServidorDeMentira(rotas) as servidor:
            dest = Path(td) / "real.png"
            ok = google_images.download_candidate({"url": servidor.base + "/pequena", "thumbnail": servidor.base + "/minima"}, dest)
            guardado = dest.read_bytes()

        self.assertEqual((ok, guardado, adaptador.pedidos), (True, PNG_BYTES, [(minima, "PNG")]))

    def test_download_candidate_without_any_address_asks_nothing_and_fails(self):
        with tempfile.TemporaryDirectory() as td, ServidorDeMentira() as servidor:
            dest = Path(td) / "real.png"
            vazias = [google_images.download_candidate(candidata, dest) for candidata in ({}, {"url": "", "thumbnail": None}, {"title": "x"})]
            existe, pedidos = dest.exists(), servidor.pedidos

        self.assertEqual((vazias, existe, pedidos), ([False, False, False], False, []))

    def test_download_candidate_tries_the_thumbnail_when_the_photo_cannot_be_written_and_fails_without_raising(self):
        self.usar(AdaptadorDeMentira())
        rotas = {"/original": (200, ("image/png", PNG_BYTES)), "/miniatura": (200, ("image/png", PNG_BYTES))}
        with tempfile.TemporaryDirectory() as td, ServidorDeMentira(rotas) as servidor:
            dest = Path(td) / "pasta-que-falta" / "real.png"
            ok = google_images.download_candidate({"url": servidor.base + "/original", "thumbnail": servidor.base + "/miniatura"}, dest)
            caminhos = [pedido["caminho"] for pedido in servidor.pedidos]

        self.assertEqual((ok, caminhos), (False, ["/original", "/miniatura"]))

    def test_download_candidate_tries_the_thumbnail_when_the_adapter_fails_in_an_unexpected_way(self):
        self.usar(AdaptadorDeMentira(RuntimeError("quebrou")))
        rotas = {"/original": (200, ("image/jpeg", JPEG_BYTES)), "/miniatura": (200, ("image/png", PNG_BYTES))}
        with tempfile.TemporaryDirectory() as td, ServidorDeMentira(rotas) as servidor:
            dest = Path(td) / "real.png"
            ok = google_images.download_candidate({"url": servidor.base + "/original", "thumbnail": servidor.base + "/miniatura"}, dest)
            guardado = dest.read_bytes()

        self.assertEqual((ok, guardado), (True, PNG_BYTES))

    def test_download_candidate_stops_at_the_original_when_it_works(self):
        self.usar(AdaptadorDeMentira())
        rotas = {"/original": (200, ("image/png", PNG_BYTES)), "/miniatura": (200, ("image/png", PNG_BYTES))}
        with tempfile.TemporaryDirectory() as td, ServidorDeMentira(rotas) as servidor:
            ok = google_images.download_candidate({"url": servidor.base + "/original", "thumbnail": servidor.base + "/miniatura"}, Path(td) / "real.png")
            caminhos = [pedido["caminho"] for pedido in servidor.pedidos]

        self.assertEqual((ok, caminhos), (True, ["/original"]))


class FormatoDaImagem(ComAdaptador):
    def test_each_supported_format_is_known_by_how_the_bytes_start(self):
        casos = {
            b"\x89PNG\r\n\x1a\n": "png",
            b"\x89PNG\r\n\x1a": None,
            b"\xff\xd8\xff": "jpeg",
            b"\xff\xd8": None,
            b"GIF87a...": "gif",
            b"GIF89a": "gif",
            b"GIF88a": None,
            b"RIFF\x00\x00\x00\x00WEBP": "webp",
            b"RIFF\x00\x00\x00\x00WEBPVP8 ": "webp",
            b"RIFF\x00\x00\x00\x00WEB": None,
            b"RIFF\x00\x00\x00\x00WAVE": None,
            b"RIFX\x00\x00\x00\x00WEBP": None,
            b"\x00\x00\x00\x00RIFFWEBP": None,
            b"RIFFWEBP": None,
            b"": None,
            b" \x89PNG\r\n\x1a\n": None,
        }
        self.assertEqual({dados: detect_supported_image_format(dados) for dados in casos}, casos)
        self.assertEqual(detect_supported_image_format(bytearray(b"GIF89a")), "gif")

    def test_the_mime_of_each_supported_format_and_an_error_for_anything_else(self):
        mimes = [image_utils.supported_image_mime(d) for d in (PNG_BYTES, JPEG_BYTES, b"GIF87a", b"RIFF\x00\x00\x00\x00WEBP")]
        self.assertEqual(mimes, ["image/png", "image/jpeg", "image/gif", "image/webp"])
        with self.assertRaises(UnsupportedImageFormatError):
            image_utils.supported_image_mime(b"<svg></svg>")

    def test_markup_in_the_first_512_bytes_is_never_handed_to_the_adapter(self):
        adaptador = self.usar(AdaptadorDeMentira())
        marcacoes = [b"<!DOCTYPE html><p>", b"  \n\t<HTML>", b"<?xml version='1.0'?>", b"<SVG></svg>", b" " * 400 + b"<svg>"]
        for dados in marcacoes:
            with self.subTest(dados=dados[:20]), self.assertRaisesRegex(UnsupportedImageFormatError, "not a raster image"):
                normalize_image_bytes(dados, target_format="PNG")
        with self.assertRaisesRegex(UnsupportedImageFormatError, "not a raster image"):
            normalize_image_bytes(b"", target_format="PNG")
        self.assertEqual(adaptador.pedidos, [])

    def test_what_only_looks_like_markup_further_on_goes_to_the_adapter(self):
        adaptador = self.usar(AdaptadorDeMentira())
        longe = b" " * 600 + b"<html>"
        outras = [b"<!doctype htm", b"<htm", b"<body>", b"<?xm", b"<sv", longe]
        resultados = [normalize_image_bytes(dados, target_format="PNG") for dados in outras]
        self.assertEqual((resultados, [dados for dados, _ in adaptador.pedidos]), ([(PNG_BYTES, "image/png")] * len(outras), outras))

    def test_the_target_format_is_case_insensitive_and_one_already_in_it_is_kept_as_it_came(self):
        adaptador = self.usar(AdaptadorDeMentira(JPEG_BYTES))
        self.assertEqual(normalize_image_bytes(JPEG_BYTES, target_format="jpeg"), (JPEG_BYTES, "image/jpeg"))
        self.assertEqual(normalize_image_bytes(PNG_BYTES, target_format="Jpeg"), (JPEG_BYTES, "image/jpeg"))
        self.assertEqual(adaptador.pedidos, [(PNG_BYTES, "JPEG")])
        with self.assertRaisesRegex(ValueError, "unsupported target image format: GIF"):
            normalize_image_bytes(PNG_BYTES, target_format="gif")


@unittest.skipUnless(image_utils.pillow_disponivel(), "sem Pillow: o adaptador do Pillow não tem o que converter")
class AdaptadorDoPillow(unittest.TestCase):
    def test_the_pillow_adapter_converts_a_jpeg_to_png_as_before(self):
        from io import BytesIO

        from PIL import Image

        saida = BytesIO()
        Image.new("RGB", (2, 2), (240, 10, 10)).save(saida, format="JPEG")

        data, mime = normalize_image_bytes(saida.getvalue(), target_format="PNG")

        self.assertEqual((detect_supported_image_format(data), mime), ("png", "image/png"))


if __name__ == "__main__":
    unittest.main()

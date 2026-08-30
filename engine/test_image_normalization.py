import base64
from io import BytesIO
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import google_images
import image_judge
from image_utils import UnsupportedImageFormatError, detect_supported_image_format, normalize_image_bytes


PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
)


def _jpeg_bytes() -> bytes:
    from PIL import Image

    out = BytesIO()
    Image.new("RGB", (2, 2), (240, 10, 10)).save(out, format="JPEG")
    return out.getvalue()


class _Response:
    def __init__(self, content: bytes, content_type: str = "image/jpeg", status_code: int = 200):
        self.content = content
        self.status_code = status_code
        self.headers = {"Content-Type": content_type}


class ImageNormalizationTests(unittest.TestCase):
    def test_image_data_url_uses_real_mime_not_extension(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "wrong.png"
            path.write_bytes(_jpeg_bytes())

            data_url = image_judge._image_data_url(path)

        self.assertTrue(data_url.startswith("data:image/jpeg;base64,"))

    def test_image_data_url_rejects_markup(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "fake.png"
            path.write_text("<html>not an image</html>", encoding="utf-8")

            with self.assertRaises(UnsupportedImageFormatError):
                image_judge._image_data_url(path)

    def test_download_candidate_rejects_html_with_image_header(self):
        with tempfile.TemporaryDirectory() as td:
            dest = Path(td) / "real.png"

            with patch("google_images.requests.get", return_value=_Response(b"<html>blocked</html>", "image/jpeg")):
                ok = google_images.download_candidate({"url": "mock://html"}, dest)

        self.assertFalse(ok)
        self.assertFalse(dest.exists())

    def test_download_candidate_rejects_svg(self):
        with tempfile.TemporaryDirectory() as td:
            dest = Path(td) / "real.png"

            with patch("google_images.requests.get", return_value=_Response(b"<svg></svg>", "image/svg+xml")):
                ok = google_images.download_candidate({"url": "mock://svg"}, dest)

        self.assertFalse(ok)
        self.assertFalse(dest.exists())

    def test_download_candidate_normalizes_supported_image_to_png(self):
        with tempfile.TemporaryDirectory() as td:
            dest = Path(td) / "real.png"

            with patch("google_images.requests.get", return_value=_Response(_jpeg_bytes(), "image/jpeg")):
                ok = google_images.download_candidate({"url": "mock://jpeg"}, dest)

            self.assertTrue(ok)
            self.assertEqual(detect_supported_image_format(dest.read_bytes()), "png")

    def test_download_candidate_accepts_valid_image_with_generic_header(self):
        with tempfile.TemporaryDirectory() as td:
            dest = Path(td) / "real.png"

            with patch("google_images.requests.get", return_value=_Response(_jpeg_bytes(), "application/octet-stream")):
                ok = google_images.download_candidate({"url": "mock://jpeg"}, dest)

            self.assertTrue(ok)
            self.assertEqual(detect_supported_image_format(dest.read_bytes()), "png")

    def test_normalize_image_bytes_accepts_png_without_pillow_conversion(self):
        data, mime = normalize_image_bytes(PNG_BYTES, target_format="PNG")

        self.assertEqual(data, PNG_BYTES)
        self.assertEqual(mime, "image/png")


if __name__ == "__main__":
    unittest.main()

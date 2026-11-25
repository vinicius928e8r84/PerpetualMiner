from __future__ import annotations

from io import BytesIO


SUPPORTED_IMAGE_MIMES = {
    "gif": "image/gif",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
}
COMECO_DE_CADA_FORMATO = (
    (b"\x89PNG\r\n\x1a\n", "png"),
    (b"\xff\xd8\xff", "jpeg"),
    ((b"GIF87a", b"GIF89a"), "gif"),
)
COMECO_DE_MARCACAO = (b"<!doctype html", b"<html", b"<?xml", b"<svg")


class UnsupportedImageFormatError(ValueError):
    pass


def detect_supported_image_format(data: bytes) -> str | None:
    for comeco, formato in COMECO_DE_CADA_FORMATO:
        if data.startswith(comeco):
            return formato
    return "webp" if data[:4] == b"RIFF" and data[8:12] == b"WEBP" else None


def supported_image_mime(data: bytes) -> str:
    fmt = detect_supported_image_format(data)
    if not fmt:
        raise UnsupportedImageFormatError("unsupported image format")
    return SUPPORTED_IMAGE_MIMES[fmt]


def _looks_like_markup(data: bytes) -> bool:
    return data[:512].lstrip().lower().startswith(COMECO_DE_MARCACAO)


def normalize_image_bytes(data: bytes, *, target_format: str = "PNG") -> tuple[bytes, str]:
    if not data or _looks_like_markup(data):
        raise UnsupportedImageFormatError("not a raster image")

    target_format = target_format.upper()
    target_mime = {
        "JPEG": "image/jpeg",
        "PNG": "image/png",
        "WEBP": "image/webp",
    }.get(target_format)
    if not target_mime:
        raise ValueError(f"unsupported target image format: {target_format}")

    existing_format = detect_supported_image_format(data)
    if existing_format and SUPPORTED_IMAGE_MIMES[existing_format] == target_mime:
        return data, target_mime

    normalized = _adaptador_em_uso().converter(data, target_format)
    if not detect_supported_image_format(normalized):
        raise UnsupportedImageFormatError("converted image is not supported")
    return normalized, target_mime


class AdaptadorDoPillow:
    def converter(self, dados: bytes, formato: str) -> bytes:
        try:
            from PIL import Image, ImageOps, UnidentifiedImageError
        except ImportError as exc:
            raise UnsupportedImageFormatError("Pillow is required to convert this image") from exc

        try:
            with Image.open(BytesIO(dados)) as img:
                img = ImageOps.exif_transpose(img)
                out = BytesIO()
                if formato == "JPEG":
                    if img.mode in {"RGBA", "LA"}:
                        background = Image.new("RGB", img.size, (255, 255, 255))
                        background.paste(img, mask=img.getchannel("A"))
                        img = background
                    else:
                        img = img.convert("RGB")
                elif formato == "PNG" and img.mode not in {"RGB", "RGBA", "L", "LA", "P"}:
                    img = img.convert("RGBA")
                img.save(out, format=formato)
        except (UnidentifiedImageError, OSError, ValueError) as exc:
            raise UnsupportedImageFormatError("not a supported raster image") from exc
        return out.getvalue()


_adaptador = None


def usar_adaptador(adaptador) -> None:
    global _adaptador
    _adaptador = adaptador


def _adaptador_em_uso():
    return _adaptador or AdaptadorDoPillow()


def pillow_disponivel() -> bool:
    try:
        import PIL  # noqa: F401
    except ImportError:
        return False
    return True

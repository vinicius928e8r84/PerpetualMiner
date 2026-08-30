from __future__ import annotations

from io import BytesIO


SUPPORTED_IMAGE_MIMES = {
    "gif": "image/gif",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
}


class UnsupportedImageFormatError(ValueError):
    pass


def detect_supported_image_format(data: bytes) -> str | None:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if data.startswith((b"GIF87a", b"GIF89a")):
        return "gif"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


def supported_image_mime(data: bytes) -> str:
    fmt = detect_supported_image_format(data)
    if not fmt:
        raise UnsupportedImageFormatError("unsupported image format")
    return SUPPORTED_IMAGE_MIMES[fmt]


def _looks_like_markup(data: bytes) -> bool:
    head = data[:512].lstrip().lower()
    return (
        head.startswith(b"<!doctype html")
        or head.startswith(b"<html")
        or head.startswith(b"<?xml")
        or head.startswith(b"<svg")
    )


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

    try:
        from PIL import Image, ImageOps, UnidentifiedImageError
    except ImportError as exc:
        raise UnsupportedImageFormatError("Pillow is required to convert this image") from exc

    try:
        with Image.open(BytesIO(data)) as img:
            img = ImageOps.exif_transpose(img)
            out = BytesIO()
            if target_format == "JPEG":
                if img.mode in {"RGBA", "LA"}:
                    background = Image.new("RGB", img.size, (255, 255, 255))
                    background.paste(img, mask=img.getchannel("A"))
                    img = background
                else:
                    img = img.convert("RGB")
            elif target_format == "PNG" and img.mode not in {"RGB", "RGBA", "L", "LA", "P"}:
                img = img.convert("RGBA")
            img.save(out, format=target_format)
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise UnsupportedImageFormatError("not a supported raster image") from exc

    normalized = out.getvalue()
    if not detect_supported_image_format(normalized):
        raise UnsupportedImageFormatError("converted image is not supported")
    return normalized, target_mime

"""nota_do_cartao.py - the note a card text becomes, field by field, in the style of its language and level.

The add-on writes what `campos_da_nota` returns into the note type of the language (`estilos.json`): each part of the card has
its own field (the front is the Phrase, the audios and the image are fields too), and the style says which parts of the back
are filled and whether the Alignment pairs colour the Phrase and the Literal line. The text of the card is the model's answer
(`prompts/*_iniciante.txt`); standard library only.
"""

import re
from typing import Dict, List, Optional

if __package__:  # inside the Anki add-on the engine is the package `complemento.motor`
    from . import estilos
    from .send_to_anki import (
        _BACK_RE, _apply_chunk_colors, _build_front, _extract_alignments, _extract_tags_from_card, _md_to_html, normalize_front)
else:
    import estilos
    from send_to_anki import (
        _BACK_RE, _apply_chunk_colors, _build_front, _extract_alignments, _extract_tags_from_card, _md_to_html, normalize_front)

_FONTE_RE = re.compile(r"^[^\S\n]*Source\s+Context:\s*(.+)$", re.IGNORECASE | re.MULTILINE)


def _valor_do_rotulo(content: str, rotulo: str) -> str:
    achou = re.search(r"^[^\S\n]*\*{0,2}%s:\*{0,2}[^\S\n]*(.+)$" % re.escape(rotulo), content, re.IGNORECASE | re.MULTILINE)
    return achou.group(1).strip() if achou else ""


def _palavra_do_verso(content: str) -> str:
    """The first line of the Back (`gave up – /ɡeɪv ʌp/`): the headword the English card writes there."""
    achou = _BACK_RE.search(content)
    return next((linha.strip() for linha in (achou.group(1).splitlines() if achou else []) if linha.strip()), "").strip("*").strip()


def campos_da_nota(
    content: str,
    lang: str,
    *,
    nivel: Optional[str] = None,
    palavra: Optional[str] = None,
    audio_da_frase: Optional[str] = None,
    audio_da_palavra: Optional[str] = None,
    imagem: Optional[str] = None,
) -> Dict[str, object]:
    """`{ campos: { nome do campo: HTML }, campo_da_frente, frente_normalizada, etiquetas }` of one card text.

    Only the fields with something to say are in `campos` (the note type has the rest, empty). `palavra` is the word the
    card is about when the text does not say it (the Russian card has no headword). The audios and the image are the file
    names the note cites."""
    idioma, estilo = estilos.idioma(lang), estilos.estilo(lang, nivel)
    nomes = idioma["campos"]
    content = content.replace("## Anki Card", "").strip()
    alinhamentos = _extract_alignments(content) if estilo["cores"] else []

    valores: Dict[str, str] = {"frase": _build_front(content, None, lang=lang, cores=estilo["cores"])}
    for parte in estilo["verso"]:
        if parte == "palavra":
            valores[parte] = (_palavra_do_verso(content) if estilo["entrada"] == "palavras" else "") or palavra or ""
        elif parte == "imagem":
            valores[parte] = '<img src="%s">' % imagem if imagem else ""
        elif estilos.rotulo(parte):
            valor = _valor_do_rotulo(content, estilos.rotulo(parte))
            if parte == "literal" and alinhamentos:
                valor = _apply_chunk_colors(valor, [para for _, para in alinhamentos], ignore_case=True)
            valores[parte] = _md_to_html(valor)
    fonte = _FONTE_RE.search(content)
    valores["fonte"] = fonte.group(1).strip() if fonte else ""
    valores["audio_da_frase"] = "[sound:%s]" % audio_da_frase if audio_da_frase else ""
    valores["audio_da_palavra"] = "[sound:%s]" % audio_da_palavra if audio_da_palavra else ""

    campos = {nomes[chave]: valor for chave, valor in valores.items() if valor and chave in nomes}
    etiquetas: List[str] = _extract_tags_from_card(content)
    return {
        "campos": campos,
        "campo_da_frente": nomes["frase"],
        "frente_normalizada": normalize_front(valores["frase"], lang),
        "etiquetas": etiquetas,
    }

"""nota_do_cartao.py - the note a card text becomes, field by field, in the style of its language and level.

The add-on writes what `campos_da_nota` returns into the note type of the language (`estilos.json`): each part of the card has
its own field (the front is the Phrase, the audios and the image are fields too), and the style says which parts of the back
are filled and whether the Alignment pairs colour the Phrase and the Literal line. A level with `morfologia` (the Russian
Intermediate and Advanced, #163) colours the Phrase by the pieces of the words the model broke down instead (prefix, root, suffix and
ending, one colour for each kind, the same at every level) and explains each colour on the back. The text of the card is the model's
answer (`prompts/*.txt`); standard library only.
"""

import html
import re
from typing import Dict, List, Optional, Tuple

if __package__:  # inside the Anki add-on the engine is the package `complemento.motor`
    from . import estilos
    from .send_to_anki import (
        _BACK_RE, _apply_chunk_colors, _build_front, _extract_alignments, _extract_tags_from_card, _md_to_html, normalize_front)
else:
    import estilos
    from send_to_anki import (
        _BACK_RE, _apply_chunk_colors, _build_front, _extract_alignments, _extract_tags_from_card, _md_to_html, normalize_front)

_FONTE_RE = re.compile(r"^[^\S\n]*Source\s+Context:\s*(.+)$", re.IGNORECASE | re.MULTILINE)
_NEGRITO_RE = re.compile(r"<b>.*?</b>", re.DOTALL)
_TAG_RE = re.compile(r"<[^>]+>")
_MARCA = "\x00"
_LACUNA = '<b class="lacuna">[\u2026]</b>'

# The four pieces of a Russian word, in the order a word is written, and the colour of each: the same at every level.
PEDACOS = ("prefix", "root", "suffix", "ending")
COR_DO_PEDACO = {"prefix": "#a855f7", "root": "#22c55e", "suffix": "#f59e0b", "ending": "#ef4444"}
NOME_DO_PEDACO = {"prefix": "Prefix", "root": "Root", "suffix": "Suffix", "ending": "Ending"}
# The word a Russian card with morphology is about: the model chooses it among the words of the Phrase and says it on its own line.
ROTULO_DA_PALAVRA = "Word"
_ACENTO = "\u0301"
_LINHA_DO_PEDACO_RE = re.compile(r"^(prefix|root|suffix|ending)\s*:\s*(.+)$", re.IGNORECASE)


def _valor_do_rotulo(content: str, rotulo: str) -> str:
    achou = re.search(r"^[^\S\n]*\*{0,2}%s:\*{0,2}[^\S\n]*(.+)$" % re.escape(rotulo), content, re.IGNORECASE | re.MULTILINE)
    return achou.group(1).strip() if achou else ""


def _palavra_do_verso(content: str) -> str:
    """The first line of the Back (`gave up – /ɡeɪv ʌp/`): the headword the English card writes there."""
    achou = _BACK_RE.search(content)
    return next((linha.strip() for linha in (achou.group(1).splitlines() if achou else []) if linha.strip()), "").strip("*").strip()


def _frase_com_lacuna(frase: str, palavra: str) -> str:
    """The Phrase without the Word, for the Lacuna front: the bold text of the Phrase (English marks the Word that way) or, without any, the
    `palavra` where it is in the text. No colours: they would give the gap away. Empty when the Word is not in the Phrase."""
    if _NEGRITO_RE.search(frase):
        so_o_negrito = _TAG_RE.sub(lambda tag: tag.group(0) if tag.group(0) in ("<b>", "</b>") else "", frase)
        texto = _NEGRITO_RE.sub(_MARCA, so_o_negrito)
    else:
        texto = _TAG_RE.sub("", frase)
        if palavra.strip():
            texto = re.sub(re.escape(palavra.strip()), _MARCA, texto, flags=re.IGNORECASE)
    return texto.replace(_MARCA, _LACUNA) if _MARCA in texto else ""


def _secao(content: str, titulo: str) -> List[str]:
    """The lines of a `Title:` section of the card text (up to the next blank line), without the empty ones."""
    linhas: List[str] = []
    dentro = False
    for bruta in content.splitlines():
        linha = bruta.strip().strip("*").strip()
        if not dentro:
            dentro = re.fullmatch(r"%s:" % re.escape(titulo), linha, re.IGNORECASE) is not None
        elif linha:
            linhas.append(linha)
        else:
            break
    return linhas


def _sem_acento(texto: str) -> str:
    return texto.replace(_ACENTO, "")


def morfologia_do_texto(content: str) -> List[Tuple[str, List[Tuple[str, str]]]]:
    """The words the model broke down, `[(word, [(kind, piece)])]`, from the `Morphology:` section (`word | kind:piece | …`, the
    pieces in the order of the word). A word whose pieces do not add up to the word is dropped: nothing is guessed."""
    palavras: List[Tuple[str, List[Tuple[str, str]]]] = []
    for linha in _secao(content, "Morphology"):
        partes = [parte.strip() for parte in linha.split("|")]
        palavra, pedacos = _sem_acento(partes[0]), []
        for parte in partes[1:]:
            achou = _LINHA_DO_PEDACO_RE.match(parte)
            if achou:
                pedacos.append((achou.group(1).lower(), _sem_acento(achou.group(2)).strip("-– ")))
        if palavra and pedacos and all(p for _, p in pedacos) and "".join(p for _, p in pedacos).lower() == palavra.lower():
            palavras.append((palavra, pedacos))
    return palavras


def _pintar_a_frase(frase: str, palavras: List[Tuple[str, List[Tuple[str, str]]]]) -> str:
    """The Phrase (HTML) with the first occurrence of each broken-down word coloured piece by piece; a word that is not in it is skipped."""
    marcas: Dict[str, str] = {}
    for palavra, pedacos in palavras:
        achou = re.search(r"(?<!\w)%s(?!\w)" % re.escape(palavra), frase, re.IGNORECASE)
        if not achou:
            continue
        texto, inicio, pintado = achou.group(0), 0, ""
        for tipo, pedaco in pedacos:
            pintado += '<span style="color: %s;">%s</span>' % (COR_DO_PEDACO[tipo], texto[inicio:inicio + len(pedaco)])
            inicio += len(pedaco)
        marca = chr(0xE000 + len(marcas))  # Private Use Area: no later word can match it
        marcas[marca] = pintado
        frase = frase[:achou.start()] + marca + frase[achou.end():]
    for marca, pintado in marcas.items():
        frase = frase.replace(marca, pintado)
    return frase


def _explicacao_das_cores(content: str) -> str:
    """One line per colour from the `Colors:` section (`kind | pieces | explanation`), prefix, root, suffix, ending."""
    por_tipo: Dict[str, str] = {}
    for linha in _secao(content, "Colors"):
        partes = [parte.strip() for parte in linha.split("|", 2)]
        if len(partes) == 3 and partes[0].lower() in PEDACOS and partes[1] and partes[2]:
            por_tipo.setdefault(partes[0].lower(), '<span style="color: %s;">%s</span> \u2013 %s' % (
                COR_DO_PEDACO[partes[0].lower()], html.escape(partes[1], quote=False), html.escape(partes[2], quote=False)))
    return "<br>".join(por_tipo[tipo] for tipo in PEDACOS if tipo in por_tipo)


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
    para_comparar = valores["frase"]  # a cor parte as palavras: a busca de duplicatas compara a Frase sem ela
    palavras = morfologia_do_texto(content) if estilo.get("morfologia") else []
    if palavras:
        valores["frase"] = _pintar_a_frase(valores["frase"], palavras)
        valores["morfologia"] = "<br>".join("%s = %s" % (p, " + ".join(parte for _, parte in pedacos)) for p, pedacos in palavras)
        valores["explicacao_das_cores"] = _explicacao_das_cores(content)
    for parte in estilo["verso"] + estilo.get("guarda", []):
        if parte == "palavra":
            do_cartao = _valor_do_rotulo(content, ROTULO_DA_PALAVRA) if estilo.get("morfologia") else ""
            valores[parte] = do_cartao or (_palavra_do_verso(content) if estilo["entrada"] == "palavras" else "") or palavra or ""
        elif parte == "imagem":
            valores[parte] = '<img src="%s">' % imagem if imagem else ""
        elif parte in ("morfologia", "explicacao_das_cores"):
            continue
        elif estilos.rotulo(parte):
            valor = _valor_do_rotulo(content, estilos.rotulo(parte))
            if parte == "literal" and alinhamentos:
                valor = _apply_chunk_colors(valor, [para for _, para in alinhamentos], ignore_case=True)
            valores[parte] = _md_to_html(valor)
    lacuna = _frase_com_lacuna(valores["frase"], palavra or valores.get("palavra") or "")
    if lacuna:  # a frente Lacuna (#166): a Frase sem a Palavra e uma dica do verso; o resto da Frase fica no campo da Frase
        valores["lacuna"] = lacuna
        valores["dica"] = next((valores[parte] for parte in estilos.partes_da_dica() if valores.get(parte)), "")
    fonte = _FONTE_RE.search(content)
    valores["fonte"] = fonte.group(1).strip() if fonte else ""
    valores["audio_da_frase"] = "[sound:%s]" % audio_da_frase if audio_da_frase else ""
    valores["audio_da_palavra"] = "[sound:%s]" % audio_da_palavra if audio_da_palavra else ""

    campos = {nomes[chave]: valor for chave, valor in valores.items() if valor and chave in nomes}
    etiquetas: List[str] = _extract_tags_from_card(content)
    return {
        "campos": campos,
        "campo_da_frente": nomes["frase"],
        "frente_normalizada": normalize_front(para_comparar, lang),
        "etiquetas": etiquetas,
    }

"""nota_do_cartao.py - the note a card text becomes, field by field, in the style of its language and level.

The add-on writes what `campos_da_nota` returns into the note type of the language (`estilos.json`): each part of the card has
its own field (the front is the Phrase, the audios and the image are fields too), and the style says which parts of the back
are filled and whether the Alignment pairs colour the Phrase and the Literal line. A level with `destaque` (the Russian
Intermediate and Advanced, #163) highlights the key word in the Phrase and in the other example. A level with `morfologia` (the Russian
Intermediate) also colours, in both sentences, the pieces of the words the model broke down (prefix, root, suffix and ending, one colour for
each kind), stores them and explains each kind in a block of the back, under the other example. The text of the card is the model's
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

PEDACOS = ("prefix", "root", "suffix", "ending")
COR_DO_PEDACO = {"prefix": "#a855f7", "root": "#22c55e", "suffix": "#f59e0b", "ending": "#ef4444"}
NOME_DO_PEDACO = {"prefix": "Prefix", "root": "Root", "suffix": "Suffix", "ending": "Ending"}
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
        palavra, pedacos = _sem_acento(partes[0]), _pedacos_da_linha(partes[1:])
        if palavra and _pedacos_soletram(palavra, pedacos):
            palavras.append((palavra, pedacos))
    return palavras


def _pedacos_da_linha(partes: List[str]) -> List[Tuple[str, str]]:
    achados = [_LINHA_DO_PEDACO_RE.match(parte) for parte in partes]
    return [(achou.group(1).lower(), _sem_acento(achou.group(2)).strip("-– ")) for achou in achados if achou]


def _pedacos_soletram(palavra: str, pedacos: List[Tuple[str, str]]) -> bool:
    sem_pedaco_vazio = all(pedaco for _, pedaco in pedacos)
    return sem_pedaco_vazio and "".join(pedaco for _, pedaco in pedacos).lower() == palavra.lower()


COR_DA_PALAVRA_CHAVE = "#f59e0b"
MARCA_DA_PALAVRA_CHAVE = "font-weight: bold; border-bottom: 3px solid %s;" % COR_DA_PALAVRA_CHAVE


def _destacar(texto: str, palavra: str) -> str:
    """The text (HTML) with the first occurrence of the key word in one colour and bold; a text without the word is returned as it is."""
    achou = re.search(r"(?<!\w)%s(?!\w)" % re.escape(palavra), texto, re.IGNORECASE) if palavra else None
    if not achou:
        return texto
    return '%s<span style="color: %s; font-weight: bold;">%s</span>%s' % (texto[:achou.start()], COR_DA_PALAVRA_CHAVE, texto[achou.start():achou.end()], texto[achou.end():])


def _pintar(texto: str, palavras: List[Tuple[str, List[Tuple[str, str]]]], chave: str) -> str:
    """The sentence (HTML) with the first occurrence of each broken-down word coloured piece by piece (one colour for each kind); the key word is
    also bold with an underline, and one that is not among the broken-down words is highlighted whole. A word that is not in the sentence is skipped."""
    marcas: Dict[str, str] = {}
    for palavra, pedacos in palavras:
        achou = re.search(r"(?<!\w)%s(?!\w)" % re.escape(palavra), texto, re.IGNORECASE)
        if not achou:
            continue
        pintado = _pintada_pelos_pedacos(achou.group(0), pedacos)
        if _e_a_palavra_chave(palavra, chave):
            pintado = '<span style="%s">%s</span>' % (MARCA_DA_PALAVRA_CHAVE, pintado)
        marca = chr(0xE000 + len(marcas))  # Private Use Area: no later word can match it
        marcas[marca] = pintado
        texto = texto[:achou.start()] + marca + texto[achou.end():]
    sem_a_chave = not any(MARCA_DA_PALAVRA_CHAVE in pintado for pintado in marcas.values())
    if sem_a_chave:
        texto = _destacar(texto, chave)
    for marca, pintado in marcas.items():
        texto = texto.replace(marca, pintado)
    return texto


def _pintada_pelos_pedacos(original: str, pedacos: List[Tuple[str, str]]) -> str:
    inicio, pintado = 0, ""
    for tipo, pedaco in pedacos:
        pintado += '<span style="color: %s;">%s</span>' % (COR_DO_PEDACO[tipo], original[inicio:inicio + len(pedaco)])
        inicio += len(pedaco)
    return pintado


def _e_a_palavra_chave(palavra: str, chave: str) -> bool:
    return bool(chave) and palavra.lower() == chave.lower()


def _explicacao_das_cores(content: str) -> str:
    """One line per colour from the `Colors:` section (`kind | pieces | explanation`), prefix, root, suffix, ending."""
    por_tipo: Dict[str, str] = {}
    for tipo, pedacos, explicacao in _linhas_das_cores(content):
        por_tipo.setdefault(tipo, '<span style="color: %s;">%s</span> \u2013 %s' % (
            COR_DO_PEDACO[tipo], html.escape(pedacos, quote=False), html.escape(explicacao, quote=False)))
    return "<br>".join(por_tipo[tipo] for tipo in PEDACOS if tipo in por_tipo)


def _linhas_das_cores(content: str) -> List[Tuple[str, str, str]]:
    linhas = [[parte.strip() for parte in linha.split("|", 2)] for linha in _secao(content, "Colors")]
    return [(partes[0].lower(), partes[1], partes[2]) for partes in linhas if _cor_completa(partes)]


def _cor_completa(partes: List[str]) -> bool:
    tres_partes_preenchidas = len(partes) == 3 and all(partes)
    return tres_partes_preenchidas and partes[0].lower() in PEDACOS


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
    cartao = _TextoDoCartao(content.replace("## Anki Card", "").strip(), lang, estilo)
    valores = cartao.valores(palavra, imagem)
    valores["audio_da_frase"] = _som(audio_da_frase)
    valores["audio_da_palavra"] = _som(audio_da_palavra)

    campos = {nomes[chave]: valor for chave, valor in valores.items() if valor and chave in nomes}
    etiquetas: List[str] = _extract_tags_from_card(cartao.content)
    return {
        "campos": campos,
        "campo_da_frente": nomes["frase"],
        "frente_normalizada": normalize_front(cartao.frase, lang),
        "etiquetas": etiquetas,
    }


def _som(arquivo: Optional[str]) -> str:
    return "[sound:%s]" % arquivo if arquivo else ""


_PARTES_DA_MORFOLOGIA = ("morfologia", "explicacao_das_cores")
_PARTES_DESTACADAS = ("frase", "outro_exemplo")


class _TextoDoCartao:
    """The card text read in the style of its level: the Phrase as the front shows it, the Alignment pairs when the style colours
    them and the broken-down words when it has `morfologia`."""

    def __init__(self, content: str, lang: str, estilo: Dict[str, object]):
        self.content, self.estilo = content, estilo
        self.alinhamentos = _extract_alignments(content) if estilo["cores"] else []
        self.frase = _build_front(content, None, lang=lang, cores=estilo["cores"])
        self.palavras = morfologia_do_texto(content) if estilo.get("morfologia") else []

    def valores(self, palavra: Optional[str], imagem: Optional[str]) -> Dict[str, str]:
        valores = {"frase": self.frase}
        valores.update(self._morfologia())
        palavra_chave = self._palavra_chave(palavra)
        valores.update(self._verso(palavra_chave, imagem))
        _com_lacuna(valores, palavra or palavra_chave)
        if self.estilo.get("destaque"):
            self._destacar(valores, palavra_chave)
        fonte = _FONTE_RE.search(self.content)
        valores["fonte"] = fonte.group(1).strip() if fonte else ""
        return valores

    def _morfologia(self) -> Dict[str, str]:
        if not self.palavras:
            return {}
        morfologia = "<br>".join("%s = %s" % (p, " + ".join(parte for _, parte in pedacos)) for p, pedacos in self.palavras)
        return {"morfologia": morfologia, "explicacao_das_cores": _explicacao_das_cores(self.content)}

    def _palavra_chave(self, palavra: Optional[str]) -> str:
        return self._palavra_escrita() or self._palavra_do_verso() or palavra or ""

    def _palavra_escrita(self) -> str:
        escreve_a_palavra = self.estilo.get("morfologia") or "silaba_forte" in self.estilo["verso"]
        return _valor_do_rotulo(self.content, ROTULO_DA_PALAVRA) if escreve_a_palavra else ""

    def _palavra_do_verso(self) -> str:
        return _palavra_do_verso(self.content) if self.estilo["entrada"] == "palavras" else ""

    def _verso(self, palavra_chave: str, imagem: Optional[str]) -> Dict[str, str]:
        proprias = {"palavra": palavra_chave, "imagem": '<img src="%s">' % imagem if imagem else ""}
        verso: Dict[str, str] = {}
        for parte in self.estilo["verso"] + self.estilo.get("guarda", []):
            if parte in proprias:
                verso[parte] = proprias[parte]
            elif _escrita_com_rotulo(parte):
                verso[parte] = self._rotulada(parte)
        return verso

    def _rotulada(self, parte: str) -> str:
        valor = _valor_do_rotulo(self.content, estilos.rotulo(parte))
        if parte == "literal" and self.alinhamentos:
            valor = _apply_chunk_colors(valor, [para for _, para in self.alinhamentos], ignore_case=True)
        return _md_to_html(valor)

    def _destacar(self, valores: Dict[str, str], palavra_chave: str) -> None:
        for chave in _PARTES_DESTACADAS:
            if valores.get(chave):
                valores[chave] = _pintar(valores[chave], self.palavras, palavra_chave)


def _escrita_com_rotulo(parte: str) -> bool:
    return parte not in _PARTES_DA_MORFOLOGIA and bool(estilos.rotulo(parte))


def _com_lacuna(valores: Dict[str, str], palavra: str) -> None:
    lacuna = _frase_com_lacuna(valores["frase"], palavra)
    if lacuna:
        valores["lacuna"] = lacuna
        valores["dica"] = next((valores[parte] for parte in estilos.partes_da_dica() if valores.get(parte)), "")

import html
import re
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

if __package__:
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
    achou = _BACK_RE.search(content)
    return next((linha.strip() for linha in (achou.group(1).splitlines() if achou else []) if linha.strip()), "").strip("*").strip()


def _frase_com_lacuna(frase: str, palavra: str) -> str:
    if _NEGRITO_RE.search(frase):
        so_o_negrito = _TAG_RE.sub(lambda tag: tag.group(0) if tag.group(0) in ("<b>", "</b>") else "", frase)
        texto = _NEGRITO_RE.sub(_MARCA, so_o_negrito)
    else:
        texto = _TAG_RE.sub("", frase)
        if palavra.strip():
            texto = re.sub(re.escape(palavra.strip()), _MARCA, texto, flags=re.IGNORECASE)
    return texto.replace(_MARCA, _LACUNA) if _MARCA in texto else ""


def _secao(content: str, titulo: str) -> List[str]:
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
    achou = re.search(r"(?<!\w)%s(?!\w)" % re.escape(palavra), texto, re.IGNORECASE) if palavra else None
    if not achou:
        return texto
    return '%s<span style="color: %s; font-weight: bold;">%s</span>%s' % (texto[:achou.start()], COR_DA_PALAVRA_CHAVE, texto[achou.start():achou.end()], texto[achou.end():])


def _pintar(texto: str, palavras: List[Tuple[str, List[Tuple[str, str]]]], chave: str) -> str:
    marcas: Dict[str, str] = {}
    for palavra, pedacos in palavras:
        achou = re.search(r"(?<!\w)%s(?!\w)" % re.escape(palavra), texto, re.IGNORECASE)
        if not achou:
            continue
        pintado = _pintada_pelos_pedacos(achou.group(0), pedacos)
        if _e_a_palavra_chave(palavra, chave):
            pintado = '<span style="%s">%s</span>' % (MARCA_DA_PALAVRA_CHAVE, pintado)
        marca = chr(0xE000 + len(marcas))
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


@dataclass(frozen=True)
class AlemDoTexto:
    palavra: Optional[str] = None
    audio_da_frase: Optional[str] = None
    audio_da_palavra: Optional[str] = None
    imagem: Optional[str] = None


SO_O_TEXTO = AlemDoTexto()


def campos_da_nota(content: str, lang: str, *, nivel: Optional[str] = None, alem_do_texto: AlemDoTexto = SO_O_TEXTO) -> Dict[str, object]:
    idioma, estilo = estilos.idioma(lang), estilos.estilo(lang, nivel)
    nomes = idioma["campos"]
    cartao = _TextoDoCartao(content.replace("## Anki Card", "").strip(), lang, estilo)
    valores = cartao.valores(alem_do_texto.palavra, alem_do_texto.imagem)
    valores["audio_da_frase"] = _som(alem_do_texto.audio_da_frase)
    valores["audio_da_palavra"] = _som(alem_do_texto.audio_da_palavra)

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

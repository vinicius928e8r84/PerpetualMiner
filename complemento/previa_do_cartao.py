"""A prévia do Cartão (#164): o Cartão como o Anki o mostra, de um exemplo do estilo ou de uma nota gravada.

Quem desenha o Cartão é o Anki (o renderizador dele, com o modelo de Cartão do tipo de nota que a coleção tem): a Conexão só escolhe os
campos. O exemplo de um estilo (idioma × nível) é o texto de Cartão do `estilos.json` passado pela mesma `campos_da_nota` do Envio, e
vai para o tipo de nota que a coleção tem, então a prévia mostra também o verso que o Cartão vai ter de verdade. Uma nota gravada vai pelo
`guid` dela. Nada é gravado, salvo o tipo de nota do idioma, que a Conexão cria se a coleção ainda não o tem (o que o Envio faria).

A resposta é para uma página da extensão que a mostra num quadro isolado (sem scripts): o áudio vira um botão ▶ (a página não toca o
áudio do Anki) e a imagem vai dentro do HTML (`data:`), porque a página não alcança a pasta de mídia da coleção.
"""

import base64
import mimetypes
import re

from . import tipo_de_nota
from .baralhos import ColecaoIndisponivel
from .motor import estilos, nota_do_cartao

AUDIO_DO_EXEMPLO = ("exemplo-da-frase.mp3", "exemplo-da-palavra.mp3")
IMAGEM_DO_EXEMPLO = "exemplo.jpg"
TETO_DA_IMAGEM = 2 * 1024 * 1024  # uma imagem maior que isto não vai na prévia: fica o espaço dela
# Uma foto qualquer, do tamanho de uma miniatura: um retângulo com sol e morro, para o verso do exemplo mostrar onde a imagem fica.
ESPACO_DA_IMAGEM = (
    "data:image/svg+xml;base64," + base64.b64encode(
        b'<svg xmlns="http://www.w3.org/2000/svg" width="240" height="150" viewBox="0 0 240 150"><rect width="240" height="150" rx="8" fill="#e5e7eb"/>'
        b'<circle cx="180" cy="46" r="16" fill="#fbbf24"/><path d="M0 150 L82 58 L142 118 L180 90 L240 150 Z" fill="#9ca3af"/></svg>'
    ).decode("ascii")
)
BOTAO_DE_AUDIO = '<span class="pm-tocar" aria-hidden="true">\u25b6</span>'
CSS_DA_PREVIA = (
    ".pm-tocar { display: inline-block; width: 1.5em; height: 1.5em; line-height: 1.5em; margin: 0 .2em; border-radius: 50%; "
    "background: #e5e7eb; color: #374151; font-size: .8em; text-align: center; }\n"
)
_AUDIO_RE = re.compile(r"\[anki:play:[qa]:\d+\]")
_IMAGEM_RE = re.compile(r"""(<img\b[^>]*?\bsrc\s*=\s*)(["'])(.*?)\2""", re.IGNORECASE | re.DOTALL)


def _imagem_de_dentro(colecao, nome):
    """O `data:` da imagem da mídia da coleção, ou o espaço da imagem se ela não está lá, é grande demais ou não é imagem."""
    if re.match(r"(?i)(data|https?):", nome):
        return nome
    dados = colecao.arquivo_de_midia(nome, TETO_DA_IMAGEM)
    tipo = mimetypes.guess_type(nome)[0] or ""
    if dados is None or len(dados) > TETO_DA_IMAGEM or not tipo.startswith("image/"):
        return ESPACO_DA_IMAGEM
    return "data:%s;base64,%s" % (tipo, base64.b64encode(dados).decode("ascii"))


def _para_a_pagina(colecao, html):
    html = _AUDIO_RE.sub(BOTAO_DE_AUDIO, html)
    return _IMAGEM_RE.sub(lambda achou: "%s%s%s%s" % (achou.group(1), achou.group(2), _imagem_de_dentro(colecao, achou.group(3)), achou.group(2)), html)


def campos_do_exemplo(lang, nivel):
    """Os campos da nota que o Envio gravaria para o Cartão de exemplo do estilo, nos nomes do tipo de nota do idioma."""
    exemplo = estilos.exemplo(lang, nivel)
    return nota_do_cartao.campos_da_nota(
        exemplo["texto"], lang, nivel=nivel, palavra=exemplo["palavra"],
        audio_da_frase=AUDIO_DO_EXEMPLO[0], audio_da_palavra=AUDIO_DO_EXEMPLO[1], imagem=IMAGEM_DO_EXEMPLO)["campos"]


def _renderizado(colecao, tipo, campos):
    cartao = colecao.cartao_renderizado(tipo, campos)
    if cartao is None:
        return None
    return {"front": _para_a_pagina(colecao, cartao["frente"]), "back": _para_a_pagina(colecao, cartao["verso"]), "css": cartao["css"] + CSS_DA_PREVIA}


def previa_do_exemplo(colecao, lang, nivel):
    """O Cartão de exemplo do estilo, ou None se o tipo de nota some da coleção depois de criado. Cria o tipo de nota do idioma, se falta."""
    tipo_de_nota.garantir(colecao, tipo_de_nota.definicao(lang, nivel))
    idioma = estilos.idioma(lang)
    saida = _renderizado(colecao, idioma["tipo_de_nota"], campos_do_exemplo(lang, nivel))
    return saida and dict(saida, source="example", lang=lang, nivel=nivel, deck=idioma["baralho"], noteType=idioma["tipo_de_nota"])


def previa_da_nota(colecao, guid):
    """O Cartão de uma nota gravada, pelo `guid`; None se a coleção não tem a nota (ou o tipo de nota dela)."""
    nota = colecao.nota_gravada(guid)
    saida = nota and _renderizado(colecao, nota["tipo_de_nota"], nota["campos"])
    return saida and dict(saida, source="note", deck=nota["baralho"], noteType=nota["tipo_de_nota"])


def pedir(conexao, corpo):
    """A rota `POST /anki/card-preview`: `{ lang, nivel? }` (o exemplo do estilo; sem `nivel`, o Iniciante) ou `{ guid }` (uma nota gravada)."""
    guid, lang = corpo.get("guid"), corpo.get("lang")
    if isinstance(guid, str) and guid and "lang" not in corpo:
        leitura = lambda: previa_da_nota(conexao.colecao, guid)  # noqa: E731
    elif isinstance(lang, str) and "guid" not in corpo:
        if lang not in estilos.idiomas():
            return 400, {"error": "invalid_lang"}
        nivel = corpo.get("nivel", estilos.NIVEL_PADRAO)
        if nivel not in estilos.niveis(lang):
            return 400, {"error": "invalid_level"}
        leitura = lambda: previa_do_exemplo(conexao.colecao, lang, nivel)  # noqa: E731
    else:
        return 400, {"error": "invalid_request"}
    try:
        previa = leitura()
    except ColecaoIndisponivel as motivo:
        return 503, {"error": "anki_card_preview_unavailable", "detail": str(motivo)}
    if previa is None:
        return 404, {"error": "note_not_found" if guid else "note_type_missing"}
    return 200, previa


def abrir_no_anki(conexao, corpo):
    """A rota `POST /anki/browse` (o “Abrir no Anki”, #173): `{ guid }` → `200 { ok: true }`, e o Anki abre o navegador dele na nota (a thread principal dele, `no_anki`).
    `404 note_not_found` se a coleção não a tem; `503 anki_browse_unavailable` sem coleção aberta. Nada é gravado."""
    guid = corpo.get("guid")
    if not isinstance(guid, str) or not guid:
        return 400, {"error": "invalid_request"}
    try:
        achou = conexao.colecao.abrir_no_navegador(guid)
    except ColecaoIndisponivel as motivo:
        return 503, {"error": "anki_browse_unavailable", "detail": str(motivo)}
    return (200, {"ok": True}) if achou else (404, {"error": "note_not_found"})


ROTAS_DA_PREVIA = {("POST", "/anki/card-preview"): pedir, ("POST", "/anki/browse"): abrir_no_anki}

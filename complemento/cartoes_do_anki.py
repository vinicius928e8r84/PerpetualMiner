import html
import os
import re

from . import tipo_de_nota
from .baralhos import TipoDeNotaAlterado, TipoDeNotaAusente
from .motor import estilos

LIMITE_DA_FRASE_ESCRITA = 2000


def campos_do_tipo(modelo):
    return [campo["name"] for campo in sorted(modelo["flds"], key=lambda c: c["ord"])] if modelo else None


def renderizado(colecao, tipo_de_nota, campos):
    modelo = colecao.models.by_name(tipo_de_nota)
    if modelo is None:
        return None
    nota = colecao.new_note(modelo)
    tem = campos_do_tipo(modelo)
    for nome, valor in campos.items():
        if nome in tem:
            nota[nome] = valor
    saida = nota.ephemeral_card(0).render_output()
    return {"frente": saida.question_text, "verso": saida.answer_text, "css": saida.css}


def nota_gravada(colecao, guid):
    linhas = colecao.db.all(
        "select n.mid, n.flds, case when c.odid != 0 then c.odid else c.did end from notes n join cards c on c.nid = n.id where n.guid = ? limit 1", guid)
    if not linhas:
        return None
    modelo_id, campos, baralho_id = linhas[0]
    modelo = colecao.models.get(modelo_id)
    if modelo is None:
        return None
    nomes = campos_do_tipo(modelo)
    baralho = next((baralho.name for baralho in colecao.decks.all_names_and_ids() if int(baralho.id) == baralho_id), "")
    return {"baralho": baralho, "tipo_de_nota": modelo["name"], "campos": dict(zip(nomes, str(campos or "").split("\x1f")))}


def arquivo_de_midia(colecao, nome, limite_de_bytes):
    if not nome or os.path.basename(nome) != nome:
        return None
    try:
        with open(os.path.join(colecao.media.dir(), nome), "rb") as arquivo:
            return arquivo.read(limite_de_bytes + 1)
    except OSError:
        return None


def modelos_do_tipo(tipo):
    return [{"nome": cartao["name"], "frente": cartao["qfmt"], "verso": cartao["afmt"]} for cartao in tipo["tmpls"]] if tipo else None


def trocar_o_modelo(colecao, nome, modelo, css):
    tipo = colecao.models.by_name(nome)
    if tipo is None:
        raise TipoDeNotaAusente(nome)
    if len(tipo["tmpls"]) != 1:
        raise TipoDeNotaAlterado(nome)
    cartao = tipo["tmpls"][0]
    if (cartao["name"], cartao["qfmt"], cartao["afmt"], tipo["css"]) == (modelo["nome"], modelo["frente"], modelo["verso"], css):
        return False
    cartao["name"], cartao["qfmt"], cartao["afmt"], tipo["css"] = modelo["nome"], modelo["frente"], modelo["verso"], css
    modelos = colecao.models
    (modelos.update_dict if hasattr(modelos, "update_dict") else modelos.save)(tipo)
    return True


def gravar_frase_escrita(colecao, guid, texto):
    texto = texto.strip()[:LIMITE_DA_FRASE_ESCRITA]
    linhas = colecao.db.all("select id, mid from notes where guid = ?", guid)
    if not linhas:
        return False
    nota_id, modelo_id = linhas[0]
    tipo = colecao.models.get(modelo_id)
    nossos = {estilos.idioma(lang)["tipo_de_nota"]: estilos.idioma(lang)["campos"]["frase_escrita"] for lang in estilos.idiomas()}
    campo = nossos.get(tipo["name"]) if tipo else None
    if campo is None or campo not in campos_do_tipo(tipo):
        return False
    nota = colecao.get_note(nota_id)
    valor = como_campo(texto)
    if nota[campo] == valor:
        return False
    nota[campo] = valor
    colecao.update_note(nota) if hasattr(colecao, "update_note") else nota.flush()
    return True


def a_frase_como_texto(valor):
    return html.unescape(re.sub(r"<[^>]+>", "", re.sub(r"<br\s*/?>", "\n", str(valor or "")))).strip()


def _tem_os_campos_da_criacao(nomes, campos):
    return bool(nomes) and all(campos[chave] in nomes for chave in ("frase", "palavra", "frase_escrita", "escrito_antes", "correcao"))


def _a_ia_ainda_nao_leu(nota, campos):
    escrita = nota.get(campos["frase_escrita"], "")
    return bool(a_frase_como_texto(escrita)) and escrita != nota.get(campos["escrito_antes"], "")


def _frase_a_corrigir(guid, nota, campos):
    return {"guid": guid, "escrita": a_frase_como_texto(nota.get(campos["frase_escrita"], "")), "frase": a_frase_como_texto(nota.get(campos["frase"])),
            "palavra": a_frase_como_texto(nota.get(campos["palavra"]))}


def frases_a_corrigir(colecao, lang, limite):
    idioma = estilos.idioma(lang)
    tipo = colecao.models.by_name(idioma["tipo_de_nota"])
    nomes = campos_do_tipo(tipo)
    campos = idioma["campos"]
    if not _tem_os_campos_da_criacao(nomes, campos):
        return []
    achadas = []
    for guid, valores in colecao.db.all("select guid, flds from notes where mid = ? order by id", tipo["id"]):
        nota = dict(zip(nomes, str(valores or "").split("\x1f")))
        if _a_ia_ainda_nao_leu(nota, campos):
            achadas.append(_frase_a_corrigir(guid, nota, campos))
            if len(achadas) >= limite:
                break
    return achadas


def como_campo(texto):
    return html.escape(texto.strip(), quote=False).replace("\n", "<br>")


def gravar_correcao(colecao, guid, escrita, correcao):
    linhas = colecao.db.all("select id, mid from notes where guid = ?", guid)
    if not linhas:
        return False
    nota_id, modelo_id = linhas[0]
    tipo = colecao.models.get(modelo_id)
    do_tipo = next((estilos.idioma(lang)["campos"] for lang in estilos.idiomas() if tipo and estilos.idioma(lang)["tipo_de_nota"] == tipo["name"]), None)
    nomes = campos_do_tipo(tipo)
    if do_tipo is None or any(do_tipo[chave] not in nomes for chave in ("escrito_antes", "correcao")):
        return False
    nota = colecao.get_note(nota_id)
    nota[do_tipo["escrito_antes"]], nota[do_tipo["correcao"]] = como_campo(escrita), como_campo(correcao)
    colecao.update_note(nota) if hasattr(colecao, "update_note") else nota.flush()
    return True


def abrir_no_navegador(colecao, mw, guid):
    linhas = colecao.db.all("select id from notes where guid = ? limit 1", guid)
    if not linhas:
        return False
    from aqt import dialogs
    dialogs.open("Browser", mw, search=("nid:%d" % linhas[0][0],))
    return True

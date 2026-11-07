"""O que a prévia do Cartão (#164) lê da coleção do Anki: o Cartão desenhado pelo renderizador dele, uma nota pelo `guid` e um arquivo da pasta de
mídia. Cada função roda na thread principal do Anki, chamada pelo adaptador (`no_anki.ColecaoDoAnki`)."""

import html
import os
import re

from . import tipo_de_nota
from .baralhos import TipoDeNotaAlterado, TipoDeNotaAusente
from .motor import estilos

LIMITE_DA_FRASE_ESCRITA = 2000  # caracteres: a frase de uma pessoa estudando, e o que o gancho da revisão aceita de uma página


def campos_do_tipo(modelo):
    """Os nomes dos campos do tipo de nota, na ordem dele; None se o tipo não existe."""
    return [campo["name"] for campo in sorted(modelo["flds"], key=lambda c: c["ord"])] if modelo else None


def renderizado(colecao, tipo_de_nota, campos):
    """Na thread principal. Uma nota de mentira (nunca gravada) do tipo, desenhada pelo Anki (`ephemeral_card`, do 2.1.50 em diante)."""
    modelo = colecao.models.by_name(tipo_de_nota)
    if modelo is None:
        return None
    nota = colecao.new_note(modelo)
    tem = campos_do_tipo(modelo)
    for nome, valor in campos.items():
        if nome in tem:  # um tipo de nota com o nome do nosso e sem algum campo mostra o que ele tem: a prévia nunca falha por isso
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
    """Só um arquivo da pasta de mídia, nunca um caminho: o nome vem de um campo da nota."""
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
    """Na thread principal (a troca da frente, #166). Só o texto do modelo e o estilo do tipo de nota: nenhum campo, nenhuma nota. Com mais (ou menos) de um modelo, o tipo é da pessoa."""
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
    (modelos.update_dict if hasattr(modelos, "update_dict") else modelos.save)(tipo)  # `update_dict` é o do Anki novo; `save`, o dos mais antigos
    return True


def gravar_frase_escrita(colecao, guid, texto):
    """Na thread principal (o gancho da revisão da Criação, #168). Grava o `texto` no campo “Frase escrita” da nota de `guid`, só se a nota é de um tipo de
    nota da Conexão que tem o campo; qualquer outra nota (a página de uma revisão manda a mensagem, e ela não é de confiança) fica como está. Devolve se gravou."""
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
    colecao.update_note(nota) if hasattr(colecao, "update_note") else nota.flush()  # `update_note` é o do Anki novo; `flush`, o dos mais antigos
    return True


def a_frase_como_texto(valor):
    """O que um campo da nota diz como texto simples: sem as marcas do HTML (`<b>`, `<br>` vira linha) e sem os escapes que o gancho da revisão pôs."""
    return html.unescape(re.sub(r"<[^>]+>", "", re.sub(r"<br\s*/?>", "\n", str(valor or "")))).strip()


def frases_a_corrigir(colecao, lang, limite):
    """Na thread principal (o passo de correção do Envio, #169). As notas do tipo de nota do idioma `lang` com uma “Frase escrita” que a IA ainda não leu:
    o campo não está vazio e é diferente do “Escrito antes” (o que foi corrigido da última vez). Até `limite` notas, em texto simples:
    `{ guid, escrita, frase, palavra }`. Um tipo de nota sem os campos da Criação (a pessoa o mexeu) ou que não existe não dá nenhuma."""
    idioma = estilos.idioma(lang)
    tipo = colecao.models.by_name(idioma["tipo_de_nota"])
    nomes = campos_do_tipo(tipo)
    campos = idioma["campos"]
    if not nomes or any(campos[chave] not in nomes for chave in ("frase", "palavra", "frase_escrita", "escrito_antes", "correcao")):
        return []
    achadas = []
    for guid, valores in colecao.db.all("select guid, flds from notes where mid = ? order by id", tipo["id"]):
        nota = dict(zip(nomes, str(valores or "").split("\x1f")))
        escrita = nota.get(campos["frase_escrita"], "")
        if a_frase_como_texto(escrita) and escrita != nota.get(campos["escrito_antes"], ""):
            achadas.append({"guid": guid, "escrita": a_frase_como_texto(escrita), "frase": a_frase_como_texto(nota.get(campos["frase"])),
                            "palavra": a_frase_como_texto(nota.get(campos["palavra"]))})
            if len(achadas) >= limite:
                break
    return achadas


def como_campo(texto):
    """Um texto como o campo da nota o guarda: HTML escapado, a quebra de linha como `<br>` (a Frase escrita e a Correção)."""
    return html.escape(texto.strip(), quote=False).replace("\n", "<br>")


def gravar_correcao(colecao, guid, escrita, correcao):
    """Na thread principal. Grava a correção da IA na nota de `guid` (de um tipo de nota da Conexão com os campos da Criação): o “Escrito antes” fica
    com a frase que ela leu (`escrita`, em texto simples) e a “Correção” com o que ela devolveu, os dois como o gancho grava a frase (HTML escapado).
    Uma frase que a pessoa escreveu de novo enquanto a IA corrigia é outra: o “Escrito antes” diz qual foi corrigida e o Envio seguinte corrige a nova.
    Devolve se gravou."""
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
    colecao.update_note(nota) if hasattr(colecao, "update_note") else nota.flush()  # `update_note` é o do Anki novo; `flush`, o dos mais antigos
    return True


def abrir_no_navegador(colecao, mw, guid):
    """Na thread principal. Abre o navegador do Anki na nota de `guid` (o “Abrir no Anki”, #173); False se a coleção não a tem."""
    linhas = colecao.db.all("select id from notes where guid = ? limit 1", guid)
    if not linhas:
        return False
    from aqt import dialogs  # só existe dentro do Anki
    dialogs.open("Browser", mw, search=("nid:%d" % linhas[0][0],))
    return True

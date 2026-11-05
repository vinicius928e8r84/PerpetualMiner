"""O que a prévia do Cartão (#164) lê da coleção do Anki: o Cartão desenhado pelo renderizador dele, uma nota pelo `guid` e um arquivo da pasta de
mídia. Cada função roda na thread principal do Anki, chamada pelo adaptador (`no_anki.ColecaoDoAnki`)."""

import os


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

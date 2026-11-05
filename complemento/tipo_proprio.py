"""“Usar um tipo que já tenho” (#165): o Cartão gravado num tipo de nota da pessoa, pelo mapeamento que ela fez, em vez do tipo da Conexão.

O mapeamento diz em que campo do tipo dela vai cada **parte** do Cartão; várias partes podem ir no mesmo campo (os textos se juntam, um por linha). A Conexão
**só grava notas** nesse tipo: não o cria, não o conserta, não troca o modelo nem a frente dele (a frente que a pessoa já tem fica), e nunca escreve num campo
que o mapeamento não cita. Sem um campo para a Frase e outro, diferente, para a resposta, o Cartão não tem frente nem verso: o pedido é recusado e nada é gravado.

`tipoProprio` no pedido do Envio e da prévia: `{ nome: "o tipo de nota", mapa: { parte: "campo do tipo" } }`.
"""

from . import baralhos
from .motor import estilos

# As partes que a pessoa mapeia, na ordem em que os textos se juntam num campo. Cada uma é um grupo de campos do Cartão da Conexão (as chaves de
# `estilos.json`): a resposta é o verso do nível (a pronúncia, as traduções, o contexto, a definição, outro exemplo…), sem a Palavra, o áudio e a imagem.
PARTES = ("frase", "audio_da_frase", "resposta", "palavra", "audio_da_palavra", "imagem")
OBRIGATORIAS = ("frase", "resposta")
FORA_DA_RESPOSTA = ("palavra", "imagem", "audio_da_frase", "audio_da_palavra", "fonte")
SEPARADOR = "<br>"


def forma(bruto):
    """O `tipoProprio` normalizado (`{ nome, mapa }`, só as partes que a Conexão conhece, sem campo em branco), ou None se não tem a forma certa.
    Não olha a coleção: ver `recusa`."""
    if not isinstance(bruto, dict) or not isinstance(bruto.get("nome"), str) or not bruto["nome"].strip() or len(bruto["nome"]) > 256:
        return None
    mapa = bruto.get("mapa")
    if not isinstance(mapa, dict) or set(mapa) - set(PARTES):
        return None
    if not all(isinstance(campo, str) and 0 < len(campo) <= 256 for campo in mapa.values()):
        return None
    return {"nome": bruto["nome"], "mapa": {parte: mapa[parte] for parte in PARTES if parte in mapa}}


def recusa(tipo_proprio, campos_do_tipo):
    """Por que o mapeamento não serve ao tipo de nota (que tem `campos_do_tipo`), ou None se serve: `missing_field` (a Frase ou a resposta sem campo, ou os
    dois no mesmo) e `unknown_field` (o mapa cita um campo que o tipo não tem)."""
    mapa = tipo_proprio["mapa"]
    if any(campo not in campos_do_tipo for campo in mapa.values()):
        return "unknown_field"
    if any(parte not in mapa for parte in OBRIGATORIAS) or mapa["frase"] == mapa["resposta"]:
        return "missing_field"
    return None


def _chaves(parte, estilo):
    if parte == "resposta":
        return [chave for chave in estilo["verso"] if chave not in FORA_DA_RESPOSTA]
    return [parte]


def campos_do_tipo_proprio(campos_do_cartao, lang, nivel, mapa):
    """Os campos da nota no tipo da pessoa: o texto de cada parte (`campos_do_cartao` são os da Conexão, `campos_da_nota`) no campo em que o `mapa` a põe; as
    partes que dividem um campo se juntam na ordem de `PARTES`. Uma parte sem texto no Cartão não escreve nada, e um campo sem parte com texto não aparece."""
    nomes, estilo = estilos.idioma(lang)["campos"], estilos.estilo(lang, nivel)
    juntos = {}
    for parte in PARTES:
        if parte not in mapa:
            continue
        textos = [campos_do_cartao[nomes[chave]] for chave in _chaves(parte, estilo) if campos_do_cartao.get(nomes.get(chave))]
        if textos:
            juntos.setdefault(mapa[parte], []).extend(textos)
    return {campo: SEPARADOR.join(textos) for campo, textos in juntos.items()}


def tipos_da_pessoa(colecao):
    """Os tipos de nota da coleção que servem ao mapeamento: `[{ name, fields }]` pelo nome, sem os que a Conexão cria (esses a pessoa já tem pelo estilo pronto)."""
    nossos = {estilos.idioma(lang)["tipo_de_nota"] for lang in estilos.idiomas()}
    return [{"name": nome, "fields": campos} for nome, campos in sorted(colecao.tipos_de_nota().items()) if nome not in nossos]


def listar(conexao, corpo):
    """A rota `POST /anki/note-types`: os tipos de nota da pessoa e os campos deles, para o mapeamento."""
    try:
        return 200, {"noteTypes": tipos_da_pessoa(conexao.colecao)}
    except baralhos.ColecaoIndisponivel as motivo:
        return 503, {"error": "anki_note_types_unavailable", "detail": str(motivo)}


ROTAS_DO_TIPO_PROPRIO = {("POST", "/anki/note-types"): listar}

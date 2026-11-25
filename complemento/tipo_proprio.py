from . import baralhos
from .motor import estilos

PARTES = ("frase", "audio_da_frase", "resposta", "palavra", "audio_da_palavra", "imagem")
OBRIGATORIAS = ("frase", "resposta")
FORA_DA_RESPOSTA = ("palavra", "imagem", "audio_da_frase", "audio_da_palavra", "fonte")
SEPARADOR = "<br>"


def forma(bruto):
    if not isinstance(bruto, dict) or not _e_um_nome_de_tipo(bruto.get("nome")):
        return None
    mapa = bruto.get("mapa")
    if not _e_um_mapa_das_partes(mapa):
        return None
    return {"nome": bruto["nome"], "mapa": {parte: mapa[parte] for parte in PARTES if parte in mapa}}


def _e_um_nome_de_tipo(nome):
    return isinstance(nome, str) and nome.strip() != "" and len(nome) <= 256


def _e_um_mapa_das_partes(mapa):
    return isinstance(mapa, dict) and not set(mapa) - set(PARTES) and all(_e_um_nome_de_campo(campo) for campo in mapa.values())


def _e_um_nome_de_campo(campo):
    return isinstance(campo, str) and 0 < len(campo) <= 256


def recusa(tipo_proprio, campos_do_tipo):
    mapa = tipo_proprio["mapa"]
    if any(campo not in campos_do_tipo for campo in mapa.values()):
        return "unknown_field"
    if not _frase_e_resposta_cada_uma_no_seu_campo(mapa):
        return "missing_field"
    return None


def _frase_e_resposta_cada_uma_no_seu_campo(mapa):
    return all(parte in mapa for parte in OBRIGATORIAS) and mapa["frase"] != mapa["resposta"]


def _chaves(parte, estilo):
    if parte == "resposta":
        return [chave for chave in estilo["verso"] if chave not in FORA_DA_RESPOSTA]
    return [parte]


def campos_do_tipo_proprio(campos_do_cartao, lang, nivel, mapa):
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
    nossos = {estilos.idioma(lang)["tipo_de_nota"] for lang in estilos.idiomas()}
    return [{"name": nome, "fields": campos} for nome, campos in sorted(colecao.tipos_de_nota().items()) if nome not in nossos]


def listar(conexao, corpo):
    try:
        return 200, {"noteTypes": tipos_da_pessoa(conexao.colecao)}
    except baralhos.ColecaoIndisponivel as motivo:
        return 503, {"error": "anki_note_types_unavailable", "detail": str(motivo)}


ROTAS_DO_TIPO_PROPRIO = {("POST", "/anki/note-types"): listar}

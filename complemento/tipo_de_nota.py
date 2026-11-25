import os

from .baralhos import TipoDeNotaAlterado
from .motor import estilos

FRENTE_PADRAO = "frase_com_audio"
NOMES_DAS_FRENTES = {
    FRENTE_PADRAO: "Frase com áudio", "ouvir_primeiro": "Ouvir primeiro", "lacuna": "Lacuna", "producao": "Produção", "ditado": "Ditado", "criacao": "Criação"}
FRENTES = tuple(NOMES_DAS_FRENTES)
NOME_DO_MODELO = NOMES_DAS_FRENTES[FRENTE_PADRAO]
TEXTOS_DA_CRIACAO = {"pedido": "Escreva uma frase sua com esta palavra", "escreveu": "Você escreveu", "exemplo": "Exemplo", "usou": "✓ usou a palavra",
                     "antes": "Da última vez você escreveu"}
PASTA = os.path.dirname(os.path.abspath(__file__))
MENSAGEM_DA_CRIACAO = "perpetualminer:criacao:"
CSS = """.card { font-family: arial, sans-serif; font-size: 22px; text-align: center; color: #1f2937; background-color: #ffffff; }
.nightMode .card { color: #e5e7eb; background-color: #1f2937; }
.frase { font-size: 26px; margin-bottom: 8px; }
.pronuncia { color: #6b7280; font-style: italic; margin: 10px 0; }
.literal { margin: 10px 0; }
.natural { font-weight: bold; margin: 10px 0; }
.cena { color: #6b7280; font-size: 18px; margin: 10px 0; }
.palavra { margin: 14px 0; }
.definicao { margin: 10px 0; }
.simples { color: #6b7280; margin: 10px 0; }
.exemplo { color: #6b7280; font-style: italic; margin: 10px 0; }
.silaba { font-size: 24px; margin: 4px 0 10px; }
.cores { text-align: left; font-size: 18px; margin: 14px auto; max-width: 520px; line-height: 1.5; }
.raiz { color: #6b7280; margin: 10px 0; }
.imagem img { max-width: 100%; max-height: 320px; border-radius: 8px; }
"""

CSS_DA_CRIACAO = """.pedido { font-size: 18px; margin: 14px 0 6px; }
#perpetualminer-escrita { width: 90%; max-width: 520px; font-size: 20px; padding: 6px; box-sizing: border-box; }
.escreveu, .exemplo-da-criacao, .ultima-vez { margin: 12px auto; max-width: 520px; text-align: left; }
.ultima-vez .antes { color: #6b7280; }
.rotulo { color: #6b7280; font-size: 14px; text-transform: uppercase; letter-spacing: 0.04em; }
.usou { color: #15803d; font-size: 16px; margin-top: 4px; }
.nightMode .usou { color: #4ade80; }
"""


def _parte(classe, *campos, audio=()):
    principal = campos[0]
    corpo = " ".join("{{%s}}" % campo for campo in campos + tuple(audio))
    return "{{#%s}}<div class=\"%s\">%s</div>{{/%s}}" % (principal, classe, corpo, principal)


def _verso(idioma, partes):
    nomes = idioma["campos"]
    blocos = {
        "pronuncia": lambda: _parte("pronuncia", nomes["pronuncia"]),
        "literal": lambda: _parte("literal", nomes["literal"]),
        "natural": lambda: _parte("natural", nomes["natural"]),
        "cena": lambda: _parte("cena", nomes["cena"]),
        "palavra": lambda: _parte("palavra", nomes["palavra"], audio=(nomes["audio_da_palavra"],)),
        "definicao": lambda: _parte("definicao", nomes["definicao"]),
        "outro_exemplo": lambda: _parte("exemplo", nomes["outro_exemplo"]),
        "significado_simples": lambda: _parte("simples", nomes["significado_simples"]),
        "silaba_forte": lambda: _parte("silaba", nomes["silaba_forte"], audio=(nomes["audio_da_palavra"],)),
        "explicacao_das_cores": lambda: _parte("cores", nomes["explicacao_das_cores"]),
        "mesma_raiz": lambda: _parte("raiz", nomes["mesma_raiz"]),
        "imagem": lambda: _parte("imagem", nomes["imagem"]),
    }
    return "\n".join(blocos[parte]() for parte in partes if parte in blocos)


def _frente_com_lacuna(nomes):
    frase, audio, lacuna, dica = nomes["frase"], nomes["audio_da_frase"], nomes["lacuna"], nomes["dica"]
    return ('<div class="frase">{{#%s}}{{%s}}{{/%s}}{{^%s}}{{%s}}{{/%s}}</div>\n{{#%s}}<div class="dica cena">{{%s}}</div>{{/%s}}' % (
        lacuna, lacuna, lacuna, lacuna, frase, lacuna, dica, dica, dica), '<div class="frase">{{%s}}</div>\n{{%s}}' % (frase, audio))


def _frente_ouvir_primeiro(nomes):
    return '<div class="ouvir">{{%s}}</div>' % nomes["audio_da_frase"], '{{FrontSide}}\n<div class="frase">{{%s}}</div>' % nomes["frase"]


def _frente_ditado(nomes):
    na_frente = '<div class="ouvir">{{%s}}</div>\n{{type:%s}}' % (nomes["audio_da_frase"], nomes["frase"])
    return na_frente, na_frente


def _frente_producao(nomes):
    natural, definicao = nomes["natural"], nomes["definicao"]
    na_frente = '<div class="frase">{{#%s}}{{%s}}{{/%s}}{{^%s}}{{%s}}{{/%s}}</div>\n{{type:%s}}' % (natural, natural, natural, natural, definicao, natural, nomes["frase"])
    return na_frente, na_frente + "\n{{%s}}" % nomes["audio_da_frase"]


def _frente_com_audio(nomes):
    return '<div class="frase">{{%s}}</div>\n{{%s}}' % (nomes["frase"], nomes["audio_da_frase"]), "{{FrontSide}}"


def _frente(frente, nomes):
    return FRENTES_DO_MODELO.get(frente, _frente_com_audio)(nomes)


def _script_da_criacao():
    with open(os.path.join(PASTA, "modelo_da_criacao.js"), encoding="utf-8") as arquivo:
        linhas = [linha for linha in arquivo.read().splitlines() if not linha.lstrip().startswith("//")]
    return "<script>\n%s\n</script>" % "\n".join(linhas)


def _criacao(nomes):
    textos = TEXTOS_DA_CRIACAO
    frente = (
        '<div class="palavra">{{%(palavra)s}} {{%(audio_da_palavra)s}}</div>\n{{#%(dica)s}}<div class="dica cena">{{%(dica)s}}</div>{{/%(dica)s}}\n'
        '<div class="pedido">%(pedido)s</div>\n<textarea id="perpetualminer-escrita" rows="3" autocomplete="off"></textarea>\n' % dict(nomes, **textos)
        + _script_da_criacao())
    comeco_do_verso = (
        '<div class="escreveu" id="perpetualminer-escreveu" hidden><div class="rotulo">%(escreveu)s</div><div id="perpetualminer-texto"></div>'
        '<div class="usou" id="perpetualminer-usou" hidden>%(usou)s</div></div>\n'
        '<div class="exemplo-da-criacao"><div class="rotulo">%(exemplo)s</div><div class="frase">{{%(frase)s}}</div>{{%(audio_da_frase)s}}</div>\n'
        '<span id="perpetualminer-palavra" hidden>{{text:%(palavra)s}}</span><span id="perpetualminer-raiz" hidden>%(raiz)s</span>'
        '{{#%(correcao)s}}<div class="ultima-vez">%(antes)s <span class="antes">{{%(escrito_antes)s}}</span> → <b class="depois">{{%(correcao)s}}</b></div>{{/%(correcao)s}}\n'
        '<span id="perpetualminer-gravada" hidden>{{text:%(frase_escrita)s}}</span>\n' % dict(nomes, raiz="{{text:%s}}" % nomes["raiz"] if "raiz" in nomes else "", **textos)
        + _script_da_criacao())
    return frente, comeco_do_verso


FRENTES_DO_MODELO = {"criacao": _criacao, "producao": _frente_producao, "ditado": _frente_ditado, "ouvir_primeiro": _frente_ouvir_primeiro, "lacuna": _frente_com_lacuna}


def _repete_a_frase(nivel):
    return nivel.get("repete_a_frase") is not False


def _partes_so_dos_niveis_sem_a_frase(niveis):
    sem = [set(nivel["verso"]) for nivel in niveis if not _repete_a_frase(nivel)]
    com = [set(nivel["verso"]) for nivel in niveis if _repete_a_frase(nivel)]
    if not sem:
        return set()
    return set.intersection(*sem) - set().union(*com)


def _campo_do_verso_sem_a_frase(idioma, lang):
    so_dos_sem = _partes_so_dos_niveis_sem_a_frase([estilos.estilo(lang, nivel) for nivel in estilos.niveis(lang)])
    return next((idioma["campos"][parte] for parte in idioma.get("ordem_do_verso", []) if parte in so_dos_sem), None)


def _frente_no_verso(idioma, lang, frente, comeco_do_verso):
    frente_no_verso = comeco_do_verso + "\n<hr id=answer>"
    marca = _campo_do_verso_sem_a_frase(idioma, lang)
    if marca and frente == FRENTE_PADRAO:
        return "{{^%s}}%s{{/%s}}" % (marca, frente_no_verso, marca)
    return frente_no_verso


def _campos_do_cartao(nomes, estilo):
    escritos = ("frase", "audio_da_frase", "audio_da_palavra", "fonte") + tuple(estilo["verso"]) + tuple(estilo.get("guarda", []))
    return [nomes[chave] for chave in escritos]


def definicao(lang, nivel=None, frente=FRENTE_PADRAO, sem=()):
    idioma, estilo = estilos.idioma(lang), estilos.estilo(lang, nivel)
    nomes = idioma["campos"]
    if frente not in NOMES_DAS_FRENTES:
        raise KeyError(frente)
    na_frente, comeco_do_verso = _frente(frente, nomes)
    partes = [parte for parte in (idioma.get("ordem_do_verso") or estilos.estilo(lang)["verso"]) if nomes[parte] not in sem]
    verso = _frente_no_verso(idioma, lang, frente, comeco_do_verso) + "\n" + _verso(idioma, partes)
    return {
        "nome": idioma["tipo_de_nota"], "campos": list(nomes.values()), "campos_do_cartao": _campos_do_cartao(nomes, estilo),
        "opcionais": {nomes[chave]: nomes[onde] for chave, onde in idioma.get("opcionais", {}).items()},
        "modelos": [{"nome": NOMES_DAS_FRENTES[frente], "frente": na_frente, "verso": verso}], "css": CSS + (CSS_DA_CRIACAO if frente == "criacao" else "")}


def garantir(colecao, tipo):
    colecao.criar_tipo_de_nota(tipo)
    return colecao.tipo_de_nota(tipo["nome"])


def trocar_a_frente(colecao, lang, frente):
    tipo = definicao(lang, frente=frente)
    existente = colecao.tipo_de_nota(tipo["nome"])
    faltam = set(tipo["opcionais"]) - set(existente or tipo["campos"])
    if faltam:
        tipo = definicao(lang, frente=frente, sem=faltam)
    if colecao.criar_tipo_de_nota(tipo):
        return True
    return colecao.trocar_o_modelo(tipo["nome"], tipo["modelos"][0], tipo["css"])


def atualizar_a_criacao(colecao, lang):
    nome = definicao(lang, frente="criacao")["nome"]
    nomes_dos_modelos = [modelo["nome"] for modelo in colecao.modelos_do_tipo_de_nota(nome) or ()]
    if nomes_dos_modelos != [NOMES_DAS_FRENTES["criacao"]]:
        return False
    try:
        return trocar_a_frente(colecao, lang, "criacao")
    except TipoDeNotaAlterado:
        return False


def preparar(colecao):
    tipos = {lang: colecao.criar_tipo_de_nota(definicao(lang)) for lang in estilos.idiomas()}
    for lang, criado in tipos.items():
        if not criado:
            atualizar_a_criacao(colecao, lang)
    criados = colecao.criar_baralhos_da_instalacao_nova([estilos.idioma(lang)["baralho"] for lang in estilos.idiomas()])
    return {"tipos": tipos, "baralhos": criados}

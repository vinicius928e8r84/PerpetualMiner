"""O tipo de nota próprio de cada idioma (#161) e o que a Conexão prepara na coleção: os tipos e, numa instalação nova, os Baralhos.

Os nomes, os campos e as partes do verso vêm do `estilos.json` (`motor/estilos.py`): um idioma novo entra por dados. Os campos são
**todos** os que o idioma vai usar (os níveis, a morfologia do russo, as frentes e a Criação): mudar os campos de um tipo de nota
depois obriga o Anki a uma sincronização completa, então eles nascem juntos e o que o nível não usa fica vazio. A Conexão só **cria**:
um tipo de nota ou um Baralho que já existe não é tocado, e nada do que a pessoa já tem é renomeado, convertido nem apagado.
"""

from .motor import estilos

NOME_DO_MODELO = "Frase com áudio"  # a frente de hoje; as outras frentes (Ouvir primeiro, Lacuna…) entram como modelos do mesmo tipo
CSS = """.card { font-family: arial, sans-serif; font-size: 22px; text-align: center; color: #1f2937; background-color: #ffffff; }
.nightMode .card { color: #e5e7eb; background-color: #1f2937; }
.frase { font-size: 26px; margin-bottom: 8px; }
.pronuncia { color: #6b7280; font-style: italic; margin: 10px 0; }
.literal { margin: 10px 0; }
.natural { font-weight: bold; margin: 10px 0; }
.cena { color: #6b7280; font-size: 18px; margin: 10px 0; }
.palavra { margin: 14px 0; }
.definicao { margin: 10px 0; }
.exemplo { color: #6b7280; font-style: italic; margin: 10px 0; }
.imagem img { max-width: 100%; max-height: 320px; border-radius: 8px; }
"""


def _parte(classe, *campos, audio=()):
    """Um bloco do verso, que só aparece se o campo principal tem o que mostrar."""
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
        "imagem": lambda: _parte("imagem", nomes["imagem"]),
    }
    return "\n".join(blocos[parte]() for parte in partes if parte in blocos)


def definicao(lang, nivel=None):
    """O tipo de nota do idioma como a coleção o cria: `{ nome, campos: [nomes, na ordem], campos_do_cartao, modelos: [{ nome, frente, verso }], css }`.
    O verso do modelo é um só para todos os níveis do idioma: tem todas as partes que um verso pode ter (`ordem_do_verso`), cada uma só aparece se o
    campo dela tem texto, e o que o nível não usa fica vazio. `campos_do_cartao` são os que o Envio grava no `nivel` (o padrão, sem ele)."""
    idioma, estilo = estilos.idioma(lang), estilos.estilo(lang, nivel)
    nomes = idioma["campos"]
    frente = '<div class="frase">{{%s}}</div>\n{{%s}}' % (nomes["frase"], nomes["audio_da_frase"])
    verso = "{{FrontSide}}\n<hr id=answer>\n" + _verso(idioma, idioma.get("ordem_do_verso") or estilos.estilo(lang)["verso"])  # um idioma sem a ordem tem o verso do nível padrão
    escritos = ("frase", "audio_da_frase", "audio_da_palavra", "fonte") + tuple(estilo["verso"])  # o que o Envio grava: o tipo da pessoa tem de ter
    return {
        "nome": idioma["tipo_de_nota"], "campos": list(nomes.values()), "campos_do_cartao": [nomes[chave] for chave in escritos],
        "modelos": [{"nome": NOME_DO_MODELO, "frente": frente, "verso": verso}], "css": CSS}


def garantir(colecao, tipo):
    """Os campos do tipo de nota na coleção, criado se falta (a Conexão o prepara ao abrir o perfil; o Envio só o cria se a pessoa o apagou); None se não há."""
    colecao.criar_tipo_de_nota(tipo)
    return colecao.tipo_de_nota(tipo["nome"])


def preparar(colecao):
    """Deixa a coleção pronta para o Envio: o tipo de nota de cada idioma (criado se falta) e, numa instalação nova (nenhum Baralho além
    do “Default”), o Baralho de cada idioma. Repetir não cria nada de novo. Devolve `{ tipos: { idioma: criado }, baralhos: [criados] }`;
    levanta `ColecaoIndisponivel` se a coleção não está aberta, sincroniza ou está noutro perfil que o marcado."""
    tipos = {lang: colecao.criar_tipo_de_nota(definicao(lang)) for lang in estilos.idiomas()}
    criados = colecao.criar_baralhos_da_instalacao_nova([estilos.idioma(lang)["baralho"] for lang in estilos.idiomas()])
    return {"tipos": tipos, "baralhos": criados}

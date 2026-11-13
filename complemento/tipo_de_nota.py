"""O tipo de nota próprio de cada idioma (#161) e o que a Conexão prepara na coleção: os tipos e, numa instalação nova, os Baralhos.

Os nomes, os campos e as partes do verso vêm do `estilos.json` (`motor/estilos.py`): um idioma novo entra por dados. Os campos são
**todos** os que o idioma vai usar (os níveis, a morfologia do russo, as frentes e a Criação): mudar os campos de um tipo de nota
depois obriga o Anki a uma sincronização completa, então eles nascem juntos e o que o nível não usa fica vazio. A Conexão só **cria**:
um tipo de nota ou um Baralho que já existe não é tocado, e nada do que a pessoa já tem é renomeado, convertido nem apagado. A única exceção é o modelo
do Cartão Criação intacto, que acompanha a Conexão (`atualizar_a_criacao`, #390).
"""

import os

from .baralhos import TipoDeNotaAlterado
from .motor import estilos

# As frentes do Cartão (#166): cada uma é o modelo de Cartão do tipo de nota do idioma. O tipo tem **um** modelo só (um Cartão por Frase) e trocar a
# frente (`trocar_a_frente`) reescreve o modelo, sem tocar nas notas. O id é o que a extensão manda; o nome é o que o Anki mostra do modelo.
FRENTE_PADRAO = "frase_com_audio"
NOMES_DAS_FRENTES = {
    FRENTE_PADRAO: "Frase com áudio", "ouvir_primeiro": "Ouvir primeiro", "lacuna": "Lacuna", "producao": "Produção", "ditado": "Ditado", "criacao": "Criação"}
FRENTES = tuple(NOMES_DAS_FRENTES)
NOME_DO_MODELO = NOMES_DAS_FRENTES[FRENTE_PADRAO]
# O que a frente Criação (#168) diz no Cartão: a cópia aprovada de BRG-44 (`docs/design/voz/catalogo-nivel.md`); `test_criacao_do_cartao.py` a confere.
TEXTOS_DA_CRIACAO = {"pedido": "Escreva uma frase sua com esta palavra", "escreveu": "Você escreveu", "exemplo": "Exemplo", "usou": "✓ usou a palavra",
                     "antes": "Da última vez você escreveu"}
PASTA = os.path.dirname(os.path.abspath(__file__))
# O que o gancho da revisão (`criacao_na_revisao.py`) escuta: o script do modelo manda a frase escrita com esta mensagem.
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
"""  # só na frente Criação: as outras ficam com o estilo de sempre


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
        "significado_simples": lambda: _parte("simples", nomes["significado_simples"]),
        "silaba_forte": lambda: _parte("silaba", nomes["silaba_forte"], audio=(nomes["audio_da_palavra"],)),
        "explicacao_das_cores": lambda: _parte("cores", nomes["explicacao_das_cores"]),
        "mesma_raiz": lambda: _parte("raiz", nomes["mesma_raiz"]),
        "imagem": lambda: _parte("imagem", nomes["imagem"]),
    }
    return "\n".join(blocos[parte]() for parte in partes if parte in blocos)


def _frente(frente, nomes):
    """A frente e o começo do verso (o que vem antes das partes do nível) de cada frente. Ouvir primeiro: só o ▶ e, no verso, a Frase com a Palavra
    marcada (o negrito do campo). Lacuna: a Frase sem a Palavra e a Dica, sem áudio (ele entregaria a resposta); o verso tem a Frase com o áudio. Uma
    nota sem a Frase com lacuna (a Palavra não estava na Frase) mostra a Frase, também sem áudio.
    Produção e Ditado (#167) usam o campo de digitação do Anki (`{{type:Frase}}`): a pessoa escreve e o Anki compara com a Frase original. A Produção
    mostra a Frase em português (a Tradução natural; nos níveis que não a preenchem, que a extensão nem oferece, a Definição, para a frente nunca ficar só com o campo) e o Ditado só o ▶. Como no Basic (digitando a resposta) do
    Anki, o verso repete a frente (com o `{{type:Frase}}`, que vira a comparação letra por letra) em vez de `{{FrontSide}}`."""
    frase, audio, lacuna, dica = nomes["frase"], nomes["audio_da_frase"], nomes["lacuna"], nomes["dica"]
    if frente == "criacao":
        return _criacao(nomes)
    if frente in ("producao", "ditado"):
        digitar = "{{type:%s}}" % frase
        if frente == "ditado":
            na_frente = '<div class="ouvir">{{%s}}</div>\n%s' % (audio, digitar)
            return na_frente, na_frente
        natural, definicao = nomes["natural"], nomes["definicao"]
        na_frente = '<div class="frase">{{#%s}}{{%s}}{{/%s}}{{^%s}}{{%s}}{{/%s}}</div>\n%s' % (natural, natural, natural, natural, definicao, natural, digitar)
        return na_frente, na_frente + "\n{{%s}}" % audio
    if frente == "ouvir_primeiro":
        return '<div class="ouvir">{{%s}}</div>' % audio, '{{FrontSide}}\n<div class="frase">{{%s}}</div>' % frase
    if frente == "lacuna":
        return ('<div class="frase">{{#%s}}{{%s}}{{/%s}}{{^%s}}{{%s}}{{/%s}}</div>\n{{#%s}}<div class="dica cena">{{%s}}</div>{{/%s}}' % (
            lacuna, lacuna, lacuna, lacuna, frase, lacuna, dica, dica, dica), '<div class="frase">{{%s}}</div>\n{{%s}}' % (frase, audio))
    return '<div class="frase">{{%s}}</div>\n{{%s}}' % (frase, audio), "{{FrontSide}}"


def _script_da_criacao():
    """O script de `modelo_da_criacao.js`, sem as linhas só de comentário (o modelo leva o que roda)."""
    with open(os.path.join(PASTA, "modelo_da_criacao.js"), encoding="utf-8") as arquivo:
        linhas = [linha for linha in arquivo.read().splitlines() if not linha.lstrip().startswith("//")]
    return "<script>\n%s\n</script>" % "\n".join(linhas)


def _criacao(nomes):
    """A frente Criação (#168). Frente: a Palavra com o áudio, a Dica e o campo onde a pessoa escreve a frase dela (o campo de digitação do Anki não serve
    para resposta livre: o script guarda o texto, “Anki Persistence”). Verso: o que ela escreveu com “✓ usou a palavra” (conferido pelo script, sem IA)
    ao lado do exemplo (a Frase com o áudio); depois que a IA corrigiu a frase (#169), “Da última vez você escreveu … → correção”, dos campos “Escrito antes” e
    “Correção”. Os campos “Frase escrita” e “Raiz” chegam ao script como texto escondido: a frase gravada pela Conexão,
    para quando a página não guardou nada, e o radical da Palavra."""
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


def _campo_do_verso_sem_a_frase(idioma, lang):
    """O campo que só os níveis cujo verso não repete a Frase (`repete_a_frase: false`) preenchem, ou None se todos a repetem: o verso do
    modelo só traz a frente (`{{FrontSide}}`) quando ele está vazio. O primeiro na ordem do verso, para ser o mesmo a cada vez."""
    niveis = [estilos.estilo(lang, nivel) for nivel in estilos.niveis(lang)]
    sem, com = [n for n in niveis if n.get("repete_a_frase") is False], [n for n in niveis if n.get("repete_a_frase") is not False]
    if not sem:
        return None
    so_dos_sem = set.intersection(*(set(n["verso"]) for n in sem)) - set().union(*(set(n["verso"]) for n in com))
    return next((idioma["campos"][parte] for parte in idioma.get("ordem_do_verso", []) if parte in so_dos_sem), None)


def definicao(lang, nivel=None, frente=FRENTE_PADRAO, sem=()):
    """O tipo de nota do idioma como a coleção o cria: `{ nome, campos: [nomes, na ordem], campos_do_cartao, modelos: [{ nome, frente, verso }], css }`.
    O verso do modelo é um só para todos os níveis do idioma: tem todas as partes que um verso pode ter (`ordem_do_verso`), cada uma só aparece se o
    campo dela tem texto, e o que o nível não usa fica vazio. `campos_do_cartao` são os que o Envio grava no `nivel` (o padrão, sem ele). A `frente`
    (uma de `FRENTES`; `KeyError` se não é) escolhe a frente e o começo do verso do único modelo. `opcionais` são os campos que entraram depois da
    publicação do tipo (`{campo: campo onde o texto vai se o tipo da pessoa não o tem}`): um tipo criado antes não os tem e a Conexão não o muda;
    `sem` (nomes de campo) tira do verso as partes desses campos."""
    idioma, estilo = estilos.idioma(lang), estilos.estilo(lang, nivel)
    nomes = idioma["campos"]
    if frente not in NOMES_DAS_FRENTES:
        raise KeyError(frente)
    na_frente, comeco_do_verso = _frente(frente, nomes)
    frente_no_verso = comeco_do_verso + "\n<hr id=answer>"
    marca = _campo_do_verso_sem_a_frase(idioma, lang)
    if marca and frente == FRENTE_PADRAO:  # os níveis que não repetem a Frase deixam esse campo cheio, e o verso deles não tem a frente; nas outras frentes a Frase ainda não foi vista
        frente_no_verso = "{{^%s}}%s{{/%s}}" % (marca, frente_no_verso, marca)
    partes = [parte for parte in (idioma.get("ordem_do_verso") or estilos.estilo(lang)["verso"]) if nomes[parte] not in sem]  # um idioma sem a ordem tem o verso do nível padrão
    verso = frente_no_verso + "\n" + _verso(idioma, partes)
    escritos = ("frase", "audio_da_frase", "audio_da_palavra", "fonte") + tuple(estilo["verso"]) + tuple(estilo.get("guarda", []))  # o que o Envio sempre grava (a lacuna e a dica só às vezes): o tipo da pessoa tem de ter
    return {
        "nome": idioma["tipo_de_nota"], "campos": list(nomes.values()), "campos_do_cartao": [nomes[chave] for chave in escritos],
        "opcionais": {nomes[chave]: nomes[onde] for chave, onde in idioma.get("opcionais", {}).items()},
        "modelos": [{"nome": NOMES_DAS_FRENTES[frente], "frente": na_frente, "verso": verso}], "css": CSS + (CSS_DA_CRIACAO if frente == "criacao" else "")}


def garantir(colecao, tipo):
    """Os campos do tipo de nota na coleção, criado se falta (a Conexão o prepara ao abrir o perfil; o Envio só o cria se a pessoa o apagou); None se não há."""
    colecao.criar_tipo_de_nota(tipo)
    return colecao.tipo_de_nota(tipo["nome"])


def trocar_a_frente(colecao, lang, frente):
    """Põe a `frente` (`FRENTES`) no tipo de nota do idioma: reescreve o único modelo de Cartão (frente, verso, nome e estilo) e nada mais. Nenhuma nota
    é criada nem tocada, e a IA não é chamada: os Cartões que já existem passam a ter a frente nova na hora. Sem o tipo de nota (a pessoa o apagou), ele
    nasce já com a frente. Devolve se mudou algo; repetir devolve False. Levanta `TipoDeNotaAlterado` se o tipo não tem só o nosso modelo: a pessoa
    mexeu nele, e a Conexão não o regrava; `ColecaoIndisponivel` como toda gravação."""
    tipo = definicao(lang, frente=frente)
    existente = colecao.tipo_de_nota(tipo["nome"])
    faltam = set(tipo["opcionais"]) - set(existente or tipo["campos"])
    if faltam:  # um tipo de antes de um campo opcional: o verso novo não cita o campo que ele não tem
        tipo = definicao(lang, frente=frente, sem=faltam)
    if colecao.criar_tipo_de_nota(tipo):
        return True
    return colecao.trocar_o_modelo(tipo["nome"], tipo["modelos"][0], tipo["css"])


def atualizar_a_criacao(colecao, lang):
    """Regrava o modelo do Cartão Criação (frente, verso e estilo) se o que a Conexão entrega mudou (#390). Só se o tipo de nota do idioma ainda tem o nosso
    modelo Criação sozinho: a pessoa que o mexeu, ou que trocou de frente, fica como está. Nenhuma nota nem campo é tocado. Devolve se regravou."""
    nome = definicao(lang, frente="criacao")["nome"]
    modelos = colecao.modelos_do_tipo_de_nota(nome)
    if not (modelos and len(modelos) == 1 and modelos[0]["nome"] == NOMES_DAS_FRENTES["criacao"]):
        return False
    try:
        return trocar_a_frente(colecao, lang, "criacao")
    except TipoDeNotaAlterado:  # mexido entre a leitura e a gravação
        return False


def preparar(colecao):
    """Deixa a coleção pronta para o Envio: o tipo de nota de cada idioma (criado se falta) e, numa instalação nova (nenhum Baralho além
    do “Default”), o Baralho de cada idioma. Um tipo Criação já instalado e intacto recebe o modelo novo da Conexão (`atualizar_a_criacao`, #390). Repetir não cria nada de novo. Devolve `{ tipos: { idioma: criado }, baralhos: [criados] }`;
    levanta `ColecaoIndisponivel` se a coleção não está aberta, sincroniza ou está noutro perfil que o marcado."""
    tipos = {lang: colecao.criar_tipo_de_nota(definicao(lang)) for lang in estilos.idiomas()}
    for lang, criado in tipos.items():
        if not criado:
            atualizar_a_criacao(colecao, lang)
    criados = colecao.criar_baralhos_da_instalacao_nova([estilos.idioma(lang)["baralho"] for lang in estilos.idiomas()])
    return {"tipos": tipos, "baralhos": criados}

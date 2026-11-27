import json
import re

from .custos_dos_termos import pasta_do_mes
from .ia_dos_cartoes import ErroDaIA
from .modelo_dos_cartoes import PARADO, PLANO

IDIOMAS = {"en": "English", "ru": "Russian"}
TIPOS = ("palavra", "phrasal_verb", "expressao", "giria", "nome")
LIMITE_DA_LINHA = 500
MODELO_DA_CHAVE = "gpt-4o-mini"
RESPOSTA_INVALIDA = "ai_invalid_response"
PALAVRA = re.compile(r"[^\W_]+(?:['-][^\W_]+)*")

SISTEMA = """You find the Terms of one line that a language learner is reading. The user gives the language, the line, and the numbered words of the line (numbers start at 0).

A Term is one unit worth learning, made of one or more of the line's words. Give a Term for every word or group of words that carries meaning; leave out only the function words (articles, pronouns, prepositions, auxiliaries) that are not part of a longer Term. A word that belongs to a longer Term goes inside that Term, not alone.

Types (use these exact codes):
- palavra: one ordinary word.
- phrasal_verb: a verb with its particle(s), like "put up with". Its words can be apart ("look the word up").
- expressao: an idiom or fixed expression of several words.
- giria: slang, of one or more words.
- nome: a proper name (a person, a place, a brand).

"common" is true when a learner will often meet the Term in everyday speech or writing, and false when it is rare.

Answer only with a JSON object: {"terms": [{"words": [<word numbers>], "type": "<type>", "common": <true or false>}]}. Use only the numbers you were given."""


class RespostaInvalida(Exception):
    pass


def palavras_da_linha(texto):
    return PALAVRA.findall(texto)


def _linha_que_serve(texto):
    if not isinstance(texto, str) or len(texto) > LIMITE_DA_LINHA:
        return None
    linha = " ".join(texto.split())
    return linha if palavras_da_linha(linha) else None


def _mensagem(lang, linha, palavras):
    numeradas = "\n".join("%d %s" % (numero, palavra) for numero, palavra in enumerate(palavras))
    return "Language: %s\nLine: %s\nWords:\n%s" % (IDIOMAS[lang], linha, numeradas)


def _e_um_numero_de_palavra(numero, palavras):
    return isinstance(numero, int) and not isinstance(numero, bool) and 0 <= numero < len(palavras)


def _sao_numeros_de_palavra(numeros, palavras):
    return isinstance(numeros, list) and bool(numeros) and all(_e_um_numero_de_palavra(numero, palavras) for numero in numeros)


def _e_um_termo_que_serve(item, palavras):
    if not isinstance(item, dict):
        return False
    return _sao_numeros_de_palavra(item.get("words"), palavras) and item.get("type") in TIPOS and isinstance(item.get("common"), bool)


def _termo(item, palavras):
    if not _e_um_termo_que_serve(item, palavras):
        raise RespostaInvalida()
    posicoes = sorted(set(item["words"]))
    return {"texto": " ".join(palavras[posicao] for posicao in posicoes), "posicoes": posicoes, "tipo": item["type"], "comum": item["common"]}


def termos_da_resposta(texto, palavras):
    try:
        dados = json.loads(texto)
    except ValueError:
        raise RespostaInvalida() from None
    lista = dados.get("terms") if isinstance(dados, dict) else None
    if not isinstance(lista, list):
        raise RespostaInvalida()
    termos = []
    for item in lista:
        termo = _termo(item, palavras)
        if termo not in termos:
            termos.append(termo)
    return sorted(termos, key=lambda termo: (termo["posicoes"], termo["tipo"]))


def _linha_e_idioma_que_servem(lang, texto):
    linha = _linha_que_serve(texto)
    return linha if isinstance(lang, str) and lang in IDIOMAS else None


def ler_os_termos(conexao, lang, texto):
    linha = _linha_e_idioma_que_servem(lang, texto)
    if linha is None:
        return 400, {"error": "invalid_request"}
    paga = conexao.ia.para_os_termos(MODELO_DA_CHAVE)
    if paga.quem == PARADO:
        return 409, {"error": paga.motivo}
    palavras = palavras_da_linha(linha)
    try:
        resposta, uso = conexao.ia.ler_os_termos(paga, SISTEMA, _mensagem(lang, linha, palavras))
    except ErroDaIA as erro:
        conexao.logger.warning("Termos: a IA não leu a linha (%s)", erro.codigo)
        return 502, {"error": erro.codigo}
    conexao.ia.anotar_os_termos(paga, uso, pasta_do_mes(conexao.fila, lang), MODELO_DA_CHAVE)
    try:
        termos = termos_da_resposta(resposta, palavras)
    except RespostaInvalida:
        conexao.logger.warning("Termos: a resposta da IA não serviu")
        return 502, {"error": RESPOSTA_INVALIDA}
    return 200, {"termos": termos, "pagou": "plano" if paga.quem == PLANO else "chave"}

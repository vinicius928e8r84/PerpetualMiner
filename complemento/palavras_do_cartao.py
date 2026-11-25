
def palavras_da_frase(motor, lang, linha):
    entrada = motor.parser.parse_line(motor.estilos.estilo(lang)["entrada"], linha)
    return [] if entrada is None else list(entrada.keywords)


def cartoes_da_frase(motor, lang, linha):
    entrada = motor.parser.parse_line(motor.estilos.estilo(lang)["entrada"], linha)
    return 0 if entrada is None else len(motor.parser.get_card_jobs(entrada))


def com_as_palavras_fixas(motor, pedido):
    return [
        dict(entrada, keywords=palavras_da_frase(motor, pedido["lang"], entrada["line"])) if isinstance(entrada.get("line"), str) else entrada
        for entrada in pedido["entries"]]


def quantos_cartoes(motor, lang, entrada):
    fixas = entrada.get("keywords")
    return len(fixas) if isinstance(fixas, list) else cartoes_da_frase(motor, lang, entrada["line"])


def fixar_na_entrada(pedido, phrase_id, entrada_lida):
    fixas = next((e.get("keywords") for e in pedido["entries"] if e.get("phraseId") == phrase_id), None)
    if isinstance(fixas, list) and fixas:
        entrada_lida.keywords = list(fixas)


def esquecer(entrada):
    entrada.pop("line", None)
    entrada.pop("keywords", None)

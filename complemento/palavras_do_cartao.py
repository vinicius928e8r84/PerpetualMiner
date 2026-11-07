"""A Palavra de cada Cartão, fixada no pedido ao criar o Envio: um parser novo, numa volta depois, não a muda (#247).
Ela mora na entrada do pedido ao lado da linha (`keywords`) e some com ela no Apagar tudo e quando a Frase chega ao Anki."""


def palavras_da_frase(motor, lang, linha):
    """A Palavra de cada Cartão da linha, na ordem; vazio se a linha não se lê."""
    entrada = motor.parser.parse_line(motor.estilos.estilo(lang)["entrada"], linha)
    return [] if entrada is None else list(entrada.keywords)


def cartoes_da_frase(motor, lang, linha):
    """Quantos Cartões uma linha de mineração tem (um por Palavra, na ordem); 0 se a linha não se lê."""
    entrada = motor.parser.parse_line(motor.estilos.estilo(lang)["entrada"], linha)
    return 0 if entrada is None else len(motor.parser.get_card_jobs(entrada))


def com_as_palavras_fixas(motor, pedido):
    """As entradas do pedido, cada uma com a linha lida uma vez só."""
    return [
        dict(entrada, keywords=palavras_da_frase(motor, pedido["lang"], entrada["line"])) if isinstance(entrada.get("line"), str) else entrada
        for entrada in pedido["entries"]]


def quantos_cartoes(motor, lang, entrada):
    """Quantos Cartões a entrada tem: pelas Palavras fixadas, senão (pedido de antes) pela linha."""
    fixas = entrada.get("keywords")
    return len(fixas) if isinstance(fixas, list) else cartoes_da_frase(motor, lang, entrada["line"])


def fixar_na_entrada(pedido, phrase_id, entrada_lida):
    """Põe na entrada lida agora as Palavras que o criar fixou para a Frase (se o pedido as tem)."""
    fixas = next((e.get("keywords") for e in pedido["entries"] if e.get("phraseId") == phrase_id), None)
    if isinstance(fixas, list) and fixas:
        entrada_lida.keywords = list(fixas)


def esquecer(entrada):
    """Tira da entrada a linha e as Palavras fixadas."""
    entrada.pop("line", None)
    entrada.pop("keywords", None)

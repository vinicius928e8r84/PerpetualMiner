"""O Cartão que a OpenAI de mentira devolve para um pedido em russo: o do Iniciante (com o alinhamento) ou, se o prompt pede a seção
`Morphology:` (#163), o do Intermediário ou do Avançado."""

import re


def cartao_russo(pedido, texto_do_prompt):
    """O Cartão do pedido em russo, ou None se o pedido não é em russo."""
    if not re.search(r"[\u0400-\u04FF]", pedido):
        return None
    if "Morphology:" in texto_do_prompt:
        return cartao_russo_com_morfologia(pedido, "Same root: [" in texto_do_prompt)
    frase = pedido.split("\n")[0]
    return ("Front\n%s\n\nBack\nPronunciation: pronúncia de mentira\n\nLiteral: literal de mentira\n\nNatural: tradução de mentira\n\n"
            "Gist: cena de mentira.\n\nAlignment:\n1 | %s | literal\n" % (frase, frase.split()[0]))


def cartao_russo_com_morfologia(pedido, com_a_mesma_raiz):
    """O Cartão do Intermediário ou do Avançado do russo: a Palavra é a última da frase (sem a pontuação), partida em raiz e sufixo."""
    frase = pedido.split("\n")[0]
    palavra = re.sub(r"\W+$", "", frase.split()[-1])
    corte = max(len(palavra) - 3, 1)
    raiz, sufixo = palavra[:corte], palavra[corte:]
    morfologia = "%s | root:%s%s" % (palavra, raiz, " | suffix:%s" % sufixo if sufixo else "")
    cores = "root | %s | raiz de mentira" % raiz + ("\nsuffix | -%s | sufixo de mentira" % sufixo if sufixo else "")
    parte_da_raiz = "Same root: palavra da raiz (de mentira)\n\n" if com_a_mesma_raiz else ""
    return ("Front\n%s\n\nBack\nWord: %s\n\nStress: %s\u0301%s\n\nPronunciation: pronúncia de mentira\n\nDefinition: definição de mentira\n\n"
            "Other example: outro exemplo de mentira\n\nMorphology:\n%s\n\nColors:\n%s\n\nRoot: %s\n\n%s"
            "Google Image Search Queries:\n1. %s\n2. %s photo\n\nImage: A %s, no text.\n"
            % (frase, palavra, palavra[0], palavra[1:], morfologia, cores, raiz, parte_da_raiz, "palavra", "palavra", "palavra"))


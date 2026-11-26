"""O Anki de teste das provas (#896): o único Anki que aceita outra porta.

A prova da frota abre um Anki só dela, com uma pasta de dados descartável, e dá a ele uma porta livre. O Anki é de teste quando a
pasta de dados dele tem o arquivo `MARCA`, que só a prova escreve; a porta vem de `VARIAVEL_DA_PORTA`. Sem a marca a variável não
vale nada: o Anki do dono, mesmo com a variável esquecida no ambiente, fica na porta dos arredores (a 8766). Anki de teste sem uma
porta boa não sobe a Conexão: nunca cai na 8766.
"""

import os

from .configuracao import PORTA

MARCA = "anki-de-teste"
VARIAVEL_DA_PORTA = "PM_ANKI_DE_TESTE_PORTA"
PRIMEIRA_PORTA_LIVRE = 1024
ULTIMA_PORTA = 65535


class PortaDeTesteInvalida(ValueError):
    pass


def _e_de_teste(pasta_base):
    return bool(pasta_base) and os.path.isfile(os.path.join(pasta_base, MARCA))


def _porta_dada(ambiente):
    texto = ambiente.get(VARIAVEL_DA_PORTA)
    try:
        porta = int(texto)
    except (TypeError, ValueError):
        raise PortaDeTesteInvalida("o Anki de teste precisa de %s com um número de porta, e veio %r" % (VARIAVEL_DA_PORTA, texto)) from None
    if porta == PORTA or not PRIMEIRA_PORTA_LIVRE <= porta <= ULTIMA_PORTA:
        raise PortaDeTesteInvalida("o Anki de teste não usa a porta %d: só de %d a %d, e nunca a %d" % (porta, PRIMEIRA_PORTA_LIVRE, ULTIMA_PORTA, PORTA))
    return porta


def porta_da_conexao(ambiente, pasta_base, porta_dos_arredores):
    if not _e_de_teste(pasta_base):
        return porta_dos_arredores
    return _porta_dada(ambiente)

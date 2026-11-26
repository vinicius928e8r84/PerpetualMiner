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

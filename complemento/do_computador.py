import os
import sys

from . import abridor as abridores, item_de_login as itens_de_login, passagem as passagens
from .atualizacao import ARQUIVO_DE_QUEM_DESLIGOU, AnkiWebAusente, Atualizacao, RegistroDaAtualizacao

ABRIDOR_DESTE_COMPUTADOR = object()
PASSAGEM_DESTE_COMPUTADOR = object()


def item_de_login(item):
    if item is not None:
        return item
    return itens_de_login.deste_computador(plataforma=sys.platform, ambiente=os.environ, executavel=sys.executable)


def abridor(escolhido, pasta_do_complemento, dados):
    if escolhido is not ABRIDOR_DESTE_COMPUTADOR:
        return escolhido
    return abridores.deste_computador(
        computador=abridores.Computador(sys.platform, os.environ, sys.executable), pasta=os.path.join(dados.raiz, "abridor"),
        complemento=pasta_do_complemento,
    )


def passagem(escolhida, porta):
    if escolhida is not PASSAGEM_DESTE_COMPUTADOR:
        return escolhida
    return passagens.deste_computador(plataforma=sys.platform, ambiente=os.environ, porta=porta)


def atualizacao(dados, anki_web, atualizacao_automatica, ambiente):
    desligada = os.path.exists(os.path.join(dados.raiz, ARQUIVO_DE_QUEM_DESLIGOU))
    registro = RegistroDaAtualizacao(os.path.join(dados.raiz, "atualizacao.json"), ambiente.versao, ambiente.logger)
    return Atualizacao(registro=registro, anki_web=anki_web or AnkiWebAusente(), logger=ambiente.logger, ligada=atualizacao_automatica and not desligada)

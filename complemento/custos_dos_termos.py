import os
from datetime import date

from . import custos
from .fila_do_envio import agora_local
from .gravacao_de_json import gravar_json


def id_do_mes(lang, hoje):
    return "termos-%s-%04d-%02d" % (lang, hoje.year, hoje.month)


def _ficha_do_mes(lang):
    agora = agora_local()
    return {"createdAt": agora, "updatedAt": agora, "lang": lang, "deckName": "", "imageSource": "", "status": "completed", "stage": "completed",
            "requestedCards": 0, "successfulCards": 0, "failedCards": 0, "lastError": None, "successfulPhraseIds": [], "duplicatePhraseIds": []}


def pasta_do_mes(fila, lang, hoje=None):
    job_id = id_do_mes(lang, hoje or date.today())
    pasta = fila.pasta_dos_custos(job_id)
    with fila.tranca:
        if not os.path.exists(os.path.join(pasta, custos.ARQUIVO_DA_FICHA)):
            gravar_json(os.path.join(pasta, custos.ARQUIVO_DA_FICHA), _ficha_do_mes(lang))
    return pasta

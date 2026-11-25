import json
import urllib.error
import urllib.request

from . import openai_api
from .voz import FORA_DO_AR, RECUSADA, SEM_AUDIO, ErroDaVoz

MODELO = "tts-1"
VOZ = "alloy"
DOLARES_POR_MIL_LETRAS = 0.015
LIMITE_DA_RESPOSTA = 16 * 1024 * 1024


def _codigo_da_recusa(status):
    if status == 401:
        return openai_api.RECUSADA
    if status in (402, 429):
        return openai_api.SEM_CREDITO
    return FORA_DO_AR if status >= 500 else RECUSADA


def pedir_o_audio(base, chave, texto):
    corpo = json.dumps({"model": MODELO, "voice": VOZ, "input": texto, "response_format": "mp3"}).encode("utf-8")
    pedido = urllib.request.Request(base + "/v1/audio/speech", data=corpo, method="POST", headers={
        "Authorization": "Bearer " + chave, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(pedido, timeout=openai_api.TEMPO_DE_CADA_PEDIDO, context=openai_api.contexto_tls()) as resposta:
            audio = resposta.read(LIMITE_DA_RESPOSTA)
    except urllib.error.HTTPError as erro:
        erro.close()
        raise ErroDaVoz(_codigo_da_recusa(erro.code))
    except (urllib.error.URLError, OSError, ValueError):
        raise ErroDaVoz(FORA_DO_AR)
    if not audio:
        raise ErroDaVoz(SEM_AUDIO)
    return audio

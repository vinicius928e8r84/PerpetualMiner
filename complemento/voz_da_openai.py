"""A voz de reserva e a de Ouvir pela OpenAI (#174): o áudio de um texto pela chave, `POST /v1/audio/speech`, só com a biblioteca padrão.

A mesma voz para os dois idiomas (o `tts-1` fala o idioma do texto). O que a OpenAI diz ao recusar nunca é copiado para o log nem
para a resposta, porque a mensagem de uma chave recusada repete pedaços dela: quem pede recebe só um código (`voz.ErroDaVoz`).
O plano do ChatGPT não cobre voz: a chave é a única credencial daqui.
"""

import json
import urllib.error
import urllib.request

from . import openai_api
from .voz import FORA_DO_AR, RECUSADA, SEM_AUDIO, ErroDaVoz

MODELO = "tts-1"
VOZ = "alloy"
DOLARES_POR_MIL_LETRAS = 0.015  # o preço de tabela do `tts-1`, para a aba Custos
LIMITE_DA_RESPOSTA = 16 * 1024 * 1024


def _codigo_da_recusa(status):
    """O código que quem pede a voz recebe quando a OpenAI responde `status`, sem nada do que ela disse."""
    if status == 401:
        return openai_api.RECUSADA
    if status in (402, 429):
        return openai_api.SEM_CREDITO
    return FORA_DO_AR if status >= 500 else RECUSADA


def pedir_o_audio(base, chave, texto):
    """O MP3 que a OpenAI fala para `texto`; levanta `ErroDaVoz`."""
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

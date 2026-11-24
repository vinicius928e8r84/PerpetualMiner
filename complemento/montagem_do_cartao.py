"""Monta o Motor do Cartão do Envio: o texto, a voz, a imagem e as esperas das tentativas, sobre o motor de `engine/` da `Fila`."""

from .audio_do_cartao import AudioDoCartao, VozDeReserva, VozDoGoogle
from .imagem_do_cartao import ImagemDoCartao
from .motor_do_cartao import EsperasDaOpenai, MotorDoCartao


def motor_do_cartao(fila, servicos, esperas, adaptador_de_imagem=None):
    """O `MotorDoCartao` da `fila` (o motor, o logger e a tranca dela) para os `servicos` (`ServicosDeFora`) e as `esperas` (`Esperas`).
    `adaptador_de_imagem` converte a imagem para PNG (None: o Qt do Anki)."""
    da_openai = EsperasDaOpenai(esperas.parar, esperas.da_openai)
    audio = AudioDoCartao(fila.motor, fila.logger, VozDoGoogle(servicos.voz, da_openai), VozDeReserva(servicos.openai, fila.tranca, fila.logger))
    return MotorDoCartao(fila.motor, da_openai, audio, ImagemDoCartao(fila.motor, fila.logger, servicos.openverse, adaptador_de_imagem))

from .audio_do_cartao import AudioDoCartao, VozDeReserva, VozDoGoogle
from .imagem_do_cartao import ImagemDoCartao
from .motor_do_cartao import EsperasDaOpenai, MotorDoCartao


def motor_do_cartao(fila, servicos, esperas, adaptador_de_imagem=None):
    da_openai = EsperasDaOpenai(esperas.parar, esperas.da_openai)
    audio = AudioDoCartao(fila.motor, fila.logger, VozDoGoogle(servicos.voz, da_openai), VozDeReserva(servicos.openai, fila.tranca, fila.logger))
    return MotorDoCartao(fila.motor, da_openai, audio, ImagemDoCartao(fila.motor, fila.logger, servicos.openverse, adaptador_de_imagem))

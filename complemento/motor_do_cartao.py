from dataclasses import dataclass

from .limite_do_plano import LIMITE_DO_PLANO
from .palavras_do_cartao import fixar_na_entrada
from .paradas_do_envio import Interrompido

PASSAGEIROS = ("openai_rate_limited", "openai_unreachable", "generation_error", "empty_response")


@dataclass(frozen=True)
class Cartao:
    id: str
    guid: str
    linha: str
    pedido: dict
    config: dict
    job_id: str = ""


class EsperasDaOpenai:
    def __init__(self, parar, segundos=(2, 8, 30)):
        self.parar, self.segundos = parar, tuple(segundos)

    def _dormir(self, segundos):
        if self.parar.wait(segundos):
            raise Interrompido()

    def tentativas(self):
        yield
        for segundos in self.segundos:
            self._dormir(segundos)
            yield


class MotorDoCartao:
    def __init__(self, motor, esperas, audio, imagem):
        self.motor, self.esperas, self._audio, self._imagem = motor, esperas, audio, imagem

    def escrever(self, cartao, ia):
        while True:
            codigo = self._o_texto(cartao, ia.pedido_do_texto(cartao.config))
            if codigo != LIMITE_DO_PLANO:
                return codigo
            ia.esperar_o_plano()

    def _o_texto(self, cartao, pedir):
        phrase_id, posicao = cartao.id.rsplit("-", 1)
        entrada = self.motor.parser.parse_line(cartao.config["estilo"]["entrada"], cartao.linha)
        if entrada is None:
            return "invalid_card"
        fixar_na_entrada(cartao.pedido, int(phrase_id), entrada)
        trabalho = self.motor.parser.get_card_jobs(entrada)[int(posicao)]
        codigo = None
        for _ in self.esperas.tentativas():
            codigo = self.motor.generate_cards.escrever(trabalho, cartao.config, pedir, cartao.id)
            if codigo not in PASSAGEIROS:
                break
        return codigo

    def montar(self, cartao, texto, ia, avisar):
        arquivos, da_frase, da_palavra, palavra = self._audio.vozes(cartao, texto, ia, avisar)
        imagem, da_imagem = self._imagem.imagem(cartao, texto, ia, avisar)
        arquivos.update(imagem)
        pedido = cartao.pedido
        alem_do_texto = self.motor.nota_do_cartao.AlemDoTexto(palavra=palavra, audio_da_frase=da_frase, audio_da_palavra=da_palavra, imagem=da_imagem)
        nota = self.motor.nota_do_cartao.campos_da_nota(texto, pedido["lang"], nivel=pedido.get("nivel"), alem_do_texto=alem_do_texto)
        return nota, arquivos

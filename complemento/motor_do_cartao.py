"""O Motor do Cartão (C4): o que o Envio chama para fazer um Cartão, no lugar das heranças do `Trabalho`. Desenho: `docs/design/ia-dos-cartoes.md`.

`montar(cartao, texto, ia, avisar)` faz, do texto pago de um Cartão, a nota e a mídia dela: as vozes (`audio_do_cartao.py`), a imagem
(`imagem_do_cartao.py`) e os campos no Estilo do cartão (`motor/nota_do_cartao.py`). Pode ser refeito: não grava nada na pasta de dados, e
o que ele paga (a voz de reserva, o juiz, a triagem, a imagem gerada) a porta da IA dos cartões (`ia`) decide quem paga. `avisar(etapa)`
diz ao Envio a Etapa em que o Cartão está. O que fica com o Envio: a fila, o estado, a coleção e o tipo de nota."""

from dataclasses import dataclass

from .audio_do_cartao import AudioDoCartao
from .imagem_do_cartao import ImagemDoCartao
from .paradas_do_envio import Interrompido


@dataclass(frozen=True)
class Cartao:
    """Um Cartão de um Envio como o Motor o vê: `id` é `<phraseId>-<posição da Palavra>`, `guid` o da nota, `linha` a linha minerada,
    `pedido` o do Envio (o idioma, o nível, as vozes, a fonte da imagem), `config` a do motor para o Envio (`motor_do_envio`),
    `pela_chave` o Usar a minha chave do Envio e `job_id` só para o log."""

    id: str
    guid: str
    linha: str
    pedido: dict
    config: dict
    pela_chave: bool = False
    job_id: str = ""


class MotorDoCartao:
    """`motor` é o de `engine/` (`motor_do_envio.motor_do_complemento()`), `tranca` a da fila e `parar` o evento que para a Conexão."""

    def __init__(self, motor, logger, tranca, parar, openai_base, voz_base, openverse_base, adaptador_de_imagem=None, esperas_da_openai=(2, 8, 30)):
        self.motor, self.parar = motor, parar
        self._audio = AudioDoCartao(motor, logger, tranca, self._dormir, openai_base, voz_base, esperas_da_openai)
        self._imagem = ImagemDoCartao(motor, logger, openverse_base, adaptador_de_imagem)

    def _dormir(self, segundos):
        if self.parar.wait(segundos):
            raise Interrompido()

    def montar(self, cartao, texto, ia, avisar):
        """`(a nota, {nome: bytes} da mídia)`: a nota é a de `nota_do_cartao.campos_da_nota`. Levanta `voz.ErroDaVoz` (o Cartão falha com o
        código) e `imagem_do_cartao.ParaOEnvio` (o plano do ChatGPT não deixa seguir); a imagem que só falha deixa o Cartão sem ela."""
        arquivos, da_frase, da_palavra, palavra = self._audio.vozes(cartao, texto, ia, avisar)
        imagem, da_imagem = self._imagem.imagem(cartao, texto, ia, avisar)
        arquivos.update(imagem)
        pedido = cartao.pedido
        nota = self.motor.nota_do_cartao.campos_da_nota(
            texto, pedido["lang"], nivel=pedido.get("nivel"), palavra=palavra, audio_da_frase=da_frase, audio_da_palavra=da_palavra, imagem=da_imagem)
        return nota, arquivos

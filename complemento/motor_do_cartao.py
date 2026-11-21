"""O Motor do Cartão (C4): as duas entradas que o Envio chama para fazer um Cartão, no lugar das heranças do `Trabalho`. Desenho:
`docs/design/ia-dos-cartoes.md`. As duas recebem `ia`, a porta da IA dos cartões presa ao Envio (`ia_do_envio.IaDoEnvio`).

`escrever(cartao, ia)` escreve o texto do Cartão, pago e guardado no disco (`motor/generate_cards.py`): o que já está lá nunca é pedido de
novo, a falha passageira é pedida de novo nas esperas da OpenAI e o plano no limite é uma espera da porta.

`montar(cartao, texto, ia, avisar)` faz, do texto pago de um Cartão, a nota e a mídia dela: as vozes (`audio_do_cartao.py`), a imagem
(`imagem_do_cartao.py`) e os campos no Estilo do cartão (`motor/nota_do_cartao.py`). Pode ser refeito: não grava nada na pasta de dados, e
o que ele paga (a voz de reserva, o juiz, a triagem, a imagem gerada) a porta decide quem paga. `avisar(etapa)`
diz ao Envio a Etapa em que o Cartão está. O que fica com o Envio: a fila, o estado, a coleção e o tipo de nota."""

from dataclasses import dataclass

from .limite_do_plano import LIMITE_DO_PLANO
from .palavras_do_cartao import fixar_na_entrada
from .paradas_do_envio import Interrompido

PASSAGEIROS = ("openai_rate_limited", "openai_unreachable", "generation_error", "empty_response")


@dataclass(frozen=True)
class Cartao:
    """Um Cartão de um Envio como o Motor o vê: `id` é `<phraseId>-<posição da Palavra>`, `guid` o da nota, `linha` a linha minerada,
    `pedido` o do Envio (o idioma, o nível, as Palavras fixadas, as vozes, a fonte da imagem), `config` a do motor para o Envio
    (`motor_do_envio`) e `job_id` só para o log."""

    id: str
    guid: str
    linha: str
    pedido: dict
    config: dict
    job_id: str = ""


class EsperasDaOpenai:
    """As esperas antes de pedir de novo o que falhou por um motivo passageiro (o texto à OpenAI, a voz ao Google): `segundos`, uma por
    tentativa nova. `parar` é o evento que para a Conexão: a espera que ele corta levanta `Interrompido`."""

    def __init__(self, parar, segundos=(2, 8, 30)):
        self.parar, self.segundos = parar, tuple(segundos)

    def _dormir(self, segundos):
        if self.parar.wait(segundos):
            raise Interrompido()

    def tentativas(self):
        """Uma volta por tentativa: a primeira logo, cada outra depois da sua espera."""
        yield
        for segundos in self.segundos:
            self._dormir(segundos)
            yield


class MotorDoCartao:
    """`motor` é o de `engine/` (`motor_do_envio.motor_do_complemento()`), `esperas` as `EsperasDaOpenai` do Envio, `audio` o
    `audio_do_cartao.AudioDoCartao` e `imagem` o `imagem_do_cartao.ImagemDoCartao`."""

    def __init__(self, motor, esperas, audio, imagem):
        self.motor, self.esperas, self._audio, self._imagem = motor, esperas, audio, imagem

    def escrever(self, cartao, ia):
        """None quando o texto do Cartão está no disco (`<output_dir>/<id>.txt`), senão o código da falha. Levanta `SemQuemPague` (da porta)."""
        while True:
            codigo = self._o_texto(cartao, ia.pedido_do_texto(cartao.config))
            if codigo != LIMITE_DO_PLANO:
                return codigo
            ia.esperar_o_plano()

    def _o_texto(self, cartao, pedir):
        """O texto pelo `pedir` da porta, pedido de novo enquanto falha por um motivo passageiro; devolve o código da falha, ou None."""
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
        """`(a nota, {nome: bytes} da mídia)`: a nota é a de `nota_do_cartao.campos_da_nota`. Levanta `voz.ErroDaVoz` (o Cartão falha com o
        código) e `imagem_do_cartao.ParaOEnvio` (o plano do ChatGPT não deixa seguir); a imagem que só falha deixa o Cartão sem ela."""
        arquivos, da_frase, da_palavra, palavra = self._audio.vozes(cartao, texto, ia, avisar)
        imagem, da_imagem = self._imagem.imagem(cartao, texto, ia, avisar)
        arquivos.update(imagem)
        pedido = cartao.pedido
        nota = self.motor.nota_do_cartao.campos_da_nota(
            texto, pedido["lang"], nivel=pedido.get("nivel"), palavra=palavra, audio_da_frase=da_frase, audio_da_palavra=da_palavra, imagem=da_imagem)
        return nota, arquivos

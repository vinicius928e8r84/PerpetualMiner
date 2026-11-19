"""A imagem do Cartão dentro do Envio (#144): a foto real que o juiz escolhe (Openverse) ou a imagem gerada pela chave, pelo
código de `motor/image_pipeline.py`, só com a biblioteca padrão. O que precisa de biblioteca de imagem (converter
JPEG, WebP ou GIF em PNG) passa pelo adaptador de `motor/image_utils.py`: aqui, o Qt do Anki (`imagem_qt.py`). Quem usa é o
`montar` do Motor do Cartão (`motor_do_cartao.py`); a imagem não fica na pasta de dados: vai da rede à coleção do Anki na mesma volta.

Só a imagem falha → o Cartão vai sem ela e conta como enviado. Com o login do ChatGPT (#156), o juiz vai pelo plano e a triagem e a
imagem gerada, sempre pela chave; sem chave o Cartão leva a foto real ou nenhuma imagem gerada. O plano que não deixa seguir (limite de
uso, conta que não serve, login recusado ou acabado) levanta `ParaOEnvio`: o Cartão fica com o texto pago e o Envio para com o código."""

import tempfile
from pathlib import Path

from .imagem_qt import AdaptadorQt
from .login_do_chatgpt import SAIU

DO_PLANO_QUE_PARA = ("chatgpt_usage_limit", "chatgpt_not_eligible", "chatgpt_rejected", SAIU)


class ParaOEnvio(Exception):
    """O plano do ChatGPT não deixa o Envio seguir: `codigo` é o que fica no Cartão e no Envio."""

    def __init__(self, codigo):
        super().__init__(codigo)
        self.codigo = codigo


class ImagemDoCartao:
    """A imagem de um Cartão. `adaptador_de_imagem` converte para PNG (None: o Qt do Anki)."""

    def __init__(self, motor, logger, openverse_base, adaptador_de_imagem=None):
        self.motor, self.logger, self.openverse_base, self.adaptador_de_imagem = motor, logger, openverse_base, adaptador_de_imagem

    def imagem(self, cartao, texto, ia, avisar):
        """A imagem do `cartao` (`motor_do_cartao.Cartao`) com o `texto` dele: `({nome: bytes}, nome)`, ou `({}, None)` se não veio. Só levanta
        `ParaOEnvio`."""
        avisar("generate_images")
        try:
            dados = self._escolher_a_imagem(cartao, texto, ia)
        except Exception as erro:
            if getattr(erro, "codigo", None) in DO_PLANO_QUE_PARA:
                raise ParaOEnvio(erro.codigo) from None
            self.logger.warning("Envio %s: a imagem do Cartão %s não veio (%s)", cartao.job_id, cartao.id, getattr(erro, "codigo", type(erro).__name__))
            return {}, None
        if not dados:
            self.logger.info("Envio %s: o Cartão %s vai sem imagem", cartao.job_id, cartao.id)
            return {}, None
        nome = cartao.guid + ".png"
        return {nome: dados}, nome

    def _escolher_a_imagem(self, cartao, texto, ia):
        """Os bytes do PNG escolhido para o Cartão, ou None se nenhuma imagem serviu. Com o Usar a minha chave (#158) do Cartão, o juiz também
        vai pela chave."""
        pedido, config = cartao.pedido, cartao.config
        juiz, chave = ia.para_a_imagem(cartao.pela_chave)
        if not juiz or (pedido["imageSource"] != "1" and not chave):
            return None
        motor = self.motor
        motor.image_utils.usar_adaptador(self.adaptador_de_imagem or AdaptadorQt())
        configurada = dict(config, pela_chave=chave, juiz_da_imagem=juiz, openverse_base=self.openverse_base, image_records_by_card=True)
        pipeline = motor.image_pipeline.build(configurada, Path(config["paths"]["output_dir"]), pedido["imageSource"], chave, config["paths"]["log_dir"])
        prompt = motor.extract_prompts.card_prompt(texto)
        with tempfile.TemporaryDirectory(prefix="perpetualminer_imagem_") as pasta:
            destino = Path(pasta) / "imagem.png"
            if pedido["imageSource"] == "1":
                feita = pipeline.real_first(cartao.id, prompt, destino, generation_policy="normal" if chave else "free_only")
            else:
                feita = pipeline.generate_direct(cartao.id, prompt, destino) == "ok"
            return destino.read_bytes() if feita and destino.exists() else None

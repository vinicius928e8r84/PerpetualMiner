"""A imagem do Cartão dentro do Envio (#144): a foto real que o juiz escolhe (Openverse) ou a imagem gerada pela chave, pelo
código de `motor/image_pipeline.py`, só com a biblioteca padrão. O que precisa de biblioteca de imagem (converter
JPEG, WebP ou GIF em PNG) passa pelo adaptador de `motor/image_utils.py`: aqui, o Qt do Anki (`imagem_qt.py`). Quem usa é
`envio.Trabalho`, que herda daqui; a imagem não fica na pasta de dados: vai da rede à coleção do Anki na mesma volta.

Só a imagem falha → o Cartão vai sem ela e conta como enviado. Com o login do ChatGPT (#156), o juiz vai pelo plano e a triagem e a
imagem gerada, sempre pela chave; sem chave o Cartão leva a foto real ou nenhuma imagem gerada. O plano que não deixa seguir (limite de
uso, conta que não serve, login recusado ou acabado) levanta `ParaOEnvio`: o Cartão fica com o texto pago e o Envio para com o código."""

import tempfile
from pathlib import Path

from .imagem_qt import AdaptadorQt
from .login_do_chatgpt import SAIU
from .modelo_dos_cartoes import credencial_da_imagem

DO_PLANO_QUE_PARA = ("chatgpt_usage_limit", "chatgpt_not_eligible", "chatgpt_rejected", SAIU)


class ParaOEnvio(Exception):
    """O plano do ChatGPT não deixa o Envio seguir: `codigo` é o que fica no Cartão e no Envio."""

    def __init__(self, codigo):
        super().__init__(codigo)
        self.codigo = codigo


class ImagemDoCartao:
    """O que o `Trabalho` faz para o Cartão ganhar imagem; usa `fila`, `motor`, `cofre`, `logger`, `openai_base`, `openverse_base`, `adaptador_de_imagem`, `chatgpt`, `plano` e `_etapa` dele."""

    def _usar_o_adaptador_de_imagem(self):
        self.motor.image_utils.usar_adaptador(self.adaptador_de_imagem or AdaptadorQt())

    def _a_imagem(self, job_id, pedido, config, cartao_id, guid, conteudo):
        """A imagem do Cartão: `({nome: bytes}, nome)`, ou `({}, None)` se não veio. Só levanta `ParaOEnvio`."""
        self._etapa(job_id, "generate_images")
        try:
            dados = self._escolher_a_imagem(pedido, config, cartao_id, conteudo, self.fila.estado(job_id).get("usingKey", False))
        except Exception as erro:  # nada do que a OpenAI ou o Openverse disseram é guardado: o log leva só o Cartão e o tipo do erro
            if getattr(erro, "codigo", None) in DO_PLANO_QUE_PARA:
                raise ParaOEnvio(erro.codigo) from None
            self.logger.warning("Envio %s: a imagem do Cartão %s não veio (%s)", job_id, cartao_id, getattr(erro, "codigo", type(erro).__name__))
            return {}, None
        if not dados:
            self.logger.info("Envio %s: o Cartão %s vai sem imagem", job_id, cartao_id)
            return {}, None
        nome = guid + ".png"
        return {nome: dados}, nome

    def _escolher_a_imagem(self, pedido, config, cartao_id, conteudo, so_a_chave):
        """Os bytes do PNG escolhido para o Cartão, ou None se nenhuma imagem serviu. `so_a_chave`: Usar a minha chave (#158), o juiz também."""
        plano, chave = credencial_da_imagem(self.chatgpt, self.cofre, self.plano, self.modelos, so_a_chave)  # lidos antes do pedido, só para ele (C5)
        if not (plano or chave) or (pedido["imageSource"] != "1" and not chave):
            return None  # sem login nem chave (Apagar chave no meio), ou só a imagem gerada pedida e nenhuma chave: sem imagem
        motor = self.motor
        self._usar_o_adaptador_de_imagem()
        configurada = dict(config, openai_api_key=chave, plano_do_chatgpt=plano, openai_base=self.openai_base, openverse_base=self.openverse_base,
                           image_records_by_card=True)
        pipeline = motor.image_pipeline.build(configurada, Path(config["paths"]["output_dir"]), pedido["imageSource"], chave, config["paths"]["log_dir"])
        prompt = motor.extract_prompts.card_prompt(conteudo)
        with tempfile.TemporaryDirectory(prefix="perpetualminer_imagem_") as pasta:
            destino = Path(pasta) / "imagem.png"
            if pedido["imageSource"] == "1":
                feita = pipeline.real_first(cartao_id, prompt, destino, generation_policy="normal" if chave else "free_only")  # sem chave, só a foto real
            else:
                feita = pipeline.generate_direct(cartao_id, prompt, destino) == "ok"
            return destino.read_bytes() if feita and destino.exists() else None

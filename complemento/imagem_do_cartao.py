import tempfile
from pathlib import Path

from .imagem_qt import AdaptadorQt
from .login_do_chatgpt import SAIU

DO_PLANO_QUE_PARA = ("chatgpt_usage_limit", "chatgpt_not_eligible", "chatgpt_rejected", SAIU)


class ParaOEnvio(Exception):
    def __init__(self, codigo):
        super().__init__(codigo)
        self.codigo = codigo


def _a_foto_real_vem_primeiro(pedido):
    return pedido["imageSource"] == "1"


def _a_imagem_tem_de_onde_vir(pedido, chave):
    return _a_foto_real_vem_primeiro(pedido) or bool(chave)


class ImagemDoCartao:
    def __init__(self, motor, logger, openverse_base, adaptador_de_imagem=None):
        self.motor, self.logger, self.openverse_base, self.adaptador_de_imagem = motor, logger, openverse_base, adaptador_de_imagem

    def imagem(self, cartao, texto, ia, avisar):
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
        pedido, config = cartao.pedido, cartao.config
        juiz, chave = ia.para_a_imagem()
        if not juiz or not _a_imagem_tem_de_onde_vir(pedido, chave):
            return None
        motor = self.motor
        motor.image_utils.usar_adaptador(self.adaptador_de_imagem or AdaptadorQt())
        configurada = dict(config, pela_chave=chave, juiz_da_imagem=juiz, openverse_base=self.openverse_base, image_records_by_card=True)
        pipeline = motor.image_pipeline.build(configurada, Path(config["paths"]["output_dir"]), pedido["imageSource"], chave, config["paths"]["log_dir"])
        prompt = motor.extract_prompts.card_prompt(texto)
        with tempfile.TemporaryDirectory(prefix="perpetualminer_imagem_") as pasta:
            destino = Path(pasta) / "imagem.png"
            if _a_foto_real_vem_primeiro(pedido):
                feita = pipeline.real_first(cartao.id, prompt, destino, generation_policy="normal" if chave else "free_only")
            else:
                feita = pipeline.generate_direct(cartao.id, prompt, destino) == "ok"
            return destino.read_bytes() if feita and destino.exists() else None

"""A imagem do Cartão dentro do Envio (#144): a foto real que o juiz escolhe (Openverse) ou a imagem gerada pela chave, do mesmo
código da Conexão de hoje (`motor/image_pipeline.py`), só com a biblioteca padrão. O que precisa de biblioteca de imagem (converter
JPEG, WebP ou GIF em PNG) passa pelo adaptador de `motor/image_utils.py`: aqui, o Qt do Anki (`imagem_qt.py`). Quem usa é
`envio.Trabalho`, que herda daqui; a imagem não fica na pasta de dados: vai da rede à coleção do Anki na mesma volta.

Só a imagem falha → o Cartão vai sem ela e conta como enviado: nada aqui levanta erro."""

import tempfile
from pathlib import Path

from .imagem_qt import AdaptadorQt


class ImagemDoCartao:
    """O que o `Trabalho` faz para o Cartão ganhar imagem; usa `fila`, `motor`, `cofre`, `logger`, `openai_base`, `openverse_base`, `adaptador_de_imagem` e `_etapa` dele."""

    def _usar_o_adaptador_de_imagem(self):
        self.motor.image_utils.usar_adaptador(self.adaptador_de_imagem or AdaptadorQt())

    def _a_imagem(self, job_id, pedido, config, cartao_id, guid, conteudo):
        """A imagem do Cartão: `({nome: bytes}, nome)`, ou `({}, None)` se não veio. Nunca levanta."""
        self._etapa(job_id, "generate_images")
        try:
            dados = self._escolher_a_imagem(pedido, config, cartao_id, conteudo)
        except Exception as erro:  # nada do que a OpenAI ou o Openverse disseram é guardado: o log leva só o Cartão e o tipo do erro
            self.logger.warning("Envio %s: a imagem do Cartão %s não veio (%s)", job_id, cartao_id, getattr(erro, "codigo", type(erro).__name__))
            return {}, None
        if not dados:
            self.logger.info("Envio %s: o Cartão %s vai sem imagem", job_id, cartao_id)
            return {}, None
        nome = guid + ".png"
        return {nome: dados}, nome

    def _escolher_a_imagem(self, pedido, config, cartao_id, conteudo):
        """Os bytes do PNG escolhido para o Cartão, ou None se nenhuma imagem serviu."""
        chave = self.cofre.ler("openai")  # lida antes do pedido, só para ele (C5): sem chave (Apagar chave no meio), sem imagem
        if not chave:
            return None
        motor = self.motor
        self._usar_o_adaptador_de_imagem()
        configurada = dict(config, openai_api_key=chave, openai_base=self.openai_base, openverse_base=self.openverse_base, image_records_by_card=True)
        pipeline = motor.image_pipeline.build(configurada, Path(config["paths"]["output_dir"]), pedido["imageSource"], chave, config["paths"]["log_dir"])
        prompt = motor.extract_prompts.card_prompt(conteudo)
        with tempfile.TemporaryDirectory(prefix="perpetualminer_imagem_") as pasta:
            destino = Path(pasta) / "imagem.png"
            if pedido["imageSource"] == "1":
                feita = pipeline.real_first(cartao_id, prompt, destino)
            else:
                feita = pipeline.generate_direct(cartao_id, prompt, destino) == "ok"
            return destino.read_bytes() if feita and destino.exists() else None

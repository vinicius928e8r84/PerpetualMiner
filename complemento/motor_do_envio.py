"""O motor de `engine/` como o Envio o usa: os módulos (`complemento.motor`, ver `motor/__init__.py`) e a configuração de um Envio."""

import os
from types import SimpleNamespace

from .audio_do_cartao import aplicar_os_sotaques


def motor_do_complemento():
    """Os módulos do motor que o Envio usa: o texto, a voz e a imagem."""
    from .motor import (
        config_loader, estilos, extract_prompts, generate_audio, generate_cards, image_pipeline, image_utils, nota_do_cartao, parser, send_to_anki)

    return SimpleNamespace(
        config_loader=config_loader, estilos=estilos, extract_prompts=extract_prompts, generate_audio=generate_audio, generate_cards=generate_cards,
        image_pipeline=image_pipeline, image_utils=image_utils, nota_do_cartao=nota_do_cartao, parser=parser, send_to_anki=send_to_anki)


def prompt_do_dono(fila, padrao):
    """O prompt de um Envio: o arquivo de mesmo nome na pasta de prompts da pasta de dados (`user_files/prompts`), se existe e tem texto,
    vale no lugar do padrão que o complemento traz; apagá-lo volta ao padrão. Lido a cada Envio, então a edição vale no Envio seguinte."""
    do_dono = os.path.join(fila.dados.raiz, "prompts", os.path.basename(padrao))
    try:
        with open(do_dono, encoding="utf-8") as arquivo:
            return do_dono if arquivo.read().strip() else padrao
    except (OSError, ValueError):
        return padrao


def configuracao_do_motor(motor, fila, pedido, chave):
    """A base do motor com o idioma, o Baralho, o estilo do idioma (o prompt do nível, como a linha se lê), o tipo de nota e os sotaques do pedido."""
    config = motor.config_loader.base_config()
    config["openai_api_key"] = chave
    config["lang"] = pedido["lang"]
    config["anki"]["deck_name"] = pedido["deckName"]
    pasta_do_motor = os.path.dirname(os.path.abspath(motor.config_loader.__file__))
    estilo = motor.estilos.estilo(pedido["lang"])
    estilo["prompt"] = prompt_do_dono(fila, os.path.join(pasta_do_motor, estilo["prompt"]))
    config["estilo"] = estilo
    config["anki"]["note_type"] = motor.estilos.idioma(pedido["lang"])["tipo_de_nota"]
    config["paths"]["prompts"] = {chave_: prompt_do_dono(fila, os.path.join(pasta_do_motor, caminho)) for chave_, caminho in config["paths"]["prompts"].items()}
    aplicar_os_sotaques(config, pedido["lang"], pedido["tts"])
    config["paths"]["output_dir"] = fila.pasta_dos_textos(pedido["jobId"])
    config["paths"]["log_dir"] = fila.pasta_dos_custos(pedido["jobId"])
    return config

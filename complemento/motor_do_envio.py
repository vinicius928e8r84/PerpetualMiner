"""O motor de `engine/` como o Envio o usa: os módulos (`complemento.motor`, ver `motor/__init__.py`) e a configuração de um Envio."""

import os
from types import SimpleNamespace

from .audio_do_cartao import aplicar_os_sotaques


def motor_do_complemento():
    """Os módulos do motor que o Envio usa: o texto, a voz e a imagem."""
    from .motor import config_loader, extract_prompts, generate_audio, generate_cards, image_pipeline, image_utils, parser, send_to_anki

    return SimpleNamespace(
        config_loader=config_loader, extract_prompts=extract_prompts, generate_audio=generate_audio, generate_cards=generate_cards,
        image_pipeline=image_pipeline, image_utils=image_utils, parser=parser, send_to_anki=send_to_anki)


def configuracao_do_motor(motor, fila, pedido, chave):
    """A base do motor com o idioma, o Baralho, os campos, os prompts e os sotaques do pedido."""
    config = motor.config_loader.base_config()
    config["openai_api_key"] = chave
    config["lang"] = pedido["lang"]
    config["anki"]["deck_name"] = pedido["deckName"]
    do_idioma = config.get("languages", {}).get(pedido["lang"], {})
    config["anki"]["note_type"] = do_idioma.get("note_type") or config["anki"]["note_type"]
    config["anki"]["fields"] = do_idioma.get("fields") or config["anki"]["fields"]
    pasta_do_motor = os.path.dirname(os.path.abspath(motor.config_loader.__file__))
    config["paths"]["prompts"] = {chave_: os.path.join(pasta_do_motor, caminho) for chave_, caminho in config["paths"]["prompts"].items()}
    aplicar_os_sotaques(config, pedido["lang"], pedido["tts"])
    config["paths"]["output_dir"] = fila.pasta_dos_textos(pedido["jobId"])
    config["paths"]["log_dir"] = fila.pasta_dos_custos(pedido["jobId"])
    return config

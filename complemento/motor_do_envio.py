import os
from types import SimpleNamespace

from .audio_do_cartao import aplicar_os_sotaques


def motor_do_complemento():
    from .motor import (
        config_loader, corrigir_frase, cost_tracker, estilos, extract_prompts, generate_audio, generate_cards, image_pipeline, image_utils, nota_do_cartao, parser,
        provedores, send_to_anki)

    return SimpleNamespace(
        config_loader=config_loader, corrigir_frase=corrigir_frase, cost_tracker=cost_tracker, estilos=estilos, extract_prompts=extract_prompts,
        generate_audio=generate_audio, generate_cards=generate_cards, image_pipeline=image_pipeline, image_utils=image_utils, nota_do_cartao=nota_do_cartao,
        parser=parser, provedores=provedores, send_to_anki=send_to_anki)


def prompt_do_dono(fila, padrao):
    do_dono = os.path.join(fila.dados.raiz, "prompts", os.path.basename(padrao))
    try:
        with open(do_dono, encoding="utf-8") as arquivo:
            return do_dono if arquivo.read().strip() else padrao
    except (OSError, ValueError):
        return padrao


def configuracao_do_motor(motor, fila, pedido):
    config = motor.config_loader.base_config()
    config["lang"] = pedido["lang"]
    config["anki"]["deck_name"] = pedido["deckName"]
    pasta_do_motor = os.path.dirname(os.path.abspath(motor.config_loader.__file__))
    estilo = motor.estilos.estilo(pedido["lang"], pedido.get("nivel"))
    estilo["prompt"] = prompt_do_dono(fila, os.path.join(pasta_do_motor, estilo["prompt"]))
    config["estilo"] = estilo
    config["anki"]["note_type"] = motor.estilos.idioma(pedido["lang"])["tipo_de_nota"]
    config["paths"]["prompts"] = {chave_: prompt_do_dono(fila, os.path.join(pasta_do_motor, caminho)) for chave_, caminho in config["paths"]["prompts"].items()}
    aplicar_os_sotaques(config, pedido["lang"], pedido["tts"])
    config["paths"]["output_dir"] = fila.pasta_dos_textos(pedido["jobId"])
    config["paths"]["log_dir"] = fila.pasta_dos_custos(pedido["jobId"])
    return config

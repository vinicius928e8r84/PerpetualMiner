"""
corrigir_frase.py - The correction of a sentence the person wrote in the Criação front (#169).

One request per sentence: the target word, the example sentence and what the person wrote go in, the corrected sentence comes out.
It goes through the key (chat completions) or, with `plano_do_chatgpt` in the config, the ChatGPT plan (Responses API), as the card text does.
The cost is written apart from the cards' (`cost_tracker.record_correction`), and never the word or the sentences.

Runs inside the Anki add-on (`complemento/motor`): standard library only, progress to the `perpetualminer.motor` logger.
"""

import logging
from pathlib import Path

if __package__:  # inside the Anki add-on the engine is the package `complemento.motor`
    from . import cost_tracker, provedores
else:
    import cost_tracker
    import provedores

LOGGER = logging.getLogger("perpetualminer.motor")


def _message(palavra: str, frase: str, escrita: str) -> str:
    return f"Word: {palavra}\nExample sentence: {frase}\nLearner's sentence: {escrita}"


def _clean(texto: str) -> str:
    """The model's answer as the sentence: no surrounding quotes or blank lines."""
    texto = (texto or "").strip()
    if len(texto) > 1 and texto[0] == texto[-1] and texto[0] in "\"'“”":
        texto = texto[1:-1].strip()
    return texto


def corrigir(config: dict, openai_base: str, palavra: str, frase: str, escrita: str) -> str:
    """The corrected form of `escrita` ('' when the model answered nothing). Raises `provedores.ErroDoProvedor` (a code, never what the provider wrote)."""
    system = Path(config["paths"]["prompts"]["correcao_da_criacao"]).read_text(encoding="utf-8").strip()
    message = _message(palavra, frase, escrita)
    log_dir = config["paths"]["log_dir"]
    cred = provedores.credencial_do_texto(config, openai_base)
    if cred.get("via") == "plano":
        text, usage = provedores.texto(cred, system, message)
        cost_tracker.record_correction(log_dir, cred["modelo"], usage["entrada"], usage["saida"], paid=False)
    else:
        text, usage = provedores.texto(cred, system, message, temperatura=0.2)
        cost_tracker.record_correction(log_dir, cred["modelo"], usage.get("entrada", 0), usage.get("saida", 0))
    return _clean(text)

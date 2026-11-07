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
    from . import cost_tracker, openai_http
else:
    import cost_tracker
    import openai_http

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
    """The corrected form of `escrita` ('' when the model answered nothing). Raises `openai_http.ErroDaOpenAI` (a code, never what OpenAI wrote)."""
    system = Path(config["paths"]["prompts"]["correcao_da_criacao"]).read_text(encoding="utf-8").strip()
    message = _message(palavra, frase, escrita)
    log_dir = config["paths"]["log_dir"]
    plan = config.get("plano_do_chatgpt")
    if plan:
        text, usage = openai_http.responder(openai_base, plan["token"], plan["modelo"], system, message)
        cost_tracker.record_correction(
            log_dir, plan["modelo"], usage.get("input_tokens", 0) or 0, usage.get("output_tokens", 0) or 0, paid=False)
    else:
        model = config.get("modelo_do_texto") or config["openai"].get("chat_model", "gpt-4o")
        text, usage = openai_http.completar(
            openai_base, config["openai_api_key"], model,
            [{"role": "system", "content": system}, {"role": "user", "content": message}], temperatura=0.2)
        cost_tracker.record_correction(log_dir, model, usage.get("prompt_tokens", 0) or 0, usage.get("completion_tokens", 0) or 0)
    return _clean(text)

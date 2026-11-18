"""
corrigir_frase.py - The correction of a sentence the person wrote in the Criação front (#169).

One request per sentence: the target word, the example sentence and what the person wrote go in, the corrected sentence comes out.
It is asked through the `pedir` the caller gives, as the card text is: in the Anki add-on the Conexão's IA dos cartões
(`complemento/ia_dos_cartoes.py`) pays it with the key or the ChatGPT plan and writes its cost apart from the cards'
(`cost_tracker.record_correction`), never the word or the sentences. The engine never sees the credential.

Runs inside the Anki add-on (`complemento/motor`): standard library only, progress to the `perpetualminer.motor` logger.
"""

import logging
from pathlib import Path

LOGGER = logging.getLogger("perpetualminer.motor")


def _message(palavra: str, frase: str, escrita: str) -> str:
    return f"Word: {palavra}\nExample sentence: {frase}\nLearner's sentence: {escrita}"


def _clean(texto: str) -> str:
    """The model's answer as the sentence: no surrounding quotes or blank lines."""
    texto = (texto or "").strip()
    if len(texto) > 1 and texto[0] == texto[-1] and texto[0] in "\"'“”":
        texto = texto[1:-1].strip()
    return texto


def corrigir(config: dict, pedir, palavra: str, frase: str, escrita: str) -> str:
    """The corrected form of `escrita` ('' when the model answered nothing), asked with `pedir(system, message, label)` (the label is empty:
    the cost record never names the sentence). A refusal is the caller's `ErroDoProvedor` (a code, never what the provider wrote)."""
    system = Path(config["paths"]["prompts"]["correcao_da_criacao"]).read_text(encoding="utf-8").strip()
    return _clean(pedir(system, _message(palavra, frase, escrita), ""))

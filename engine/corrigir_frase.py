import logging
from pathlib import Path

LOGGER = logging.getLogger("perpetualminer.motor")

_MESMA_ASPA_DOS_DOIS_LADOS = {aspa * 2 for aspa in "\"'“”"}


def _message(nota: dict) -> str:
    return f"Word: {nota['palavra']}\nExample sentence: {nota['frase']}\nLearner's sentence: {nota['escrita']}"


def _clean(texto: str) -> str:
    texto = (texto or "").strip()
    if len(texto) > 1 and texto[0] + texto[-1] in _MESMA_ASPA_DOS_DOIS_LADOS:
        texto = texto[1:-1].strip()
    return texto


def corrigir(config: dict, pedir, nota: dict) -> str:
    system = Path(config["paths"]["prompts"]["correcao_da_criacao"]).read_text(encoding="utf-8").strip()
    return _clean(pedir(system, _message(nota), ""))

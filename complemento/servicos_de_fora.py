from dataclasses import dataclass

from .chatgpt_oficial import LOGIN
from .configuracao import FIRESTORE_BASE, OPENAI_BASE, OPENVERSE_BASE, VOZ_BASE


@dataclass(frozen=True)
class ServicosDeFora:

    openai: str = OPENAI_BASE
    openverse: str = OPENVERSE_BASE
    voz: str = VOZ_BASE
    firestore: str = FIRESTORE_BASE
    chatgpt: str = LOGIN

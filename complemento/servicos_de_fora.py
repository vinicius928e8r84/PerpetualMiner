"""Onde fica cada serviço de fora que a Conexão chama. Existem para o teste apontar cada um para um serviço de mentira."""

from dataclasses import dataclass

from .chatgpt_oficial import LOGIN
from .configuracao import FIRESTORE_BASE, OPENAI_BASE, OPENVERSE_BASE, VOZ_BASE


@dataclass(frozen=True)
class ServicosDeFora:
    """Os endereços: a OpenAI (o texto, a voz de reserva, as imagens e a lista de modelos), o Openverse (a foto real), a voz do Google (`{tld}` é o
    sotaque), o Firestore (a nuvem da chave) e o login do ChatGPT."""

    openai: str = OPENAI_BASE
    openverse: str = OPENVERSE_BASE
    voz: str = VOZ_BASE
    firestore: str = FIRESTORE_BASE
    chatgpt: str = LOGIN

"""O que o adaptador do Anki recebe para gravar um Cartão: a nota e a frente que decide se ele já está no Baralho."""

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class NotaAGravar:
    """A nota que o Anki vai receber: onde ela entra, de que tipo, o que ela diz e a mídia que vai com ela."""

    baralho: str
    tipo_de_nota: str
    campos: dict
    etiquetas: list
    guid: str
    midia: Optional[dict] = None


@dataclass(frozen=True)
class FrenteDoCartao:
    """O que decide se o Cartão já está no Baralho: os campos da frente, a frente normalizada e a função que normaliza."""

    campos_da_frente: object
    frente_normalizada: str
    normalizar: object

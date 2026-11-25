from dataclasses import dataclass


@dataclass(frozen=True)
class NotaAGravar:

    baralho: str
    tipo_de_nota: str
    campos: dict
    etiquetas: tuple = ()
    guid: str = ""
    midia: dict = None


class FrenteDoCartao:

    def __init__(self, campos, normalizada, normalizar):
        self.campos = (campos,) if isinstance(campos, str) else tuple(campos)
        self.normalizada, self.normalizar = normalizada, normalizar

    def esta_em(self, cartao):
        return any(self._e_a_frente(nome, valor) for nome, valor in cartao["campos"])

    def _e_a_frente(self, nome, valor):
        return nome in self.campos and bool(valor) and self.normalizar(valor) == self.normalizada

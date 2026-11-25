"""A nota que o Envio manda gravar no Anki e a frente do Cartão que decide se ela é duplicata (`no_anki.ColecaoDoAnki`, o adaptador de teste)."""

from dataclasses import dataclass


@dataclass(frozen=True)
class NotaAGravar:
    """O que uma nota leva para a coleção: o Baralho (criado se faltar), o tipo de nota, os `campos` (`{nome: valor}`), as etiquetas, o `guid` e a
    `midia` (`{nome do arquivo: bytes}`, o áudio e a imagem do Cartão; guardada junto com a nota nova, e só com ela)."""

    baralho: str
    tipo_de_nota: str
    campos: dict
    etiquetas: tuple = ()
    guid: str = ""
    midia: dict = None


class FrenteDoCartao:
    """A frente do Cartão que decide a duplicata: o texto dela já normalizado (`normalizada`, pelo `normalizar` do idioma) lido em qualquer dos campos
    `campos` (o do tipo próprio e os do “Básico” de antes: o Cartão antigo conta)."""

    def __init__(self, campos, normalizada, normalizar):
        self.campos = (campos,) if isinstance(campos, str) else tuple(campos)
        self.normalizada, self.normalizar = normalizada, normalizar

    def esta_em(self, cartao):
        """Se o `cartao` (`{ campos: [(nome, valor), ...] }`, como `baralhos.cartoes_do_baralho`) já tem esta frente."""
        return any(self._e_a_frente(nome, valor) for nome, valor in cartao["campos"])

    def _e_a_frente(self, nome, valor):
        return nome in self.campos and bool(valor) and self.normalizar(valor) == self.normalizada

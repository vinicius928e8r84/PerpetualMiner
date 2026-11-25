import copy
import json
import os

PASTA = os.path.dirname(os.path.abspath(__file__))


def _ler():
    with open(os.path.join(PASTA, "estilos.json"), encoding="utf-8") as arquivo:
        return json.load(arquivo)


DADOS = _ler()


class Estilos:
    def __init__(self, dados):
        self.dados = dados

    @property
    def NIVEL_PADRAO(self):
        return self.dados["nivel_padrao"]

    def idiomas(self):
        return tuple(self.dados["idiomas"])

    def idioma(self, lang):
        cru = self.dados["idiomas"][lang]
        return dict(copy.deepcopy(cru), campos={chave: self.dados["campos"][chave] for chave in cru["campos"]})

    def niveis(self, lang):
        return tuple(self.dados["idiomas"][lang]["niveis"])

    def estilo(self, lang, nivel=None):
        idioma = self.dados["idiomas"][lang]
        nivel = nivel or self.NIVEL_PADRAO
        return dict(copy.deepcopy(idioma["niveis"][nivel]), nivel=nivel, entrada=idioma["entrada"])

    def exemplo(self, lang, nivel=None):
        exemplo = self.dados["idiomas"][lang]["niveis"][nivel or self.NIVEL_PADRAO]["exemplo"]
        return {"texto": "\n".join(exemplo["texto"]), "palavra": exemplo.get("palavra", "")}

    def rotulo(self, chave):
        return self.dados["rotulos"].get(chave)

    def partes_da_dica(self):
        return tuple(self.dados["dica_da_lacuna"])

    def nomes_da_frente_de_antes(self):
        return tuple(self.dados["frente_de_antes"])


_PADRAO = Estilos(DADOS)
NIVEL_PADRAO = _PADRAO.NIVEL_PADRAO


def idiomas():
    return _PADRAO.idiomas()


def idioma(lang):
    return _PADRAO.idioma(lang)


def niveis(lang):
    return _PADRAO.niveis(lang)


def estilo(lang, nivel=None):
    return _PADRAO.estilo(lang, nivel)


def exemplo(lang, nivel=None):
    return _PADRAO.exemplo(lang, nivel)


def rotulo(chave):
    return _PADRAO.rotulo(chave)


def partes_da_dica():
    return _PADRAO.partes_da_dica()


def nomes_da_frente_de_antes():
    return _PADRAO.nomes_da_frente_de_antes()

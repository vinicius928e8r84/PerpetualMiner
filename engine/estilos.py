"""estilos.py - the Card style as data: language × level (`estilos.json`), standard library only.

A language is an entry of `idiomas`: its note type and deck, how a mining line reads (`entrada`: `palavras` is `kw | kw : phrase`,
`frase` is the whole line), its fields (every one it will ever use: changing a note type's fields later forces a full sync in Anki)
and its levels. A level says which language explains the Card (`explicacao`), which parts the back has (`verso`, in order),
whether the colours link the parts (`cores`), which prompt writes it and an example card text of the level (`exemplo`, written as
the model writes it: the preview shows the style with it, before any Frase is sent). A level can also colour the Phrase by the pieces of its words
(`morfologia`, the Russian Intermediate and Advanced, #163), write fields the back does not show (`guarda`) and say that its back does not
repeat the Phrase (`repete_a_frase: false`). The note type has one back template for every level of the
language, so the language also says the order of all the parts a back can have (`ordem_do_verso`): each level's `verso` is a
subsequence of it. A new language enters by adding its entry and its prompt file.
"""

import copy
import json
import os

PASTA = os.path.dirname(os.path.abspath(__file__))


def _ler():
    with open(os.path.join(PASTA, "estilos.json"), encoding="utf-8") as arquivo:
        return json.load(arquivo)


DADOS = _ler()


class Estilos:
    """Os dados de estilo de uma vez: `DADOS` (o `estilos.json`) ou, nos testes, outros."""

    def __init__(self, dados):
        self.dados = dados

    @property
    def NIVEL_PADRAO(self):
        return self.dados["nivel_padrao"]

    def idiomas(self):
        return tuple(self.dados["idiomas"])

    def idioma(self, lang):
        """O idioma com os campos já nomeados (`campos`: chave → nome do campo, na ordem); `KeyError` se os dados não o têm."""
        cru = self.dados["idiomas"][lang]
        return dict(copy.deepcopy(cru), campos={chave: self.dados["campos"][chave] for chave in cru["campos"]})

    def niveis(self, lang):
        """Os níveis que o idioma tem, do Iniciante em diante (a ordem dos dados); `KeyError` se os dados não têm o idioma."""
        return tuple(self.dados["idiomas"][lang]["niveis"])

    def estilo(self, lang, nivel=None):
        """O estilo de um nível (`prompt`, `explicacao`, `verso`, `cores` e, se o nível os tem, `morfologia`, `guarda`, `repete_a_frase`), com o idioma da entrada; sem nível, o padrão."""
        idioma = self.dados["idiomas"][lang]
        nivel = nivel or self.NIVEL_PADRAO
        return dict(copy.deepcopy(idioma["niveis"][nivel]), nivel=nivel, entrada=idioma["entrada"])

    def exemplo(self, lang, nivel=None):
        """O Cartão de exemplo de um nível: `{ texto, palavra }`, o texto como o modelo o escreveria (`palavra`: a Palavra, quando o texto não a diz).
        `KeyError` se o nível não tem exemplo."""
        exemplo = self.dados["idiomas"][lang]["niveis"][nivel or self.NIVEL_PADRAO]["exemplo"]
        return {"texto": "\n".join(exemplo["texto"]), "palavra": exemplo.get("palavra", "")}

    def rotulo(self, chave):
        """O rótulo com que o prompt escreve a parte no texto do Cartão (`Pronunciation`), ou None."""
        return self.dados["rotulos"].get(chave)

    def partes_da_dica(self):
        """As partes do verso de onde a Dica da frente Lacuna sai, na ordem: a primeira que o Cartão tem preenchida."""
        return tuple(self.dados["dica_da_lacuna"])

    def nomes_da_frente_de_antes(self):
        """Os nomes da frente do “Básico” de antes (o do Anki em português e o do Anki em inglês): a busca de duplicatas os lê também."""
        return tuple(self.dados["frente_de_antes"])


_PADRAO = Estilos(DADOS)  # os testes de um idioma novo trocam este (`mock.patch.object(estilos, "_PADRAO", Estilos(outros))`)
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

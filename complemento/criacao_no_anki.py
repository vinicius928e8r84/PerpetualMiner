"""A frente Criação (#168) e a correção dela (#169) no adaptador da coleção do Anki: a parte de `no_anki.ColecaoDoAnki` que grava a frase que a pessoa
escreveu, lê as frases que a IA ainda não leu e grava a correção. Pede `self._gravando` (a operação na thread principal, com a conferência da
sincronização), `self._se_pode_gravar` e `self._colecao`."""

from . import cartoes_do_anki


class CriacaoNoAnki:
    def gravar_frase_escrita(self, guid, texto):
        """A frase da frente Criação (#168) no campo “Frase escrita” da nota de `guid`; devolve se gravou. Da thread principal (o gancho da revisão já roda nela): sem `_gravando`."""
        return self._se_pode_gravar(lambda colecao: cartoes_do_anki.gravar_frase_escrita(colecao, guid, texto))(self._colecao())

    def frases_a_corrigir(self, lang, limite):
        """As notas do tipo de nota do idioma `lang` com uma “Frase escrita” que a IA ainda não leu (#169): `[{ guid, escrita, frase, palavra }]`, até `limite`, em texto simples."""
        return self._gravando(lambda colecao: cartoes_do_anki.frases_a_corrigir(colecao, lang, limite))

    def gravar_correcao(self, guid, escrita, correcao):
        """A correção da IA (#169) nos campos “Escrito antes” (a frase que ela leu) e “Correção” da nota de `guid`; devolve se gravou."""
        return self._gravando(lambda colecao: cartoes_do_anki.gravar_correcao(colecao, guid, escrita, correcao))

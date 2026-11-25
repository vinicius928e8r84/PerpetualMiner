from . import cartoes_do_anki


class CriacaoNoAnki:
    def gravar_frase_escrita(self, guid, texto):
        return self._se_pode_gravar(lambda colecao: cartoes_do_anki.gravar_frase_escrita(colecao, guid, texto))(self._colecao())

    def frases_a_corrigir(self, lang, limite):
        return self._gravando(lambda colecao: cartoes_do_anki.frases_a_corrigir(colecao, lang, limite))

    def gravar_correcao(self, guid, escrita, correcao):
        return self._gravando(lambda colecao: cartoes_do_anki.gravar_correcao(colecao, guid, escrita, correcao))

"""Os modelos de Cartão do adaptador da coleção em memória (#166, a troca da frente): o que `test_colecao_em_memoria.ColecaoEmMemoria` guarda em `_cartoes_dos_tipos`
(`{ nome, frente, verso, css }` dos tipos que a Conexão criou) lido e reescrito como `no_anki.ColecaoDoAnki` faz com o `models` do Anki. Não é teste: fica fora do
`.ankiaddon` pelo nome."""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import baralhos, cartoes_do_anki  # noqa: E402
from complemento.motor import estilos  # noqa: E402


class ModelosEmMemoria:
    def modelos_do_tipo_de_nota(self, nome):
        self._exigir_gravavel()
        cartao = self._cartoes_dos_tipos.get(nome)
        return None if nome not in self._tipos else [{chave: cartao[chave] for chave in ("nome", "frente", "verso")}] if cartao else []

    def trocar_o_modelo(self, nome, modelo, css):
        self._exigir_gravavel()
        if nome not in self._tipos:
            raise baralhos.TipoDeNotaAusente(nome)
        if nome not in self._cartoes_dos_tipos:  # um tipo da pessoa, sem o modelo da Conexão
            raise baralhos.TipoDeNotaAlterado(nome)
        novo = dict(modelo, css=css)
        mudou = self._cartoes_dos_tipos[nome] != novo
        self._cartoes_dos_tipos[nome] = novo
        return mudou

    def gravar_frase_escrita(self, guid, texto):
        """A frase da frente Criação (#168) no campo “Frase escrita” da nota de `guid`, como `no_anki.ColecaoDoAnki.gravar_frase_escrita`: só numa nota de um
        tipo da Conexão que tem o campo, e o texto vai como HTML. Devolve se gravou."""
        self._exigir_gravavel()
        nota = self._notas.get(guid)
        campo = {estilos.idioma(lang)["tipo_de_nota"]: estilos.idioma(lang)["campos"]["frase_escrita"] for lang in estilos.idiomas()}.get(nota["tipo_de_nota"]) if nota else None
        if campo is None or campo not in self._tipos[nota["tipo_de_nota"]]:
            return False
        valor = cartoes_do_anki.como_campo(texto.strip()[:cartoes_do_anki.LIMITE_DA_FRASE_ESCRITA])
        if nota["campos"].get(campo) == valor:
            return False
        self._regravar_campos(nota, {campo: valor})
        return True

    def _regravar_campos(self, nota, valores):
        nota["campos"].update(valores)
        for cartoes in self._baralhos.values():
            for cartao in cartoes:
                if cartao["nota"] == nota["id"]:
                    cartao["campos"] = [(nome, valores.get(nome, antigo)) for nome, antigo in cartao["campos"]]

    def frases_a_corrigir(self, lang, limite):
        """As notas do tipo do idioma com uma “Frase escrita” que a IA ainda não leu (#169), como `no_anki.ColecaoDoAnki.frases_a_corrigir`."""
        self._exigir_gravavel()
        idioma = estilos.idioma(lang)
        campos = idioma["campos"]
        nomes = self._tipos.get(idioma["tipo_de_nota"]) or []
        if any(campos[chave] not in nomes for chave in ("frase", "palavra", "frase_escrita", "escrito_antes", "correcao")):
            return []
        achadas = []
        for guid, nota in sorted(self._notas.items(), key=lambda item: item[1].get("id", 0)):
            escrita = nota["campos"].get(campos["frase_escrita"], "")
            if nota["tipo_de_nota"] == idioma["tipo_de_nota"] and cartoes_do_anki.a_frase_como_texto(escrita) and escrita != nota["campos"].get(campos["escrito_antes"], ""):
                texto = lambda chave: cartoes_do_anki.a_frase_como_texto(nota["campos"].get(campos[chave]))  # noqa: E731
                achadas.append({"guid": guid, "escrita": texto("frase_escrita"), "frase": texto("frase"), "palavra": texto("palavra")})
                if len(achadas) >= limite:
                    break
        return achadas

    def gravar_correcao(self, guid, escrita, correcao):
        """A correção da IA (#169) nos campos “Escrito antes” e “Correção” da nota de `guid`, como `no_anki.ColecaoDoAnki.gravar_correcao`. Devolve se gravou."""
        self._exigir_gravavel()
        nota = self._notas.get(guid)
        campos = next((estilos.idioma(lang)["campos"] for lang in estilos.idiomas() if nota and estilos.idioma(lang)["tipo_de_nota"] == nota["tipo_de_nota"]), None)
        if campos is None or any(campos[chave] not in self._tipos[nota["tipo_de_nota"]] for chave in ("escrito_antes", "correcao")):
            return False
        self._regravar_campos(nota, {campos["escrito_antes"]: cartoes_do_anki.como_campo(escrita), campos["correcao"]: cartoes_do_anki.como_campo(correcao)})
        return True

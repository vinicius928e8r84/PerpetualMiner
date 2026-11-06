"""Os modelos de Cartão do adaptador da coleção em memória (#166, a troca da frente): o que `test_colecao_em_memoria.ColecaoEmMemoria` guarda em `_cartoes_dos_tipos`
(`{ nome, frente, verso, css }` dos tipos que a Conexão criou) lido e reescrito como `no_anki.ColecaoDoAnki` faz com o `models` do Anki. Não é teste: fica fora do
`.ankiaddon` pelo nome."""

import html
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
        valor = html.escape(texto.strip()[:cartoes_do_anki.LIMITE_DA_FRASE_ESCRITA], quote=False).replace("\n", "<br>")
        if nota["campos"].get(campo) == valor:
            return False
        nota["campos"][campo] = valor
        for cartoes in self._baralhos.values():
            for cartao in cartoes:
                if cartao["nota"] == nota["id"]:
                    cartao["campos"] = [(nome, valor if nome == campo else antigo) for nome, antigo in cartao["campos"]]
        return True

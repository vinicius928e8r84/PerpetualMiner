"""O renderizador de modelos de Cartão que os adaptadores de coleção de mentira usam no lugar do Anki: o que os modelos da Conexão pedem
(`{{Campo}}`, `{{#Campo}}…{{/Campo}}`, `{{^Campo}}…{{/Campo}}` e `{{FrontSide}}`), com o áudio como o Anki o escreve (`[sound:x]` vira
`[anki:play:q:0]`). Não é teste: fica fora do `.ankiaddon` pelo nome. A prova do Anki de verdade é `test_previa_com_o_anki_real.py`.
"""

import re

_SECAO = re.compile(r"\{\{([#^])([^{}]+)\}\}(.*?)\{\{/\2\}\}", re.DOTALL)
_CAMPO = re.compile(r"\{\{([^{}#^/]+)\}\}")
_VAZIO = re.compile(r"^(?:\s|\u200b|&nbsp;|<br\s*/?>|</?div>)*$", re.IGNORECASE)  # o que o Anki chama de campo vazio: uma imagem não é


def _lado(modelo, campos, lado, frente=None):
    contador = iter(range(1000))

    def som(texto):
        return re.sub(r"\[sound:[^\]]*\]", lambda _: "[anki:play:%s:%d]" % (lado, next(contador)), texto)

    def secoes(texto):
        def uma(achou):
            cheio = not _VAZIO.match(campos.get(achou.group(2), ""))
            return secoes(achou.group(3)) if cheio == (achou.group(1) == "#") else ""

        antes = None
        while antes != texto:
            antes, texto = texto, _SECAO.sub(uma, texto)
        return texto

    def campo(achou):
        nome = achou.group(1)
        return frente if nome == "FrontSide" else som(campos.get(nome, ""))

    return _CAMPO.sub(campo, secoes(modelo))


def renderizar(frente, verso, campos):
    """`(a frente, o verso)` do Cartão, como o Anki os escreve; o verso leva a frente onde o modelo diz `{{FrontSide}}`."""
    pergunta = _lado(frente, campos, "q")
    return pergunta, _lado(verso, campos, "a", pergunta)


class PreviaEmMemoria:
    """A parte da coleção em memória (`test_colecao_em_memoria.ColecaoEmMemoria`) que a prévia usa: o Cartão desenhado, a nota pelo `guid` e a mídia.
    Lê o que a coleção guarda (`_tipos`, `_cartoes_dos_tipos`: o modelo de Cartão dos tipos que a Conexão criou, `_notas`, `midia`)."""

    def cartao_renderizado(self, tipo_de_nota, campos):
        """O Cartão do primeiro modelo do tipo, com os `campos`; None se o tipo não existe. Um tipo que a Conexão não criou tem o modelo do Anki."""
        self._exigir_aberta()
        nomes = self._tipos.get(tipo_de_nota)
        if nomes is None:
            return None
        modelo = self._cartoes_dos_tipos.get(tipo_de_nota) or {
            "frente": "{{%s}}" % nomes[0], "verso": "{{FrontSide}}\n\n<hr id=answer>\n\n{{%s}}" % nomes[1], "css": ".card {\n  font-family: arial;\n}\n"}
        frente, verso = renderizar(modelo["frente"], modelo["verso"], campos)
        return {"frente": frente, "verso": verso, "css": modelo["css"]}

    def tipos_de_nota(self):
        """Todos os tipos de nota da coleção, `{ nome: [campos] }` (#165)."""
        self._exigir_gravavel()
        return {nome: list(campos) for nome, campos in self._tipos.items()}

    def nota_gravada(self, guid):
        self._exigir_aberta()
        nota = self._notas.get(guid)
        return dict(nota, campos=dict(nota["campos"])) if nota else None

    def arquivo_de_midia(self, nome, limite_de_bytes):
        self._exigir_aberta()
        dados = self.midia.get(nome)
        return None if dados is None else dados[:limite_de_bytes + 1]

import html
import re

_SECAO = re.compile(r"\{\{([#^])([^{}]+)\}\}(.*?)\{\{/\2\}\}", re.DOTALL)
_CAMPO = re.compile(r"\{\{([^{}#^/]+)\}\}")
_VAZIO = re.compile(r"^(?:\s|\u200b|&nbsp;|<br\s*/?>|</?div>)*$", re.IGNORECASE)


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
        filtro, _, nome = achou.group(1).rpartition(":")
        if nome == "FrontSide":
            return frente
        valor = som(campos.get(nome, ""))
        return html.unescape(re.sub(r"<[^>]*>", "", valor)) if filtro == "text" else valor

    return _CAMPO.sub(campo, secoes(modelo))


def renderizar(frente, verso, campos):
    pergunta = _lado(frente, campos, "q")
    return pergunta, _lado(verso, campos, "a", pergunta)


class PreviaEmMemoria:
    def cartao_renderizado(self, tipo_de_nota, campos):
        self._exigir_aberta()
        nomes = self._tipos.get(tipo_de_nota)
        if nomes is None:
            return None
        modelo = self._cartoes_dos_tipos.get(tipo_de_nota) or {
            "frente": "{{%s}}" % nomes[0], "verso": "{{FrontSide}}\n\n<hr id=answer>\n\n{{%s}}" % nomes[1], "css": ".card {\n  font-family: arial;\n}\n"}
        frente, verso = renderizar(modelo["frente"], modelo["verso"], campos)
        return {"frente": frente, "verso": verso, "css": modelo["css"]}

    def tipos_de_nota(self):
        self._exigir_gravavel()
        return {nome: list(campos) for nome, campos in self._tipos.items()}

    def nota_gravada(self, guid):
        self._exigir_aberta()
        nota = self._notas.get(guid)
        return dict(nota, campos=dict(nota["campos"])) if nota else None

    def abrir_no_navegador(self, guid):
        self._exigir_aberta()
        if guid not in self._notas:
            return False
        self.navegador_aberto.append(guid)
        return True

    @property
    def navegador_aberto(self):
        return self.__dict__.setdefault("_navegador_aberto", [])

    def arquivo_de_midia(self, nome, limite_de_bytes):
        self._exigir_aberta()
        dados = self.midia.get(nome)
        return None if dados is None else dados[:limite_de_bytes + 1]

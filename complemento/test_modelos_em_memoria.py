import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import baralhos, cartoes_do_anki
from complemento.motor import estilos

CAMPOS_DA_CORRECAO = ("frase", "palavra", "frase_escrita", "escrito_antes", "correcao")


def campos_do_tipo(tipo_de_nota):
    return next((idioma["campos"] for idioma in map(estilos.idioma, estilos.idiomas()) if idioma["tipo_de_nota"] == tipo_de_nota), None)


def tem_os_campos(nomes, campos, chaves):
    return all(campos[chave] in nomes for chave in chaves)


def escrita_que_a_ia_nao_leu(nota, idioma):
    campos = idioma["campos"]
    escrita = nota["campos"].get(campos["frase_escrita"], "")
    if nota["tipo_de_nota"] != idioma["tipo_de_nota"]:
        return False
    return cartoes_do_anki.a_frase_como_texto(escrita) and escrita != nota["campos"].get(campos["escrito_antes"], "")


def frase_a_corrigir(guid, nota, campos):
    texto = lambda chave: cartoes_do_anki.a_frase_como_texto(nota["campos"].get(campos[chave]))
    return {"guid": guid, "escrita": texto("frase_escrita"), "frase": texto("frase"), "palavra": texto("palavra")}


class ModelosEmMemoria:
    def modelos_do_tipo_de_nota(self, nome):
        self._exigir_gravavel()
        cartao = self._cartoes_dos_tipos.get(nome)
        return None if nome not in self._tipos else [{chave: cartao[chave] for chave in ("nome", "frente", "verso")}] if cartao else []

    def trocar_o_modelo(self, nome, modelo, css):
        self._exigir_gravavel()
        if nome not in self._tipos:
            raise baralhos.TipoDeNotaAusente(nome)
        if nome not in self._cartoes_dos_tipos:
            raise baralhos.TipoDeNotaAlterado(nome)
        novo = dict(modelo, css=css)
        mudou = self._cartoes_dos_tipos[nome] != novo
        self._cartoes_dos_tipos[nome] = novo
        return mudou

    def gravar_frase_escrita(self, guid, texto):
        self._exigir_gravavel()
        nota = self._notas.get(guid)
        campos = self._campos_que_o_tipo_tem(nota, ("frase_escrita",))
        if campos is None:
            return False
        valor = cartoes_do_anki.como_campo(texto.strip()[:cartoes_do_anki.LIMITE_DA_FRASE_ESCRITA])
        if nota["campos"].get(campos["frase_escrita"]) == valor:
            return False
        self._regravar_campos(nota, {campos["frase_escrita"]: valor})
        return True

    def _campos_que_o_tipo_tem(self, nota, chaves):
        campos = campos_do_tipo(nota["tipo_de_nota"]) if nota else None
        if campos is None or not tem_os_campos(self._tipos[nota["tipo_de_nota"]], campos, chaves):
            return None
        return campos

    def _regravar_campos(self, nota, valores):
        nota["campos"].update(valores)
        for cartoes in self._baralhos.values():
            for cartao in cartoes:
                if cartao["nota"] == nota["id"]:
                    cartao["campos"] = [(nome, valores.get(nome, antigo)) for nome, antigo in cartao["campos"]]

    def frases_a_corrigir(self, lang, limite):
        self._exigir_gravavel()
        idioma = estilos.idioma(lang)
        campos = idioma["campos"]
        if not tem_os_campos(self._tipos.get(idioma["tipo_de_nota"]) or [], campos, CAMPOS_DA_CORRECAO):
            return []
        achadas = []
        for guid, nota in sorted(self._notas.items(), key=lambda item: item[1].get("id", 0)):
            if escrita_que_a_ia_nao_leu(nota, idioma):
                achadas.append(frase_a_corrigir(guid, nota, campos))
                if len(achadas) >= limite:
                    break
        return achadas

    def gravar_correcao(self, guid, escrita, correcao):
        self._exigir_gravavel()
        nota = self._notas.get(guid)
        campos = self._campos_que_o_tipo_tem(nota, ("escrito_antes", "correcao"))
        if campos is None:
            return False
        self._regravar_campos(nota, {campos["escrito_antes"]: cartoes_do_anki.como_campo(escrita), campos["correcao"]: cartoes_do_anki.como_campo(correcao)})
        return True

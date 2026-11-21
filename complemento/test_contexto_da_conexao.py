"""O que um exemplo do contrato (`contexto`) põe na Conexão antes de ela subir: o item de login e a chave que ela já guardava (apoio de `test_harness.ConexaoNoTeste`)."""

import collections
import os

from complemento import item_de_login

COMANDO_DO_ANKI = ["/usr/bin/open", "/Applications/Anki.app"]


def item_desligado(pasta, comando=COMANDO_DO_ANKI):
    return item_de_login.ItemDeLogin(sistema="mac", pasta=os.path.join(pasta, "agentes"), comando=comando)


def item_sem_anki(pasta):
    return item_desligado(pasta, comando=None)


def item_que_falha_ao_gravar(pasta):
    ocupada = os.path.join(pasta, "ocupada")
    with open(ocupada, "wb") as arquivo:
        arquivo.write(b"x")
    return item_desligado(ocupada)


def item_ligado(pasta):
    item = item_desligado(pasta)
    item.ligar()
    return item


ITEM_DE_CADA_SITUACAO = {
    "indisponivel": lambda pasta: None,
    "sem_anki": item_sem_anki,
    "falha": item_que_falha_ao_gravar,
    "ligado": item_ligado,
}


def item_de_login_do_contexto(pasta, situacao):
    """O item de login na situação que o contrato diz (`itemDeLogin`): numa pasta do teste, nunca na do computador."""
    return ITEM_DE_CADA_SITUACAO.get(situacao, item_desligado)(pasta)


class ChaveGuardadaAntes(collections.namedtuple("ChaveGuardadaAntes", "chave versao apagada conta em nao_enviada")):
    def no_arquivo(self):
        """O `chaves/openai.json` ao subir, ou None (vale o último caso: conta, versão, chave)."""
        antes = "sk-proj-guardada-antes-" + self.chave if self.chave else ""
        if self.conta is not None:
            return {"chave": antes, "versao": self.versao, "conta": self.conta, "em": self.em, "naoEnviada": self.nao_enviada}
        if self.versao:
            return {"versao": self.versao, "chave": "" if self.apagada else (antes or None)}
        return None if self.chave is None else {"chave": "sk-proj-guardada-antes-" + self.chave}

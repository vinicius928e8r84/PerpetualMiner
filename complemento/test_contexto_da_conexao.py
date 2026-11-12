"""O que um exemplo do contrato (`contexto`) põe na Conexão antes de ela subir: o item de login e a chave que ela já guardava (apoio de `test_servidor.ConexaoNoTeste`)."""

import os

from complemento import item_de_login


def item_de_login_do_contexto(pasta, situacao):
    """O item de login na situação que o contrato diz (`itemDeLogin`): numa pasta do teste, nunca na do computador."""
    comando = ["/usr/bin/open", "/Applications/Anki.app"]
    if situacao == "indisponivel":
        return None
    if situacao == "sem_anki":
        return item_de_login.ItemDeLogin(sistema="mac", pasta=os.path.join(pasta, "agentes"), comando=None)
    if situacao == "falha":
        ocupada = os.path.join(pasta, "ocupada")
        with open(ocupada, "wb") as arquivo:
            arquivo.write(b"x")
        return item_de_login.ItemDeLogin(sistema="mac", pasta=os.path.join(ocupada, "agentes"), comando=comando)
    item = item_de_login.ItemDeLogin(sistema="mac", pasta=os.path.join(pasta, "agentes"), comando=comando)
    if situacao == "ligado":
        item.ligar()
    return item


def chave_guardada_antes(chave, versao, apagada, conta, em, nao_enviada):
    """O `chaves/openai.json` ao subir, ou None (vale o último caso: conta, versão, chave)."""
    antes = "sk-proj-guardada-antes-" + chave if chave else ""
    if conta is not None:
        return {"chave": antes, "versao": versao, "conta": conta, "em": em, "naoEnviada": nao_enviada}
    if versao:
        return {"versao": versao, "chave": "" if apagada else (antes or None)}
    return None if chave is None else {"chave": "sk-proj-guardada-antes-" + chave}

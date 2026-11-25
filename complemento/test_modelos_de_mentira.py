import json
import os
from datetime import date

LISTA_NOSSA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "modelos_da_ia.json")


def _modelos_so_do_plano(cenario, lista):
    conhecidos = {modelo["modelo"] for modelo in lista}
    return [{"modelo": nome, "texto": True, "foto": False, "saida": None} for nome in cenario["saidas"] if nome not in conhecidos]


def lista_do_cenario(cenario):
    with open(LISTA_NOSSA, encoding="utf-8") as arquivo:
        lista = json.load(arquivo)["modelos"]
    lista += _modelos_so_do_plano(cenario, lista)
    return [dict(modelo, saida=cenario["saidas"].get(modelo["modelo"], modelo["saida"])) for modelo in lista]


def _a_pessoa_ja_tinha_escolhido(cenario):
    return cenario["escolha"] != "automatico" or cenario["trocou"]


def preparar_o_cenario(cenario, pasta, openai):
    if cenario is None:
        return {}
    openai.modelos_da_conta, openai.modelos_do_plano = cenario["conta"], cenario["plano"]
    if _a_pessoa_ja_tinha_escolhido(cenario):
        with open(os.path.join(pasta, "modelo-dos-cartoes.json"), "w", encoding="utf-8") as arquivo:
            json.dump({"escolha": cenario["escolha"], "trocou": cenario["trocou"]}, arquivo)
    return {"modelos_da_ia": lista_do_cenario(cenario), "hoje": lambda: date.fromisoformat(cenario["hoje"])}

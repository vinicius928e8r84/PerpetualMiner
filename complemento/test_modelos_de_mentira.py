"""O modelo dos cartões nos testes da Conexão (#157). Não é um teste: monta o cenário que um exemplo do contrato diz.

Um cenário (`modelos` de `contrato/exemplos-do-modelo.json`) diz o dia de hoje (`hoje`), o que a pessoa tinha escolhido
(`escolha`, `trocou`), o que a OpenAI lista para a chave (`conta`) e para o plano (`plano`) e as datas de saída (`saidas`) que valem
sobre a lista nossa, a que viaja com a extensão (`complemento/modelos_da_ia.json`).
"""

import json
import os
from datetime import date

LISTA_NOSSA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "modelos_da_ia.json")


def lista_do_cenario(cenario):
    """A lista nossa, com as datas de saída que o cenário põe por cima (também a de um modelo só do plano, que a lista de fábrica não conhece)."""
    with open(LISTA_NOSSA, encoding="utf-8") as arquivo:
        lista = json.load(arquivo)["modelos"]
    conhecidos = {modelo["modelo"] for modelo in lista}
    lista += [{"modelo": nome, "texto": True, "foto": False, "saida": None} for nome in cenario["saidas"] if nome not in conhecidos]
    return [dict(modelo, saida=cenario["saidas"].get(modelo["modelo"], modelo["saida"])) for modelo in lista]


def preparar_o_cenario(cenario, pasta, openai):
    """O que o cenário muda na Conexão: a OpenAI de mentira lista o que a conta tem e a escolha anterior já está guardada.
    Devolve o que a Conexão recebe no lugar da lista de fábrica e do relógio (o `hoje` do cenário, que o teste pode mudar)."""
    if cenario is None:
        return {}
    openai.modelos_da_conta, openai.modelos_do_plano = cenario["conta"], cenario["plano"]
    if cenario["escolha"] != "automatico" or cenario["trocou"]:
        with open(os.path.join(pasta, "modelo-dos-cartoes.json"), "w", encoding="utf-8") as arquivo:
            json.dump({"escolha": cenario["escolha"], "trocou": cenario["trocou"]}, arquivo)
    return {"modelos_da_ia": lista_do_cenario(cenario), "hoje": lambda: date.fromisoformat(cenario["hoje"])}

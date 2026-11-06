"""Ler a pasta de dados de um Envio no teste, com a thread de trabalho ainda gravando."""

import contextlib
import os


def arquivos_da_pasta(pasta):
    """`{caminho relativo: bytes}` dos arquivos prontos: o `.novo` (a gravação em curso) fica de fora, e o que some entre listar e abrir também."""
    lidos = {}
    for raiz, _, nomes in os.walk(pasta):
        for nome in nomes:
            caminho = os.path.join(raiz, nome)
            with contextlib.suppress(FileNotFoundError), open(caminho, "rb") as arquivo:
                lidos[os.path.relpath(caminho, pasta)] = arquivo.read()
    return {nome: dados for nome, dados in lidos.items() if not nome.endswith(".novo")}

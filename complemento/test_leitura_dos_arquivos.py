import contextlib
import os


def _caminhos_prontos(pasta):
    for raiz, _, nomes in os.walk(pasta):
        yield from (os.path.join(raiz, nome) for nome in nomes if not nome.endswith(".novo"))


def arquivos_da_pasta(pasta):
    lidos = {}
    for caminho in _caminhos_prontos(pasta):
        with contextlib.suppress(FileNotFoundError), open(caminho, "rb") as arquivo:
            lidos[os.path.relpath(caminho, pasta)] = arquivo.read()
    return lidos

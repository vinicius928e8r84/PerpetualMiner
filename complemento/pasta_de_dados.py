import os
from collections import namedtuple

PastaDeDados = namedtuple("PastaDeDados", "raiz fila estado custos logs chaves")


def preparar(pasta_do_complemento):
    raiz = os.path.join(pasta_do_complemento, "user_files")
    pastas = {nome: os.path.join(raiz, nome) for nome in ("fila", "estado", "custos", "logs", "chaves")}
    for pasta in list(pastas.values()) + [os.path.join(raiz, "prompts")]:
        os.makedirs(pasta, exist_ok=True)
    os.chmod(pastas["chaves"], 0o700)
    return PastaDeDados(raiz=raiz, **pastas)

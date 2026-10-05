"""A pasta de dados do complemento.

O Anki preserva `user_files` nas atualizações do complemento, então é lá que
ficam a fila do Envio, o estado de cada Cartão, os custos e os logs.
"""

import os
from collections import namedtuple

PastaDeDados = namedtuple("PastaDeDados", "raiz fila estado custos logs")


def preparar(pasta_do_complemento):
    """Cria `user_files` (e o que mora nela) se faltar; nunca apaga nada."""
    raiz = os.path.join(pasta_do_complemento, "user_files")
    pastas = {nome: os.path.join(raiz, nome) for nome in ("fila", "estado", "custos", "logs")}
    for pasta in pastas.values():
        os.makedirs(pasta, exist_ok=True)
    return PastaDeDados(raiz=raiz, **pastas)

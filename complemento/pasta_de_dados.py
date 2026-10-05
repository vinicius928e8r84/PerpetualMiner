"""A pasta de dados do complemento.

O Anki preserva `user_files` nas atualizações do complemento, então é lá que
ficam a fila do Envio, o estado de cada Cartão, os custos, os logs e as chaves (`chaves`, separada de
tudo o que o pacote de diagnóstico lê: veja `chaves.py`).
"""

import os
from collections import namedtuple

PastaDeDados = namedtuple("PastaDeDados", "raiz fila estado custos logs chaves")


def preparar(pasta_do_complemento):
    """Cria `user_files` (e o que mora nela) se faltar; nunca apaga nada."""
    raiz = os.path.join(pasta_do_complemento, "user_files")
    pastas = {nome: os.path.join(raiz, nome) for nome in ("fila", "estado", "custos", "logs", "chaves")}
    for pasta in pastas.values():
        os.makedirs(pasta, exist_ok=True)
    # O cofre das chaves é só do dono, mesmo com a umask aberta e mesmo numa pasta que já existia aberta.
    os.chmod(pastas["chaves"], 0o700)
    return PastaDeDados(raiz=raiz, **pastas)

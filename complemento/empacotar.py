"""Monta o `.ankiaddon` da Conexão com o Anki.

    python3 complemento/empacotar.py [destino.ankiaddon]

O Anki instala o arquivo pelo `manifest.json` na raiz do zip. O `mod` é a hora do
empacotamento: é ele que põe a cópia instalada por arquivo no caminho de atualização
do AnkiWeb. Ficam de fora os testes, os exemplos do contrato, `user_files` e o cache.
"""

import json
import os
import sys
import time
import zipfile

PASTA = os.path.dirname(os.path.abspath(__file__))
FORA_DO_PACOTE = ("test_", "empacotar.py", "__pycache__", "user_files", "contrato")


def _entra_no_pacote(relativo):
    return not any(parte.startswith(FORA_DO_PACOTE) for parte in relativo.split(os.sep))


def arquivos_do_pacote():
    achados = []
    for pasta, subpastas, arquivos in os.walk(PASTA):
        for nome in arquivos:
            relativo = os.path.relpath(os.path.join(pasta, nome), PASTA)
            if _entra_no_pacote(relativo):
                achados.append(relativo)
    return sorted(achados)


def empacotar(destino, mod=None):
    """Escreve o `.ankiaddon` em `destino` e o devolve."""
    with open(os.path.join(PASTA, "manifest.json"), encoding="utf-8") as arquivo:
        manifesto = json.load(arquivo)
    manifesto["mod"] = int(time.time() if mod is None else mod)
    with zipfile.ZipFile(destino, "w", zipfile.ZIP_DEFLATED) as pacote:
        for relativo in arquivos_do_pacote():
            if relativo != "manifest.json":
                pacote.write(os.path.join(PASTA, relativo), relativo.replace(os.sep, "/"))
        pacote.writestr("manifest.json", json.dumps(manifesto, indent=2) + "\n")
    return destino


if __name__ == "__main__":
    print(empacotar(sys.argv[1] if len(sys.argv) > 1 else os.path.join(PASTA, "..", "dist", "perpetualminer.ankiaddon")))

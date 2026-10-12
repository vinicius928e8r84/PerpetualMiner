"""Monta o `.ankiaddon` da Conexão com o Anki.

    python3 complemento/empacotar.py [destino.ankiaddon]

O Anki instala o arquivo pelo `manifest.json` na raiz do zip. O `mod` é a hora do
empacotamento: é ele que põe a cópia instalada por arquivo no caminho de atualização
do AnkiWeb. Cada entrada do zip leva data, permissões e ordem fixas: o mesmo código dá os mesmos bytes
(o `mod` é a única coisa que muda, e `SOURCE_DATE_EPOCH` o fixa). Ficam de fora os testes, os exemplos do contrato, `user_files`, o cache e o LEIA-ME.

A extensão entrega este arquivo num link de download (`conexao/perpetualminer.ankiaddon`, no pacote da loja):
mudou o código do complemento, refaça-o com `python3 complemento/empacotar.py conexao/perpetualminer.ankiaddon`
(`test_pacote.py` falha enquanto ele estiver para trás).
"""

import json
import os
import sys
import time
import zipfile

PASTA = os.path.dirname(os.path.abspath(__file__))
DATA_FIXA = (1980, 1, 1, 0, 0, 0)  # o menor que o zip aceita
PERMISSOES_FIXAS = 0o100644 << 16  # arquivo comum, rw-r--r--
FORA_DO_PACOTE = ("test_", "empacotar.py", "__pycache__", "user_files", "contrato", "LEIA-ME.md")


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


def _entrada(nome):
    entrada = zipfile.ZipInfo(nome, DATA_FIXA)
    entrada.compress_type = zipfile.ZIP_DEFLATED
    entrada.create_system = 3
    entrada.external_attr = PERMISSOES_FIXAS
    return entrada


def _hora_do_empacotamento():
    return int(os.environ.get("SOURCE_DATE_EPOCH") or time.time())


def empacotar(destino, mod=None):
    """Escreve o `.ankiaddon` em `destino` e o devolve."""
    with open(os.path.join(PASTA, "manifest.json"), encoding="utf-8") as arquivo:
        manifesto = json.load(arquivo)
    manifesto["mod"] = int(_hora_do_empacotamento() if mod is None else mod)
    os.makedirs(os.path.dirname(os.path.abspath(destino)), exist_ok=True)
    with zipfile.ZipFile(destino, "w", zipfile.ZIP_DEFLATED) as pacote:
        for relativo in arquivos_do_pacote():
            if relativo != "manifest.json":
                with open(os.path.join(PASTA, relativo), "rb") as arquivo:
                    pacote.writestr(_entrada(relativo.replace(os.sep, "/")), arquivo.read())
        pacote.writestr(_entrada("manifest.json"), json.dumps(manifesto, indent=2) + "\n")
    return destino


if __name__ == "__main__":
    print(empacotar(sys.argv[1] if len(sys.argv) > 1 else os.path.join(PASTA, "..", "dist", "perpetualminer.ankiaddon")))

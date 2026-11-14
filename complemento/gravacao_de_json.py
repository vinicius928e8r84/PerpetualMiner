"""Gravar e apagar os arquivos do Envio (`envio._gravar_json`, `envio._apagar`), onde `test_envio_fronteiras.py` mata a Conexão."""

import json
import os
import tempfile


def gravar_json(caminho, dados):
    """Grava por um provisório só desta gravação (`<nome>.<aleatório>.novo`), então duas threads no mesmo arquivo não se atropelam."""
    pasta = os.path.dirname(caminho)
    os.makedirs(pasta, exist_ok=True)
    descritor, provisorio = tempfile.mkstemp(prefix=os.path.basename(caminho) + ".", suffix=".novo", dir=pasta)
    try:
        with os.fdopen(descritor, "w", encoding="utf-8") as arquivo:
            json.dump(dados, arquivo, ensure_ascii=False, indent=2)
        os.replace(provisorio, caminho)
    except Exception:
        apagar(provisorio)
        raise


def apagar(caminho):
    """Apaga um arquivo do Envio (se existe); devolve se apagou."""
    try:
        os.remove(caminho)
    except FileNotFoundError:
        return False
    return True


def apagar_os_provisorios(dados):
    """Todo `<nome>.novo` das pastas do Envio (a gravação que morreu entre escrever e renomear) guarda a Palavra e a Frase, e como o
    nome é único por gravação ninguém o reescreve. Quem chama (a subida da Conexão e o Apagar tudo) segura a tranca da fila."""
    for pasta in (dados.fila, dados.estado, dados.custos):
        for raiz, _, nomes in os.walk(pasta):
            for nome in sorted(nomes):
                if nome.endswith(".novo"):
                    apagar(os.path.join(raiz, nome))

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


def apagar_os_provisorios(dados, ao_falhar=None):
    """Todo `<nome>.novo` das pastas do Envio (a gravação que morreu entre escrever e renomear) guarda a Palavra e a Frase, e como o
    nome é único por gravação ninguém o reescreve. Quem chama (a subida da Conexão e o Apagar tudo) segura a tranca da fila.
    Sem `ao_falhar`, um arquivo que não dá para apagar levanta (o Apagar tudo não pode dizer "apagado" com a Frase ainda no disco);
    com ele, `ao_falhar(caminho, erro)` é chamado e os outros provisórios saem mesmo assim (a subida não pode perder o Envio por um)."""
    for pasta in (dados.fila, dados.estado, dados.custos):
        for raiz, _, nomes in os.walk(pasta):
            for nome in sorted(nomes):
                if not nome.endswith(".novo"):
                    continue
                caminho = os.path.join(raiz, nome)
                try:
                    apagar(caminho)
                except OSError as erro:
                    if ao_falhar is None:
                        raise
                    ao_falhar(caminho, erro)


def avisar_do_que_ficou(logger):
    """O `ao_falhar` da subida: o log diz qual provisório ficou (só o nome do arquivo e o erro, nunca o conteúdo) e a próxima subida tenta de novo."""
    def avisar(caminho, erro):
        if logger:
            logger.warning("Envio: não deu para apagar o provisório %s (%s); fica para a próxima subida", os.path.basename(caminho), erro)
    return avisar

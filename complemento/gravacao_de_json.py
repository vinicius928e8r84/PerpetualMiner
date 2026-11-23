"""Gravar e apagar os arquivos do Envio (`_gravar_json` e `_apagar` em `fila_do_envio.py` e em `envio.py`), onde `test_envio_fronteiras.py` mata a Conexão."""

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


def _provisorios(dados):
    for pasta in (dados.fila, dados.estado, dados.custos):
        for raiz, _, nomes in os.walk(pasta):
            yield from (os.path.join(raiz, nome) for nome in sorted(nomes) if nome.endswith(".novo"))


def apagar_os_provisorios(dados, ao_falhar=None):
    """Todo `<nome>.novo` das pastas do Envio (a gravação que morreu entre escrever e renomear) guarda a Palavra e a Frase, e como o
    nome é único por gravação ninguém o reescreve. Quem chama (a subida da Conexão e o Apagar tudo) segura a tranca da fila.
    Sem `ao_falhar`, um arquivo que não dá para apagar levanta (o Apagar tudo não pode dizer "apagado" com a Frase ainda no disco);
    com ele, `ao_falhar(caminho, erro)` é chamado e os outros provisórios saem mesmo assim (a subida não pode perder o Envio por um)."""
    for caminho in _provisorios(dados):
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
            logger.warning("Envio: não deu para apagar o arquivo %s (%s); fica para a próxima subida", os.path.basename(caminho), erro)
    return avisar


def limpar_ao_subir(dados, estado_de, logger=None):
    """O que a Conexão que sobe tira do disco antes de retomar a fila, com a tranca da fila na mão: todo provisório e o texto (`.txt`)
    de todo Envio apagado. Esse texto chega quando o Apagar tudo cai com a thread esperando a OpenAI e a Conexão morre antes de a
    thread conferir o `wiped`; nenhuma retenção o tira. `estado_de(job_id)` é o estado guardado do Envio (`{}` se não há)."""
    avisar = avisar_do_que_ficou(logger)
    apagar_os_provisorios(dados, avisar)
    try:
        nomes = sorted(os.listdir(dados.estado)) if os.path.isdir(dados.estado) else []
    except OSError as erro:
        return avisar(dados.estado, erro)
    for nome in nomes:
        pasta = os.path.join(dados.estado, nome)
        if os.path.isdir(pasta) and estado_de(nome).get("wiped"):
            _apagar_os_textos_do_envio(pasta, avisar)


def _apagar_os_textos_do_envio(pasta, avisar):
    try:
        textos = sorted(arquivo for arquivo in os.listdir(pasta) if arquivo.endswith(".txt"))
    except OSError as erro:
        return avisar(pasta, erro)
    for arquivo in textos:
        caminho = os.path.join(pasta, arquivo)
        try:
            apagar(caminho)
        except OSError as erro:
            avisar(caminho, erro)

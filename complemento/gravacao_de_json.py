import json
import os
import tempfile


def gravar_json(caminho, dados):
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
    for caminho in _provisorios(dados):
        try:
            apagar(caminho)
        except OSError as erro:
            if ao_falhar is None:
                raise
            ao_falhar(caminho, erro)


def avisar_do_que_ficou(logger):
    def avisar(caminho, erro):
        if logger:
            logger.warning("Envio: não deu para apagar o arquivo %s (%s); fica para a próxima subida", os.path.basename(caminho), erro)
    return avisar


def limpar_ao_subir(dados, estado_de, logger=None):
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

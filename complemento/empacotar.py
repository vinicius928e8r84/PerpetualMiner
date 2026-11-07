"""Monta o `.ankiaddon` da Conexão com o Anki.

    python3 complemento/empacotar.py [destino.ankiaddon]

O Anki instala o arquivo pelo `manifest.json` na raiz do zip. O `mod` é a hora em que o código
mudou: é ele que põe a cópia instalada por arquivo no caminho de atualização do AnkiWeb. Cada entrada
do zip leva data, permissões e ordem fixas, e o `mod` só sobe quando o código sobe: se o código é o
do `conexao/perpetualminer.ankiaddon` versionado, o `mod` é o dele (rodado duas vezes, o script dá os
mesmos bytes); se mudou, é a hora atual, ou `SOURCE_DATE_EPOCH` quando definida. Ficam de fora os
testes, os exemplos do contrato, `user_files`, o cache, o LEIA-ME e o `versoes.json`.

O motor de texto vem de `engine/` (`ARQUIVOS_DO_MOTOR`) e entra como a pasta `motor/` do pacote, ao lado do
`motor/__init__.py` deste repositório (ver `motor/__init__.py`).

A extensão entrega este arquivo num link de download (`conexao/perpetualminer.ankiaddon`, no pacote da loja):
mudou o código do complemento, refaça-o com `python3 complemento/empacotar.py conexao/perpetualminer.ankiaddon`
(`test_pacote.py` falha enquanto ele estiver para trás).
"""

import hashlib
import json
import os
import sys
import time
import zipfile

PASTA = os.path.dirname(os.path.abspath(__file__))
DATA_FIXA = (1980, 1, 1, 0, 0, 0)  # o menor que o zip aceita
PERMISSOES_FIXAS = 0o100644 << 16
SISTEMA_FIXO = 3  # Unix: é o que dá as permissões acima, igual em qualquer máquina
ARQUIVO_DA_EXTENSAO = os.path.join(PASTA, "..", "conexao", "perpetualminer.ankiaddon")
FORA_DO_PACOTE = ("test_", "empacotar.py", "__pycache__", "user_files", "contrato", "LEIA-ME.md", "versoes.json")
ENGINE = os.path.normpath(os.path.join(PASTA, "..", "engine"))
# O que o Envio usa do motor (só a biblioteca padrão; o áudio e a imagem entram com o #143 e o #144).
ARQUIVOS_DO_MOTOR = (
    "config.json",
    "config_loader.py",
    "corrigir_frase.py",
    "cost_tracker.py",
    "extract_prompts.py",
    "generate_audio.py",
    "generate_cards.py",
    "estilos.json",
    "estilos.py",
    "generate_images.py",
    "google_images.py",
    "image_guard.py",
    "image_judge.py",
    "image_pipeline.py",
    "image_queries.py",
    "image_real_first.py",
    "image_utils.py",
    "nota_do_cartao.py",
    "openai_http.py",
    "parser.py",
    "prompt_loader.py",
    "prompts/correcao_da_criacao.txt",
    "prompts/en_card.txt",
    "prompts/en_avancado.txt",
    "prompts/en_iniciante.txt",
    "prompts/en_intermediario.txt",
    "prompts/ru_avancado.txt",
    "prompts/ru_card.txt",
    "prompts/ru_iniciante.txt",
    "prompts/ru_intermediario.txt",
    "send_to_anki.py",
)


def _entra_no_pacote(relativo):
    return not any(parte.startswith(FORA_DO_PACOTE) for parte in relativo.split(os.sep))


def arquivos_do_pacote():
    achados = ["motor/" + nome for nome in ARQUIVOS_DO_MOTOR]
    for pasta, subpastas, arquivos in os.walk(PASTA):
        for nome in arquivos:
            relativo = os.path.relpath(os.path.join(pasta, nome), PASTA)
            if _entra_no_pacote(relativo):
                achados.append(relativo.replace(os.sep, "/"))
    return sorted(achados)


def origem(relativo):
    """De onde vem um arquivo do pacote: do motor (`engine/`) ou desta pasta."""
    if relativo.startswith("motor/") and relativo[len("motor/"):] in ARQUIVOS_DO_MOTOR:
        return os.path.join(ENGINE, *relativo[len("motor/"):].split("/"))
    return os.path.join(PASTA, *relativo.split("/"))


def _entrada(nome):
    entrada = zipfile.ZipInfo(nome, DATA_FIXA)
    entrada.compress_type = zipfile.ZIP_DEFLATED
    entrada.create_system = SISTEMA_FIXO
    entrada.external_attr = PERMISSOES_FIXAS
    return entrada


def _codigo_do_pacote():
    codigo = {}
    for relativo in arquivos_do_pacote():
        if relativo != "manifest.json":
            with open(origem(relativo), "rb") as arquivo:
                codigo[relativo] = arquivo.read()
    return codigo


def hash_das_fontes():
    """O SHA-256 do que o pacote leva (nomes e bytes, comentários inclusos): o que `versoes.json` guarda por `VERSAO`."""
    resumo = hashlib.sha256()
    for relativo in arquivos_do_pacote():
        with open(origem(relativo), "rb") as arquivo:
            conteudo = arquivo.read()
        resumo.update(relativo.encode("utf-8") + b"\0" + str(len(conteudo)).encode() + b"\0" + conteudo)
    return resumo.hexdigest()


def _manifesto():
    with open(os.path.join(PASTA, "manifest.json"), encoding="utf-8") as arquivo:
        return json.load(arquivo)


def _mod_do_arquivo_da_extensao(codigo, manifesto):
    """O `mod` do arquivo versionado se ele leva este mesmo código; senão `None`."""
    try:
        with zipfile.ZipFile(ARQUIVO_DA_EXTENSAO) as entregue:
            do_arquivo = json.loads(entregue.read("manifest.json"))
            mesmo_codigo = sorted(entregue.namelist()) == sorted(list(codigo) + ["manifest.json"]) and all(
                entregue.read(nome) == conteudo for nome, conteudo in codigo.items()
            )
    except (OSError, KeyError, ValueError, zipfile.BadZipFile):
        return None
    mod = do_arquivo.pop("mod", None)
    sem_mod = {campo: valor for campo, valor in manifesto.items() if campo != "mod"}
    return mod if mesmo_codigo and do_arquivo == sem_mod else None


def _mod_padrao(codigo, manifesto):
    if os.environ.get("SOURCE_DATE_EPOCH"):
        return int(os.environ["SOURCE_DATE_EPOCH"])
    mod = _mod_do_arquivo_da_extensao(codigo, manifesto)
    return int(time.time()) if mod is None else mod


def empacotar(destino, mod=None):
    """Escreve o `.ankiaddon` em `destino` e o devolve."""
    codigo = _codigo_do_pacote()
    manifesto = _manifesto()
    manifesto["mod"] = int(_mod_padrao(codigo, manifesto) if mod is None else mod)
    os.makedirs(os.path.dirname(os.path.abspath(destino)), exist_ok=True)
    with zipfile.ZipFile(destino, "w", zipfile.ZIP_DEFLATED) as pacote:
        for nome, conteudo in codigo.items():
            pacote.writestr(_entrada(nome), conteudo)
        pacote.writestr(_entrada("manifest.json"), json.dumps(manifesto, indent=2) + "\n")
    return destino


if __name__ == "__main__":
    print(empacotar(sys.argv[1] if len(sys.argv) > 1 else os.path.join(PASTA, "..", "dist", "perpetualminer.ankiaddon")))

"""Monta o `.ankiaddon` da Conexão com o Anki.

    python3 complemento/empacotar.py [destino.ankiaddon]

O Anki instala o arquivo pelo `manifest.json` na raiz do zip. O `mod` é a hora em que o código
mudou: é ele que põe a cópia instalada por arquivo no caminho de atualização do AnkiWeb. Cada entrada
do zip leva data, permissões e ordem fixas, e o `mod` só sobe quando o código sobe: se o código é o
do `conexao/perpetualminer.ankiaddon` versionado, o `mod` é o dele (rodado duas vezes, o script dá os
mesmos bytes); se mudou, é a hora atual, ou `SOURCE_DATE_EPOCH` quando definida. Ficam de fora os
testes, os exemplos do contrato, `user_files`, o cache, o LEIA-ME e o `versoes.json`.

    python3 complemento/empacotar.py --mod-do-ankiweb [destino.ankiaddon]

Depois do upload, o AnkiWeb dá a seu modo a hora da página (o `t=` do redirect do download), que nunca é a hora em que o
arquivo foi feito. Com `--mod-do-ankiweb` o arquivo sai com esse `mod` (#503): o Anki que instala por ele já está na versão
do AnkiWeb e não oferece a mesma atualização. O arquivo vem do AnkiWeb (o zip que ele serve, e não as fontes de hoje, que a main
pode ter mudado depois do upload): só o `manifest.json` muda, então não se sobe de novo. O `destino` (por padrão o
`conexao/perpetualminer.ankiaddon`), se existe, tem de levar o mesmo código que o do AnkiWeb; senão o upload ainda não aconteceu
e o script para. É o passo 3 do dono (`docs/ankiweb/LEIA-ME.md`); sem rede ou sem página no ar, não escreve nada.

O motor de texto vem de `engine/` (`ARQUIVOS_DO_MOTOR`) e entra como a pasta `motor/` do pacote, ao lado do
`motor/__init__.py` deste repositório (ver `motor/__init__.py`).

Rodado como programa, o script confere que o HEAD é um commit verde, marcado pela suíte completa na main
(`scripts/ci/commit-verde.js`): sem a tag ele recusa (`PM_COMMIT_VERDE=avisar` só avisa, `ignorar` pula).

A extensão entrega este arquivo num link de download (`conexao/perpetualminer.ankiaddon`, no pacote da loja).
A versão e este arquivo são dados na hora do merge por `python3 complemento/versao_no_merge.py`, num commit só;
`test_pacote.py` falha na main (e no commit de versão) enquanto o arquivo estiver para trás do código.
"""

import argparse
import hashlib
import http.client
import io
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
import zipfile

PASTA = os.path.dirname(os.path.abspath(__file__))
DATA_FIXA = (1980, 1, 1, 0, 0, 0)
PERMISSOES_FIXAS = 0o100644 << 16
SISTEMA_FIXO = 3
ARQUIVO_DA_EXTENSAO = os.path.join(PASTA, "..", "conexao", "perpetualminer.ankiaddon")
FORA_DO_PACOTE = ("test_", "empacotar.py", "__pycache__", "user_files", "contrato", "LEIA-ME.md", "versoes.json", "versoes-reservadas.json", "versao_no_merge.py")
RAIZ = os.path.normpath(os.path.join(PASTA, ".."))
ENGINE = os.path.normpath(os.path.join(PASTA, "..", "engine"))
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
    "precos.json",
    "prompt_loader.py",
    "provedores.py",
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


ANKIWEB = "https://ankiweb.net"
CONSULTA_QUE_O_ANKIWEB_ACEITA_NO_DOWNLOAD = "v=2.1&p=250900"


class ErroDoAnkiWeb(Exception):
    """O AnkiWeb não deu a hora da página (sem rede, página fora do ar, resposta sem `t=`)."""


def _pedir(base, metodo, caminho, codigo):
    destino = urllib.parse.urlsplit(base)
    ligar = http.client.HTTPSConnection if destino.scheme == "https" else http.client.HTTPConnection
    conexao = ligar(destino.netloc, timeout=60)
    try:
        conexao.request(metodo, caminho)
        resposta = conexao.getresponse()
        return resposta.status, resposta.getheader("Location", ""), resposta.read()
    except (OSError, http.client.HTTPException) as erro:
        raise ErroDoAnkiWeb("sem resposta do AnkiWeb para a página %s: %s" % (codigo, erro))
    finally:
        conexao.close()


def _hora_do_upload(t):
    return t.isdigit() and int(t) > 0


def _redirect_do_download(codigo, base):
    """O `mod` e o caminho do zip que o AnkiWeb serve para a página `codigo`: o `t=` e a Location do redirect do download (HEAD).
    O AnkiWeb só dá o redirect a um Anki que ele aceita (`v=2.1` e `p=` o ponto da versão, 250900 é o 25.09); fora disso vem 400/404."""
    status, local, _ = _pedir(base, "HEAD", "/shared/download/%s?%s" % (codigo, CONSULTA_QUE_O_ANKIWEB_ACEITA_NO_DOWNLOAD), codigo)
    t = urllib.parse.parse_qs(urllib.parse.urlsplit(local).query).get("t", [""])[0]
    if status not in (301, 302, 303, 307, 308) or not _hora_do_upload(t):
        raise ErroDoAnkiWeb("o AnkiWeb não deu a hora da página %s (status %s, Location %r): ela já está no ar?" % (codigo, status, local))
    return int(t), local


def mod_do_ankiweb(codigo, base=ANKIWEB):
    """O `mod` que o AnkiWeb dá à página `codigo` (sem baixar o zip)."""
    return _redirect_do_download(codigo, base)[0]


def arquivo_do_ankiweb(codigo, base=ANKIWEB):
    """O `mod` da página `codigo` e os bytes do zip que o AnkiWeb serve para ela."""
    mod, local = _redirect_do_download(codigo, base)
    status, _, corpo = _pedir(base, "GET", urllib.parse.urlsplit(local).path + "?" + urllib.parse.urlsplit(local).query, codigo)
    if status != 200:
        raise ErroDoAnkiWeb("o AnkiWeb não deu o arquivo da página %s (status %s)" % (codigo, status))
    return mod, corpo


def _entradas_do_zip(bytes_do_zip, de_onde):
    try:
        with zipfile.ZipFile(io.BytesIO(bytes_do_zip)) as pacote:
            return [(nome, pacote.read(nome)) for nome in pacote.namelist()]
    except (zipfile.BadZipFile, OSError) as erro:
        raise ErroDoAnkiWeb("%s não é um .ankiaddon: %s" % (de_onde, erro))


def refazer_com_o_mod_do_ankiweb(destino, base=ANKIWEB):
    """Escreve em `destino` o arquivo que o AnkiWeb serve para a página do manifesto, só com o `mod` trocado pelo que o AnkiWeb deu."""
    codigo = _manifesto()["package"]
    if not codigo.isdigit():
        raise ErroDoAnkiWeb("o package do manifesto (%s) não é o código de uma página do AnkiWeb" % codigo)
    mod, bytes_do_zip = arquivo_do_ankiweb(codigo, base)
    entradas = _entradas_do_zip(bytes_do_zip, "o que o AnkiWeb serviu para a página " + codigo)
    do_ankiweb = dict(entradas)
    manifesto = _manifesto_do_ankiweb(do_ankiweb, codigo)
    if mod < int(manifesto.get("mod", 0)):
        raise ErroDoAnkiWeb("o AnkiWeb dá a hora %d à página %s, antes do mod %s do arquivo dela: não é a hora de um upload" % (mod, codigo, manifesto.get("mod")))
    _conferir_que_o_versionado_e_o_do_ankiweb(destino, do_ankiweb)
    manifesto["mod"] = mod
    _gravar_com_o_manifesto(destino, entradas, manifesto)
    return destino


def _manifesto_do_ankiweb(do_ankiweb, codigo):
    try:
        return json.loads(do_ankiweb["manifest.json"])
    except (KeyError, ValueError):
        raise ErroDoAnkiWeb("o arquivo da página %s no AnkiWeb não tem manifest.json" % codigo)


def _conferir_que_o_versionado_e_o_do_ankiweb(destino, do_ankiweb):
    """Um `destino` que já existe tem de levar, fora o manifest.json, os mesmos arquivos que o AnkiWeb serviu."""
    if not os.path.exists(destino):
        return
    versionado = dict(_entradas_do_zip(_ler(destino), destino))
    diferentes = sorted(nome for nome in set(versionado) | set(do_ankiweb) if nome != "manifest.json" and versionado.get(nome) != do_ankiweb.get(nome))
    if diferentes:
        raise ErroDoAnkiWeb("o arquivo do AnkiWeb não leva o mesmo código que %s (%s): o upload deste arquivo já aconteceu?" % (destino, ", ".join(diferentes[:5])))


def _gravar_com_o_manifesto(destino, entradas, manifesto):
    os.makedirs(os.path.dirname(os.path.abspath(destino)), exist_ok=True)
    with zipfile.ZipFile(destino, "w", zipfile.ZIP_DEFLATED) as pacote:
        for nome, conteudo in entradas:
            pacote.writestr(_entrada(nome), json.dumps(manifesto, indent=2) + "\n" if nome == "manifest.json" else conteudo)


def _ler(caminho):
    with open(caminho, "rb") as arquivo:
        return arquivo.read()


DADA_NO_MERGE = "a versão é dada no merge (versao_no_merge.py): esta PR não mexe nela; a main e o commit de versão conferem"


CONFERIDA_NO_LANCAMENTO = "a versão é conferida no lançamento (PM_VERSAO_NO_LANCAMENTO): o push da main não a cobra, porque a versão só chega depois do merge (versao_no_merge.py)"


def versao_fica_para_o_lancamento():
    """Verdadeiro no CI do push para a main (`PM_VERSAO_NO_LANCAMENTO=1`): entre o merge e o commit de versão a main está sempre
    atrás, então cobrar o hash e o `.ankiaddon` ali deixa a main vermelha por desenho. Quem cobra é o commit de versão
    (`versao_no_merge.py` roda tudo) e o lançamento (`.github/workflows/lancamento.yml`)."""
    return os.environ.get("PM_VERSAO_NO_LANCAMENTO") == "1"


def versao_vem_no_merge():
    """Verdadeiro numa PR que não mexe na versão (`PM_VERSAO_BASE` é a ponta da branch-alvo, só no CI da PR): a `VERSAO`, o
    `versoes.json` e o `.ankiaddon` ficam como na base, porque a versão é dada no merge (`versao_no_merge.py`) e os testes
    que cobram o pacote e o hash valem na main e no commit de versão. Uma PR que já leva número volta a ser conferida."""
    base = os.environ.get("PM_VERSAO_BASE")
    if not base:
        return False
    try:
        saiu = subprocess.run(["git", "-C", RAIZ, "merge-base", base, "HEAD"], capture_output=True, text=True)
        base = saiu.stdout.strip() if saiu.returncode == 0 else base
        antes = subprocess.run(["git", "-C", RAIZ, "show", base + ":complemento/configuracao.py"], capture_output=True, text=True)
        iguais = subprocess.run(
            ["git", "-C", RAIZ, "diff", "--quiet", base, "--", "complemento/versoes.json", "conexao/perpetualminer.ankiaddon"],
            capture_output=True,
        )
    except OSError:
        return False
    versao_antes = re.search(r'^VERSAO = "([^"]+)"', antes.stdout, re.M)
    with open(os.path.join(PASTA, "configuracao.py"), encoding="utf-8") as arquivo:
        versao_de_hoje = re.search(r'^VERSAO = "([^"]+)"', arquivo.read(), re.M)
    return bool(antes.returncode == 0 and iguais.returncode == 0 and versao_antes and versao_de_hoje
                and versao_antes.group(1) == versao_de_hoje.group(1))


def _entra_no_pacote(relativo):
    return not any(parte.startswith(".") or parte.startswith(FORA_DO_PACOTE) for parte in relativo.split(os.sep))


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


def conferir_commit_verde(raiz=RAIZ):
    """Confere, com `scripts/ci/commit-verde.js`, que o HEAD tem a tag de commit verde e a árvore não tem nada fora dele.
    Sem `PM_COMMIT_VERDE` ela recusa (`False`); `avisar` só avisa e `ignorar` pula. Sem o `node` ou sem o script ela também recusa."""
    modo = os.environ.get("PM_COMMIT_VERDE")
    if modo == "ignorar":
        return True
    script = os.path.join(RAIZ, "scripts", "ci", "commit-verde.js")
    try:
        saiu = subprocess.run(["node", script, "conferir", "--raiz", raiz], capture_output=True, text=True)
    except OSError:
        print("commit sem registro de verde: não achei o node para conferir", file=sys.stderr)
        return modo == "avisar"
    print((saiu.stdout + saiu.stderr).strip(), file=sys.stderr)
    return saiu.returncode == 0


def main(argumentos, base=ANKIWEB):
    leitor = argparse.ArgumentParser(prog="empacotar.py", description=__doc__.split("\n")[0])
    leitor.add_argument("destino", nargs="?", help=".ankiaddon de saída (padrão: dist/perpetualminer.ankiaddon; com --mod-do-ankiweb, conexao/perpetualminer.ankiaddon)")
    leitor.add_argument("--mod-do-ankiweb", action="store_true", help="refaz o arquivo que o AnkiWeb serve, com o mod que o AnkiWeb deu à página (depois do upload)")
    opcoes = leitor.parse_args(argumentos)
    if opcoes.mod_do_ankiweb:
        try:
            print(refazer_com_o_mod_do_ankiweb(opcoes.destino or ARQUIVO_DA_EXTENSAO, base))
        except ErroDoAnkiWeb as erro:
            print(erro, file=sys.stderr)
            return 1
        return 0
    if not conferir_commit_verde():
        return 1
    print(empacotar(opcoes.destino or os.path.join(PASTA, "..", "dist", "perpetualminer.ankiaddon")))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

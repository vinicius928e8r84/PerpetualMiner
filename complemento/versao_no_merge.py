"""Dá a versão da Conexão com o Anki na hora do merge, num commit só.

    python3 complemento/versao_no_merge.py [--acima-de 0.4.33 | --versao 0.4.34] [--sem-testes | --testes "comando"]

Uma PR não mexe na `VERSAO`, no `versoes.json` nem no `conexao/perpetualminer.ankiaddon` (a regra `versoes-publicadas` a
barra); depois de cada merge, quem junta roda este script na main, com a árvore limpa:

1. se o hash das fontes do pacote já é o que o `versoes.json` guarda para a `VERSAO`, não há o que dar (sai com 0, sem commit);
2. senão sobe a `VERSAO` em `configuracao.py` para a que vem depois do maior número do `versoes.json`, troca o número nos
   exemplos de `contrato/`, registra a versão com o hash das fontes e refaz o `.ankiaddon` com `empacotar.py`
   (`SOURCE_DATE_EPOCH` fixa o `mod`, como em `empacotar.py`);
3. roda os testes do complemento; se algum falha, desfaz tudo e sai com erro;
4. faz UM commit, `Conexão X.Y.Z: versão dada no merge`, e não empurra: quem juntou empurra.

`versoes-reservadas.json` lista os números que PRs abertas já carregam (o script nunca os dá, e a regra só deixa uma PR
escrevê-los à mão enquanto estiverem ali; esvazie a lista quando elas mesclarem); `--acima-de` reserva mais um, de passagem.
`--versao X.Y.Z` cumpre a reserva: dá exatamente esse número (a PR que o prometeu), que tem de estar na lista e ainda não estar no `versoes.json`. O resultado é o que o fluxo antigo (subir a versão à mão, registrar
o hash e refazer o arquivo) dava para a mesma versão: `test_versao_no_merge.py` compara byte a byte.
"""

import argparse
import glob
import json
import os
import re
import shlex
import subprocess
import sys

PASTA = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(PASTA)
sys.path.insert(0, RAIZ)

from complemento import empacotar  # noqa: E402

CONFIGURACAO = os.path.join(PASTA, "configuracao.py")
VERSOES = os.path.join(PASTA, "versoes.json")
RESERVADAS = os.path.join(PASTA, "versoes-reservadas.json")
EXEMPLOS = sorted(glob.glob(os.path.join(PASTA, "contrato", "*.json")))
PACOTE = os.path.normpath(empacotar.ARQUIVO_DA_EXTENSAO)
# O que a versão muda; o resto da árvore tem de estar commitado, porque o hash vale para o que está no disco.
ARQUIVOS_DA_VERSAO = [CONFIGURACAO, VERSOES, *EXEMPLOS, PACOTE]
PASTAS_DO_PACOTE = [PASTA, empacotar.ENGINE, os.path.dirname(PACOTE)]
LINHA_DA_VERSAO = re.compile(r'^VERSAO = "([^"]+)"', re.M)
ASSUNTO = "Conexão %s: versão dada no merge"  # a regra `versoes-publicadas` (scripts/regras) reconhece o commit por ele


def como_tupla(versao):
    return tuple(int(parte) for parte in versao.split("."))


def proxima(versoes, acima_de=None):
    """O número que vem depois do maior de `versoes` (e de `acima_de`), comparados como números: 0.4.10 vem depois do 0.4.9."""
    maior = max(como_tupla(versao) for versao in list(versoes) + ([acima_de] if acima_de else []))
    return ".".join(str(parte) for parte in maior[:-1] + (maior[-1] + 1,))


def ler(caminho):
    with open(caminho, encoding="utf-8", newline="") as arquivo:
        return arquivo.read()


def escrever(caminho, texto):
    with open(caminho, "w", encoding="utf-8", newline="") as arquivo:
        arquivo.write(texto)


def reservadas():
    return json.loads(ler(RESERVADAS)) if os.path.exists(RESERVADAS) else []


def git(*argumentos):
    resultado = subprocess.run(["git", "-C", RAIZ, *argumentos], capture_output=True, text=True)
    if resultado.returncode != 0:
        raise SystemExit("git %s falhou: %s" % (" ".join(argumentos), resultado.stderr.strip()))
    return resultado.stdout.strip()


def relativos(caminhos):
    return [os.path.relpath(caminho, RAIZ).replace(os.sep, "/") for caminho in caminhos]


def desfazer():
    git("checkout", "--", *relativos(ARQUIVOS_DA_VERSAO))


def comando_dos_testes():
    return [sys.executable, "-m", "unittest", "discover", "-s", "complemento", "-p", "test_*.py"]


def main(argv):
    leitor = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    leitor.add_argument("--acima-de", metavar="VERSAO", help="o número não pode ser menor ou igual a este (PRs abertas que já o levam)")
    leitor.add_argument("--versao", metavar="VERSAO", help="dá exatamente este número, que tem de estar em versoes-reservadas.json e fora do versoes.json (a PR que o prometeu)")
    testes = leitor.add_mutually_exclusive_group()
    testes.add_argument("--sem-testes", action="store_true", help="não roda os testes do complemento (só os testes deste script usam)")
    testes.add_argument("--testes", metavar="COMANDO", help="outro comando de testes, no lugar de todos os do complemento")
    opcoes = leitor.parse_args(argv)

    sujo = git("status", "--porcelain", "--", *relativos(PASTAS_DO_PACOTE))
    if sujo:
        print("há mudança não commitada no complemento, no engine ou no arquivo da extensão: commite ou descarte antes\n" + sujo, file=sys.stderr)
        return 2

    registradas = json.loads(ler(VERSOES))
    atual = LINHA_DA_VERSAO.search(ler(CONFIGURACAO)).group(1)
    hash_de_hoje = empacotar.hash_das_fontes()
    if registradas.get(atual) == hash_de_hoje:
        print("nada a fazer: a VERSAO %s já registra as fontes de hoje" % atual)
        return 0

    if opcoes.versao:
        if opcoes.versao not in reservadas() or opcoes.versao in registradas:
            print("--versao %s: o número tem de estar em versoes-reservadas.json e ainda não estar no versoes.json" % opcoes.versao, file=sys.stderr)
            return 2
        nova = opcoes.versao
    else:
        nova = proxima(list(registradas) + [atual] + reservadas(), opcoes.acima_de)
    escrever(CONFIGURACAO, LINHA_DA_VERSAO.sub('VERSAO = "%s"' % nova, ler(CONFIGURACAO), count=1))
    for exemplo in EXEMPLOS:
        escrever(exemplo, ler(exemplo).replace('"%s"' % atual, '"%s"' % nova))
    hash_novo = empacotar.hash_das_fontes()  # depois de subir a VERSAO: ela está num arquivo do pacote
    registradas[nova] = hash_novo
    escrever(VERSOES, json.dumps(registradas, indent=2, ensure_ascii=False) + "\n")
    empacotar.empacotar(PACOTE)

    if not opcoes.sem_testes:
        comando = shlex.split(opcoes.testes) if opcoes.testes else comando_dos_testes()
        if subprocess.run(comando, cwd=RAIZ).returncode != 0:
            desfazer()
            print("os testes do complemento falharam com a versão %s: nada foi commitado e a árvore voltou ao que era" % nova, file=sys.stderr)
            return 1

    arquivos = relativos(ARQUIVOS_DA_VERSAO)
    git("add", "--", *arquivos)
    git(  # só estes arquivos: o que mais estiver no índice fica de fora do commit
        "commit", "-q", "-m", ASSUNTO % nova,
        "-m", "Versão dada pelo complemento/versao_no_merge.py depois do merge (era %s).\nHash das fontes: %s" % (atual, hash_novo),
        "--", *arquivos,
    )
    print("%s: %s\nempurre-o para a main." % (git("log", "-1", "--format=%h %s"), hash_novo))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

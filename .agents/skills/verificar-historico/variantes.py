"""Quebra o código real de propósito, roda o explorador e devolve o arquivo (git checkout).

Uso: python3 -I .agents/skills/verificar-historico/variantes.py <pasta-de-saida>
Cada variante deve FALHAR.
"""
import pathlib
import subprocess
import sys

AQUI = pathlib.Path(__file__).resolve().parent


def e_a_raiz(pasta):
    return (pasta / 'background.js').exists() and (pasta / 'lib/historico.js').exists()


RAIZ = next(filter(e_a_raiz, AQUI.parents))
SAIDA = pathlib.Path(sys.argv[1])
SAIDA.mkdir(parents=True, exist_ok=True)

VARIANTES = {
    'sem-tranca': ('lib/historico.js', [(
        "      return globalThis.navigator.locks.request(TRANCA, async () => {",
        "      return (async () => {"), (
        "        return resultado;\n      });",
        "        return resultado;\n      })();")]),
    'le-fora-da-tranca': ('lib/historico.js', [(
        "      return globalThis.navigator.locks.request(TRANCA, async () => {\n"
        "        const { frases: antes = [] } = await armazenamento.get({ frases: [] });",
        "      const lido = armazenamento.get({ frases: [] });\n"
        "      return globalThis.navigator.locks.request(TRANCA, async () => {\n"
        "        const { frases: antes = [] } = await lido;")]),
    'grava-depois-de-soltar': ('lib/historico.js', [(
        "      return globalThis.navigator.locks.request(TRANCA, async () => {\n"
        "        const { frases: antes = [] } = await armazenamento.get({ frases: [] });\n"
        "        const { frases, resultado } = OPERACOES[operacao.tipo](antes, operacao);\n"
        "        if (frases !== antes) await armazenamento.set({ frases });\n"
        "        return resultado;\n"
        "      });",
        "      let gravar = null;\n"
        "      return globalThis.navigator.locks.request(TRANCA, async () => {\n"
        "        const { frases: antes = [] } = await armazenamento.get({ frases: [] });\n"
        "        const { frases, resultado } = OPERACOES[operacao.tipo](antes, operacao);\n"
        "        if (frases !== antes) gravar = frases;\n"
        "        return resultado;\n"
        "      }).then(async r => { if (gravar) await armazenamento.set({ frases: gravar }); return r; });")]),
    'sync-grava-a-copia': ('lib/sincronizacao.js', [(
        "      if (marcasDaNuvem.size > 0) await historico.editarVarias(marcasDaNuvem);",
        "      if (marcasDaNuvem.size > 0) await local.set({ frases: locais"
        ".map(f => ({ ...f, ...marcasDaNuvem.get(String(f.id)) })) });")]),
    'id-so-pelo-relogio': ('lib/historico.js', [(
        "    return Math.max(Date.now(), maiorId + 1);",
        "    return Date.now() || maiorId;")]),
    'duplicata-sem-conferir': ('lib/historico.js', [(
        "      if (frases.some(jaTem)) return { frases, resultado: null };\n",
        "")]),
}


def quebrado(nome, texto, trocas):
    for antes, depois in trocas:
        assert texto.count(antes) == 1, (nome, antes)
        texto = texto.replace(antes, depois)
    return texto


def resumo_da_exploracao(saida):
    return [l for l in saida.splitlines() if not l.startswith(' ')]


def explorar_o_quebrado(nome, arquivo):
    diff = subprocess.run(['git', '-C', str(RAIZ), 'diff', '--', arquivo], capture_output=True, text=True).stdout
    rodada = subprocess.run(['node', str(AQUI / 'explorar.js'), '--um'], capture_output=True, text=True, timeout=600)
    (SAIDA / f'{nome}.txt').write_text(f'{diff}\n--- saída {rodada.returncode}\n{rodada.stdout}{rodada.stderr}')
    print(f'== {nome} (saída {rodada.returncode})')
    print('\n'.join(resumo_da_exploracao(rodada.stdout)))


def provar_a_variante(nome, arquivo, trocas):
    caminho = RAIZ / arquivo
    original = caminho.read_text()
    caminho.write_text(quebrado(nome, original, trocas))
    try:
        explorar_o_quebrado(nome, arquivo)
    finally:
        caminho.write_text(original)


for nome, (arquivo, trocas) in VARIANTES.items():
    provar_a_variante(nome, arquivo, trocas)
print('git status:', subprocess.run(['git', '-C', str(RAIZ), 'status', '--short'], capture_output=True, text=True).stdout or 'limpo')

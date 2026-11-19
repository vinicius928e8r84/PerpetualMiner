"""Quebra o código real de propósito, roda o explorador e devolve o arquivo (git checkout).

Uso: python3 -I .agents/skills/verificar-historico/variantes.py <pasta-de-saida>
Cada variante deve FALHAR (menos a 'conserto-da-duplicata', que deve passar a legenda-repetida).
"""
import pathlib
import subprocess
import sys

AQUI = pathlib.Path(__file__).resolve().parent
RAIZ = next(d for d in AQUI.parents if (d / 'background.js').exists() and (d / 'lib/historico.js').exists())
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
    'conserto-da-duplicata': ('background.js', [(
        "  const data = await chromeGet({ frases: [] });\n  const textKey = autoMinerTextKey(texto);",
        "  return navigator.locks.request('pm-automatica', async () => {\n"
        "  const data = await chromeGet({ frases: [] });\n  const textKey = autoMinerTextKey(texto);"), (
        "  return { action: 'saved', frase, evaluation, state: updatedState };\n}",
        "  return { action: 'saved', frase, evaluation, state: updatedState };\n  });\n}")]),
}

for nome, (arquivo, trocas) in VARIANTES.items():
    caminho = RAIZ / arquivo
    original = caminho.read_text()
    texto = original
    for antes, depois in trocas:
        assert texto.count(antes) == 1, (nome, antes)
        texto = texto.replace(antes, depois)
    caminho.write_text(texto)
    try:
        diff = subprocess.run(['git', '-C', str(RAIZ), 'diff', '--', arquivo], capture_output=True, text=True).stdout
        rodada = subprocess.run(['node', str(AQUI / 'explorar.js'), '--um'], capture_output=True, text=True, timeout=600)
        (SAIDA / f'{nome}.txt').write_text(f'{diff}\n--- saída {rodada.returncode}\n{rodada.stdout}{rodada.stderr}')
        resumo = [l for l in rodada.stdout.splitlines() if not l.startswith(' ')]
        print(f'== {nome} (saída {rodada.returncode})')
        print('\n'.join(resumo))
    finally:
        caminho.write_text(original)
print('git status:', subprocess.run(['git', '-C', str(RAIZ), 'status', '--short'], capture_output=True, text=True).stdout or 'limpo')

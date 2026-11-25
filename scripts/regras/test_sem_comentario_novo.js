'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const regra = require('./sem-comentario-novo');
const { raizTemporaria } = require('./apoio-sem-comentario');

let total = 0;

function achadosDaMudanca(mudanca) {
  const { raiz, git, gravar, commit } = raizTemporaria();
  try {
    gravar({ 'LEIAME.md': 'x\n', ...mudanca.antes });
    const base = commit('base');
    git('checkout', '-q', '-b', 'mudanca');
    gravar(mudanca.depois);
    if (!mudanca.semCommit) commit('mudanca');
    return regra.verificar(mudanca.arquivo, fs.readFileSync(path.join(raiz, mudanca.arquivo), 'utf8'), raiz, base);
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
  }
}

function acusa(mudanca, linhas, porque) {
  const achados = achadosDaMudanca(mudanca);
  assert.deepStrictEqual(achados.map(a => a.linha), linhas, `${mudanca.arquivo}: ${porque}\n${JSON.stringify(achados, null, 2)}`);
  total++;
  return achados;
}

const alterado = (arquivo, antes, depois) => ({ antes: { [arquivo]: antes }, depois: { [arquivo]: depois }, arquivo });
const novo = (arquivo, texto) => ({ antes: {}, depois: { [arquivo]: texto }, arquivo });

function confereSeAplica(arquivo, esperado) {
  assert.strictEqual(regra.seAplica(arquivo), esperado);
  total++;
}

const juntar = (...linhas) => `${linhas.join('\n')}\n`;

const ENVIO_ANTES = juntar(
  '    def abrir(self):',
  '        if self.dados:',
  '            apagar_os_provisorios(self.dados, avisar_do_que_ficou(self.logger))',
  '        return self',
);
const ENVIO_DEPOIS = ENVIO_ANTES.replace('self.logger))\n', 'self.logger))  # os `.novo` da morte\n');
const [daMorte] = acusa(alterado('complemento/envio.py', ENVIO_ANTES, ENVIO_DEPOIS), [3],
  'e36a3a7a: o comentário no fim da linha que a #442 acrescentou');
assert.match(daMorte.detalhe, /comentário novo: “os `\.novo` da morte”/);
acusa(alterado('complemento/envio.py', ENVIO_ANTES, ENVIO_ANTES), [], 'o mesmo arquivo sem o comentário passa');

const PROVISORIOS = juntar(
  'import unittest',
  'from complemento.test_envio import ID, LINHA, PALAVRA, EnvioNoTeste, pedido  # noqa: E402',
  '',
  'class T(unittest.TestCase):',
  '    def test_apaga(self):',
  '        # A Conexão morreu entre escrever o provisório e renomeá-lo (#318: o nome é único por gravação, então nenhuma gravação',
  '        # seguinte o reescreve): sem a limpeza na subida, a Frase ficaria em `fila/` para sempre, mesmo com o Envio concluído.',
  '        # Um arquivo aberto por outro programa (o Windows recusa apagar) levanta `PermissionError`.',
  '        self.assertTrue(True)',
);
acusa(novo('complemento/test_envio_provisorios.py', PROVISORIOS), [6, 7, 8],
  'e36a3a7a: o arquivo novo, cada linha do comentário é acusada e o noqa passa');
acusa({ ...novo('complemento/test_envio_provisorios.py', PROVISORIOS), semCommit: true }, [6, 7, 8],
  'o mesmo arquivo ainda sem commit (fora do índice)');
acusa(novo('complemento/test_envio_provisorios.py', PROVISORIOS.split('\n').filter(l => !/^ {8}# /.test(l)).join('\n')),
  [], 'sem o comentário, só o noqa fica e passa');

const REGRAS_ANTES = juntar(
  'jobs:',
  '  regras:',
  '    steps:',
  '      - name: Autoria dos commits',
  '        if: ${{ !cancelled() && github.event_name == \'pull_request\' }}',
  '        run: node scripts/ci/autoria.js "origin/$BASE" "$HEAD"',
);
const REGRAS_DEPOIS = REGRAS_ANTES.replace('      - name: Autoria', juntar(
  '      # A autoria: todo commit do PR (base..ponta da branch) tem como autor e committer o e-mail do',
  '      # dono, e nenhuma linha Co-authored-by da mensagem traz outro e-mail.',
  '      - name: Autoria',
).slice(0, -1));
acusa(alterado('.github/workflows/regras.yml', REGRAS_ANTES, REGRAS_DEPOIS), [4, 5],
  'b5899631: o bloco de comentário que o PR #436 pôs no workflow');

const REGISTRAR = juntar(
  '#!/usr/bin/env node',
  '// Publica na PR o que o check "Registro da PR" (registro-da-pr.js) confere, com o head lido do GitHub na hora em vez de',
  '// copiado à mão: o registro do /code-review (um comentário) e a seção "Prova real" (no corpo).',
  '// Uso: AJUDA, logo abaixo (`node scripts/ci/registrar-na-pr.js --help`).',
  "'use strict';",
  '',
  '/** O comentário que é o registro do /code-review: as quatro linhas que o check lê e, depois, a nota. */',
  'function comentarioDoRegistro(head) {',
  '  // O modelo da PR traz o formato dentro de um comentário de HTML, e um bloco de código pode citar o título: não são a seção.',
  '  return head;',
  '}',
);
acusa(novo('scripts/ci/registrar-na-pr.js', REGISTRAR), [2, 3, 4, 7, 9],
  'f4bbbde5: a linha 1 #! passa; o cabeçalho de três linhas, o JSDoc e o comentário de dentro da função não');
acusa(novo('scripts/ci/registrar-na-pr.js', REGISTRAR.split('\n').filter(l => !/^\s*(\/\/|\/\*\*)/.test(l)).join('\n')),
  [], 'sem os comentários só o #! fica, e passa');

const NOTA_VELHA = juntar('// uma nota que já estava lá', 'function a() {}');
acusa(alterado('painel.js', NOTA_VELHA, juntar('// uma nota que já estava lá', 'function a() {}', 'function b() {}')), [],
  'o comentário que já existia na base não bloqueia');
acusa(alterado('painel.js', NOTA_VELHA, juntar('// uma nota que já estava lá', '// e mais uma', 'function a() {}')), [2],
  'estender um comentário velho acusa a linha acrescentada');
acusa(alterado('painel.js', juntar('function a() {}', '', 'function b() {}'), juntar('function b() {}', '', 'function a() {}')), [], 'trocar o código de lugar sem comentário passa');
const COM_NOTA = juntar('// uma nota que já estava lá', 'function a() { return 1; }', 'function b() { return 2; }');
acusa({ antes: { 'lib/velho.js': COM_NOTA }, depois: { 'lib/velho.js': null, 'lib/novo.js': COM_NOTA }, arquivo: 'lib/novo.js' }, [], 'mover o arquivo com o comentário que ele já tinha não conta como comentário novo');

const sem = (arquivo, texto, porque) => acusa(novo(arquivo, texto), [], porque);
const com = (arquivo, texto, linhas, porque) => acusa(novo(arquivo, texto), linhas, porque);

sem('painel.js', juntar('// eslint-disable-next-line no-console', 'console.log(1);', '/* eslint-disable no-alert */', '/* eslint-env browser */'), 'eslint');
sem('painel.js', juntar('// @ts-check', '// @ts-ignore', 'x();', '// @ts-expect-error', 'y();'), '@ts-*');
sem('painel.js', juntar('/* istanbul ignore next */', 'x();', '/* c8 ignore start */', 'y();', '// prettier-ignore', 'const m = [1,2];'), 'istanbul, c8, prettier-ignore');
sem('scripts/a.sh', juntar('# shellcheck source=lib.sh', '. ./lib.sh', '# shellcheck disable=SC2034,SC2086', 'x=1'), 'shellcheck');
sem('complemento/a.py', juntar('# -*- coding: utf-8 -*-', 'import x  # noqa: E402', 'y = f()  # type: ignore[attr-defined]', '# coding=utf-8'), 'noqa, type: ignore, coding');
sem('complemento/a.py', juntar('#!/usr/bin/env python3', '# SPDX-License-Identifier: MIT', 'x = 1'), 'shebang e SPDX');
sem('painel.js', juntar('/*', ' * Copyright (c) 2026 Alguém', ' * SPDX-License-Identifier: MIT', ' */', 'x();'), 'cabeçalho de licença: o ano e o dono, o identificador SPDX');
sem('painel.css', juntar('/* SPDX-License-Identifier: MIT */', '.a { color: var(--veio-text); }'), 'licença no CSS');
com('scripts/a.sh', juntar('#!/usr/bin/env bash', '# nada de especial aqui', 'x=1'), [2], 'o shebang passa e o comentário seguinte não');
sem('e2e/tests/a.spec.js', juntar(
  "test('filtro', async ({ page }) => {",
  '  // Exceção de teste: sem-estado-guardado — só filtra a lista',
  '});',
), 'a marca que a regra e2e-estado-final lê');
com('e2e/tests/a.spec.js', juntar('// Exceção de teste: sem-estado-guardado — só filtra a lista', '// o retry é 3 porque o CI é lento, decisão da PR 12'), [1, 2],
  'a marca vale numa linha só; a prosa embaixo dela não passa');
sem('e2e/tests/a.spec.js', juntar(
  '  // Exceção de teste: chrome-nativo — o diálogo do Chrome',
  '  await page.evaluate(() => 1);',
), 'a marca que a regra e2e-funcao-interna lê');
sem('e2e/fakes/anki.js', juntar('/** @estado-guardado O que o fake guardou. */', 'function enviosEm(idioma) { return []; }'), '@estado-guardado do fake');
com('e2e/fakes/anki.js', juntar('x(); // cache por causa da lentidão @estado-guardado', '// uma história', '// @estado-guardado'), [1, 2, 3], '@estado-guardado só abre o comentário, numa linha só');
sem('painel.css', '.a { font-size: 9px; } /* exceção tokens-veio até 2099-12-31, aprovada por Vinicius: imita o badge */\n', 'a exceção de outra regra');

com('painel.js', juntar('// we use eslint-disable here because it is faster', 'x();'), [1], 'a diretiva só vale no começo do comentário');
com('painel.js', juntar('x(); // see @ts-ignore'), [1], '@ts-ignore no meio da frase');
com('painel.js', juntar('// eslint-disable-next-line no-x', '// e por que a gente desliga a regra aqui'), [1, 2], 'a diretiva com texto solto junto');
com('painel.js', juntar('x(); // exceção inventada até 2099-12-31, aprovada por Vinicius: sem regra com esse nome'), [1], 'exceção de uma regra que não existe');
com('painel.js', juntar('x(); // exceção tokens-veio porque sim'), [1], 'exceção de outra regra fora do formato');
com('painel.js', juntar('x();', '', '', '', '', '', '// Copyright (c) 2026 Alguém'), [7], 'o cabeçalho de licença só vale no começo do arquivo');
com('painel.js', juntar('x();', '// Exceção de teste qualquer coisa'), [2], 'a marca de teste precisa do nome da exceção');
com('complemento/a.py', juntar('x = 1', '#!/usr/bin/env python3'), [2], '#! fora da linha 1 não é shebang');
com('painel.css', juntar('.a { color: var(--veio-text); }', '/* a cor do texto */', '.b { color: var(--veio-text); } /* de novo */'), [2, 3], 'CSS, na linha e no fim dela');
com('painel.html', juntar('<main>', '  <!-- a lista -->', '  <ul></ul>', '  <style>.a { color: var(--veio-text); } /* css */</style>', '  <script>x(); // js', '  </script>', '</main>'),
  [2, 4, 5], 'HTML, e o CSS e o JS de dentro dele');
com('scripts/a.sh', juntar('#!/usr/bin/env bash', '# lista os arquivos', 'ls  # no fim', 'echo "# dentro da string" \'# na simples\''), [2, 3], 'shell');
com('.github/workflows/testes.yml', juntar('jobs:', '  a:', '    steps:', '      - run: echo oi # no fim', '      # no meio dos passos'), [4, 5], 'workflow: no fim e em linha própria');
com('.github/workflows/testes.yml', juntar('jobs:', '  a:', '    steps:', '      - run: |', '          echo oi', '          # dentro do bloco do shell', '          echo "$#"'), [6],
  'o comentário do script de um `run: |` é de shell');
com('complemento/a.py', juntar('x = 1  # ok', 'y = 2'), [1], 'Python, no fim da linha');
com('painel.js', juntar('// coding: we cache this because the API is slow', 'x();'), [1], 'coding: só vale como a linha de codificação do Python');
com('painel.js', juntar('// coding: utf-8', 'x();'), [1], 'a linha de codificação só passa em Python, mesmo sem prosa');
com('scripts/a.sh', juntar('#!/usr/bin/env bash', '# -*- coding: utf-8 -*-', 'x=1'), [2], 'a linha de codificação no shell não passa');
com('complemento/a.py', juntar('# coding: we cache this because the API is slow', 'x = 1'), [1], 'coding: com prosa não é a linha de codificação');
com('scripts/a.sh', juntar('# shellcheck source=lib.sh porque o caminho muda'), [1], 'a diretiva do shellcheck não leva prosa atrás');
com('painel.js', juntar('x(); // noqa porque a API é lenta', 'y(); // @ts-ignore porque o tipo é assim'), [1, 2], 'a diretiva não leva prosa atrás');
com('painel.js', juntar('x(); // retry 3x porque a API falha @estado-guardado'), [1], '@estado-guardado só vale nos fakes de e2e/fakes/');
com('painel.js', juntar('// Exceção de teste: sem-estado-guardado — fora de e2e/tests/'), [1], 'a marca de teste só vale nos specs de e2e/tests/');
com('painel.js', juntar('// Copyright is tricky: we cache because the API is slow', '// Licensed under a decision we took in PR 12'), [1, 2], 'a licença tem a forma de uma licença, não só a palavra');
com('painel.js', juntar('/*', ' * Copyright (c) 2026 Alguém', ' * Licensed under the MIT License', ' */', 'x();'), [2, 3], 'a licença por extenso fica de fora: leva exceção na linha');
com('complemento/a.py', juntar('x = 1  # exceção tokens-veio até 2099-12-31, aprovada por Vinicius: a regra não olha Python'), [1],
  'a exceção de uma regra que não olha o arquivo não é conferida por ninguém e não passa');
com('painel.css', juntar('.a { font-size: 9px; }', '/* exceção tokens-veio até 2099-12-31, aprovada por Vinicius: imita o badge', '   e mais uma história inteira sobre o badge */'), [2, 3],
  'a exceção de outra regra é uma linha só');
com('scripts/a.sh', juntar('#!/usr/bin/env bash', '(( n = x << deslocamento ))', '# depois da aritmética'), [3], 'o << de aritmética não abre um heredoc');
com('painel.js', juntar('// Copyright 2024 o cache fica velho entao recalcula'), [1], 'a licença não leva prosa depois do ano');
com('complemento/a.py', juntar('# SPDX-License-Identifier: porque o anki trava (sim)'), [1], 'o identificador SPDX não leva prosa');
com('e2e/fakes/anki.js', juntar('x(); // @estado-guardado prosa livre'), [1], 'a marca do fake só vale em linha própria');
com('e2e/tests/a.spec.js', juntar('x(); // Exceção de teste: sem-estado-guardado — prosa qualquer'), [1], 'a marca de teste só vale em linha própria');
com('scripts/a.sh', juntar('#!/usr/bin/env bash', 'cat <<EOF', '  EOF', '# no heredoc ainda', 'EOF', '# depois'), [6], 'o delimitador do heredoc é exato, com espaço na frente não fecha');
com('scripts/a.sh', juntar('#!/usr/bin/env bash', '(( n++ )); cat <<EOF', '# texto do heredoc', 'EOF', '# depois'), [5], 'a aritmética fechada não impede o heredoc');
com('scripts/a.sh', juntar('#!/usr/bin/env bash', 'case "$x" in', '  a)# escolhe a', '  ;;', 'esac'), [3], 'o # logo depois do ) é comentário');

confereSeAplica('docs/design/protótipo.html', false);
confereSeAplica('.claude/skills/x/scripts/a.sh', false);
confereSeAplica('README.md', false);
confereSeAplica('e2e/fontconfig/fonts.conf', false);
confereSeAplica('.github/workflows/regras.yml', true);
confereSeAplica('scripts/ganchos/pre-push', true);
confereSeAplica('scripts/ci/classificar.sh', true);
confereSeAplica('complemento/envio.py', true);
confereSeAplica('painel.html', true);

sem('painel.js', juntar("const url = 'https://exemplo.com/a';", 'const re = /\\/\\/ x/;', 'const t = `// não é comentário`;'), 'barras dentro de string, regex e template');
sem('scripts/a.sh', juntar('#!/usr/bin/env bash', 'n=${#lista[@]}', 'if [ $# -eq 0 ]; then x=$(echo "a" | wc -c); fi', 'cat <<EOF', '# texto do heredoc', 'EOF', 'y="$(printf "%s" "${x#a}")"'), 'shell: $#, ${#}, heredoc e aspas dentro de $( )');
sem('.github/workflows/a.yml', juntar('a:', '  b: |', '    # texto de um bloco que não é shell', '  c: "x # y"'), 'YAML: # de dentro de bloco de texto e de aspas');

assert.strictEqual(regra.verificar('painel.js', '// x\n', '/tmp', null).length, 0, 'sem base não há o que comparar');
total++;

function semAncestralComum() {
  const repositorio = raizTemporaria();
  try {
    repositorio.gravar({ 'painel.js': 'x();\n' });
    repositorio.commit('principal');
    repositorio.git('checkout', '-q', '--orphan', 'outra');
    const orfao = repositorio.commit('história sem ancestral comum');
    repositorio.git('checkout', '-q', 'main');
    assert.throws(() => regra.verificar('painel.js', '// x\n', repositorio.raiz, orfao), /não têm um ancestral comum/, 'sem ancestral comum a regra falha em vez de passar calada');
    total++;
  } finally {
    fs.rmSync(repositorio.raiz, { recursive: true, force: true });
  }
}
semAncestralComum();

console.log(`sem-comentario-novo: ${total} provas passaram`);

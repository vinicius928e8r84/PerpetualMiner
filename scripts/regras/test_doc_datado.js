'use strict';

// A prova da regra doc-datado (scripts/regras/doc-datado.js): acusa o erro real que a fez existir e
// deixa passar o jeito certo; a catraca inteira é provada em test_regras.js.

const assert = require('assert');
const path = require('path');

const regras = Object.fromEntries(require('./verificar').REGRAS.map(regra => [regra.id, regra]));
const RAIZ = path.resolve(__dirname, '..', '..');

let total = 0;
function acusa(id, arquivo, fonte, quantas, porque) {
  const achados = regras[id].verificar(arquivo, fonte, RAIZ);
  assert.strictEqual(achados.length, quantas, `${id} em ${arquivo}: ${porque}\n${JSON.stringify(achados, null, 2)}`);
  total++;
}

// Os erros reais: a SKILL.md de verificação carregou "41" como o tamanho da suíte e o CLAUDE.md ainda fala em "about 700 tests".
acusa('doc-datado', '.agents/skills/verify-perpetualminer/SKILL.md', 'that the suite is collectable (41 specs listed by `playwright test --list`)\n', 1, 'contagem de specs (a SKILL.md antes do #226)');
acusa('doc-datado', 'CLAUDE.md', 'the whole suite (about 700 tests) runs in CI\n', 1, 'contagem de tests (CLAUDE.md)');
acusa('doc-datado', 'docs/instalar-extensao.md', 'São 12 testes de ponta a ponta.\n', 1, 'contagem em português');
acusa('doc-datado', 'complemento/LEIA-ME.md', 'o servidor tem 3 e2e specs\n', 1, 'um e2e entre o número e a palavra');
acusa('doc-datado', 'docs/design/README.md', 'Nesta rodada travo a variante; esta PR traz o painel e nessa rodada nada mais.\n', 3, 'esta PR / nesta rodada');
acusa('doc-datado', 'CLAUDE.md', 'Neste PR o painel muda.\n', 1, 'o masculino: Neste PR');
acusa('doc-datado', '.agents/skills/popup/SKILL.md', 'This PR adds the popup; in this PR nothing else.\n', 2, 'this PR');
acusa('doc-datado', 'CLAUDE.md', 'one finding\nholds 236 older tests on its baseline\n', 1, 'a linha do achado é a certa');
acusa('doc-datado', 'CLAUDE.md', [
  'Run `HEADED=1 npm test` to see the browser; the doctor counts the specs (`playwright test --list`).',
  'A suíte inteira roda no CI; os testes de cada grupo: `node scripts/testar.mjs --listar`.',
  'Rode os specs da área; a prova de cada regra fica em test_regras.js (Python 3.9, 3.13).',
  'Veja o PR no git log; a rodada de revisão fica no ticket.',
].join('\n'), 0, 'comandos, variável com número, sem contagem');
// Os falsos positivos: a versão do Python antes de "tests" e o número da regra antes de "Every test".
acusa('doc-datado', 'CLAUDE.md', [
  'Add-on: the Python 3.9 tests and the Python 3.13 tests run in CI.',
  '| 12 Every test runs in CI | `testes-no-portao` |',
].join('\n'), 0, 'versão decimal e "Every test" não são contagem');
acusa('doc-datado', 'CLAUDE.md', 'o grupo roda 1.200 tests e 3 e2e specs\n', 2, 'milhar com ponto e um e2e ainda são contagem');
// Onde a regra vale: docs/ (menos docs/superpowers/), complemento/, CLAUDE.md e as skills, só em Markdown.
const aplica = arquivo => regras['doc-datado'].seAplica(arquivo);
for (const sim of ['CLAUDE.md', 'docs/instalar-extensao.md', 'docs/design/voz/README.md', 'complemento/LEIA-ME.md', 'complemento/contrato/LEIA-ME.md',
  '.agents/skills/verify-perpetualminer/SKILL.md', '.agents/skills/verify-perpetualminer/features/ia.md']) {
  assert.strictEqual(aplica(sim), true, `${sim} é conferido`);
  total++;
}
for (const nao of ['docs/superpowers/specs/2026-06-nota.md', 'README.md', 'bridge/README.md', 'engine/CLAUDE.md', 'docs/design/painel/p.html', 'painel.js', 'complemento/servidor.py']) {
  assert.strictEqual(aplica(nao), false, `${nao} não é conferido`);
  total++;
}

console.log(`doc-datado: ${total} provas passaram`);

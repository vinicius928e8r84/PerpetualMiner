'use strict';

const assert = require('assert');
const path = require('path');

const regras = Object.fromEntries(require('./verificar').REGRAS.map(regra => [regra.id, regra]));
const RAIZ = path.resolve(__dirname, '..', '..');

const REGRA = regras['doc-datado'];

let total = 0;
function acusa(arquivo, fonte, quantas, porque) {
  const achados = REGRA.verificar(arquivo, fonte, RAIZ);
  assert.strictEqual(achados.length, quantas, `${REGRA.id} em ${arquivo}: ${porque}\n${JSON.stringify(achados, null, 2)}`);
  total++;
}

function confereSeAplica(arquivos, esperado, porque) {
  for (const arquivo of arquivos) {
    assert.strictEqual(REGRA.seAplica(arquivo), esperado, `${arquivo} ${porque}`);
    total++;
  }
}

acusa('.agents/skills/verify-perpetualminer/SKILL.md', 'that the suite is collectable (41 specs listed by `playwright test --list`)\n', 1, 'contagem de specs (a SKILL.md antes do #226)');
acusa('docs/arquitetura.md', 'the whole suite (about 700 tests) runs in CI\n', 1, 'contagem de tests (docs/arquitetura.md)');
acusa('docs/instalar-extensao.md', 'São 12 testes de ponta a ponta.\n', 1, 'contagem em português');
acusa('complemento/LEIA-ME.md', 'o servidor tem 3 e2e specs\n', 1, 'um e2e entre o número e a palavra');
acusa('docs/design/README.md', 'Nesta rodada travo a variante; esta PR traz o painel e nessa rodada nada mais.\n', 3, 'esta PR / nesta rodada');
acusa('docs/arquitetura.md', 'Neste PR o painel muda.\n', 1, 'o masculino: Neste PR');
acusa('.agents/skills/popup/SKILL.md', 'This PR adds the popup; in this PR nothing else.\n', 2, 'this PR');
acusa('docs/arquitetura.md', 'one finding\nholds 236 older tests on its baseline\n', 1, 'a linha do achado é a certa');
acusa('docs/arquitetura.md', [
  'Run `HEADED=1 npm test` to see the browser; the doctor counts the specs (`playwright test --list`).',
  'A suíte inteira roda no CI; os testes de cada grupo: `node scripts/testar.mjs --listar`.',
  'Rode os specs da área; a prova de cada regra fica em test_regras.js (Python 3.9, 3.13).',
  'Veja o PR no git log; a rodada de revisão fica no ticket.',
].join('\n'), 0, 'comandos, variável com número, sem contagem');
acusa('docs/arquitetura.md', [
  'Add-on: the Python 3.9 tests and the Python 3.13 tests run in CI.',
  '| 12 Every test runs in CI | `testes-no-portao` |',
].join('\n'), 0, 'versão decimal e "Every test" não são contagem');
acusa('docs/arquitetura.md', 'o grupo roda 1.200 tests e 3 e2e specs\n', 2, 'milhar com ponto e um e2e ainda são contagem');
confereSeAplica(['docs/arquitetura.md', 'docs/superpowers/specs/2026-06-nota.md', 'docs/instalar-extensao.md', 'docs/design/voz/README.md', 'complemento/LEIA-ME.md', 'complemento/contrato/LEIA-ME.md',
  '.agents/skills/verify-perpetualminer/SKILL.md', '.agents/skills/verify-perpetualminer/features/ia.md'], true, 'é conferido');
confereSeAplica(['CLAUDE.md', 'AGENTS.md', 'README.md', 'bridge/README.md', 'engine/CLAUDE.md', 'docs/design/painel/p.html', 'painel.js', 'complemento/servidor.py'], false, 'não é conferido');

console.log(`doc-datado: ${total} provas passaram`);

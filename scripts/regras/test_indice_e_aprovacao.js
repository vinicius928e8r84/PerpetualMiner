'use strict';

// As provas das regras indice-de-arquivos e aprovacao-visual; a catraca inteira é provada em test_regras.js.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const regras = Object.fromEntries(require('./verificar').REGRAS.map(regra => [regra.id, regra]));
const { repositorioDeTestes } = require('./apoio-de-testes');

let total = 0;
const nulo = (achados, quantas, porque) => { assert.strictEqual(achados.length, quantas, `${porque}\n${JSON.stringify(achados, null, 2)}`); total++; return achados; };

// indice-de-arquivos: o arquivo novo sem linha na tabela "Files" e a linha que sobrou de um arquivo que saiu
// (as omissões que a revisão do #183 e do #187 apontava à mão).
{
  const INDICE = [
    '### Files', '', '| File | Role |', '|---|---|',
    '| `manifest.json` | Permissions |',
    '| `popup.html/js/css` | The popup |',
    '| `lib/mineracao.js` | Mining |',
    '| `veio/` | Shared identity |',
    '',
    '### Outra seção', '', '| `lib/fora-da-tabela.js` | não conta |', '',
  ].join('\n');
  const repo = fonteDoIndice => repositorioDeTestes({ 'CLAUDE.md': fonteDoIndice, 'manifest.json': '{}', 'popup.html': '', 'popup.js': '', 'popup.css': '',
    'lib/mineracao.js': '', 'lib/abridor.js': '', 'lib/fora-da-tabela.js': '', 'veio/tokens.css': '', 'test_novo.js': '', 'README.md': '', '.gitignore': '' });
  const pasta = repo(INDICE);
  const doIndice = arquivo => regras['indice-de-arquivos'].verificar(arquivo, '', pasta);
  nulo(doIndice('lib/abridor.js'), 1, 'arquivo de lib/ que a tabela não cita');
  nulo(doIndice('lib/fora-da-tabela.js'), 1, 'citado só fora da seção Files não conta');
  nulo(doIndice('lib/mineracao.js'), 0, 'arquivo citado');
  for (const extensao of ['html', 'js', 'css']) nulo(doIndice(`popup.${extensao}`), 0, `popup.html/js/css cobre popup.${extensao}`);
  assert.deepStrictEqual(['lib/abridor.js', 'complemento/servidor.py', 'test_novo.js', '.gitignore', 'README.md', 'scripts/regras/verificar.js', 'CLAUDE.md']
    .map(arquivo => regras['indice-de-arquivos'].seAplica(arquivo)), [true, false, false, false, false, false, true]);
  total++;
  const linhaVelha = INDICE.replace('| `lib/mineracao.js` | Mining |', '| `lib/mineracao.js` | Mining |\n| `lib/removido.js` | Foi removido |');
  const velhas = regras['indice-de-arquivos'].verificar('CLAUDE.md', linhaVelha, pasta);
  nulo(velhas, 1, 'linha que cita um arquivo que não existe');
  assert.strictEqual(velhas[0].linha, 8);
  nulo(regras['indice-de-arquivos'].verificar('CLAUDE.md', INDICE, pasta), 0, 'a tabela certa não acusa');
  total++;
  fs.rmSync(pasta, { recursive: true, force: true });
}

// aprovacao-visual: o PNG novo de um --update-snapshots sem a aprovação do dono (regra 10 do CODING_STANDARDS),
// o que espera num test.fixme e o que o livro já registra.
{
  const SPEC = [
    "test('tela pronta', async ({ page }) => {", "  await expect(page).toHaveScreenshot('pronta.png');", '});',
    "test('tela sem entrada', async ({ page }) => {", "  await expect(page).toHaveScreenshot('sem-entrada.png');", '});',
    "test.fixme('proposta', async ({ page }) => {", "  await expect(page).toHaveScreenshot('proposta.png');", '});',
    "test('outra', async ({ page }) => {", "  await expect(page).toHaveScreenshot('sem-data.png');", '});',
  ].join('\n');
  const livro = telas => JSON.stringify({ telas });
  const pngs = Object.fromEntries(['pronta', 'sem-entrada', 'proposta', 'sem-data'].map(n => [`e2e/tests/x-visual.spec.js-snapshots/${n}-linux.png`, 'png']));
  const achadosDoLivro = telas => {
    const pasta = repositorioDeTestes({ ...pngs, 'e2e/aprovados-visuais.json': livro(telas) });
    try {
      return regras['aprovacao-visual'].verificar('e2e/tests/x-visual.spec.js', SPEC, pasta);
    } finally {
      fs.rmSync(pasta, { recursive: true, force: true });
    }
  };
  const aprovada = { data: '2026-10-20', resposta: 'Lavish telas-julgar' };
  const achados = nulo(achadosDoLivro({ 'x-visual': { 'pronta.png': aprovada, 'sem-data.png': { resposta: 'Lavish' } } }), 2, 'sem entrada e sem data; a pronta e a proposta em fixme passam');
  assert.match(achados.map(a => a.detalhe).join('\n'), /sem-entrada\.png não tem entrada/);
  assert.match(achados.map(a => a.detalhe).join('\n'), /sem-data\.png tem entrada .* sem data/);
  nulo(achadosDoLivro({ 'x-visual': { 'pronta.png': aprovada, 'sem-entrada.png': aprovada, 'sem-data.png': aprovada } }), 0, 'todas aprovadas ou em fixme');
  nulo(achadosDoLivro({}), 3, 'livro vazio: três sem entrada (a proposta em fixme não conta)');
  assert.strictEqual(regras['aprovacao-visual'].seAplica('e2e/tests/popup-visual.spec.js'), true);
  assert.strictEqual(regras['aprovacao-visual'].seAplica('e2e/tests/popup.spec.js'), false);
  total += 2;
}

console.log(`indice-de-arquivos e aprovacao-visual: ${total} provas passaram`);

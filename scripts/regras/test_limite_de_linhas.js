'use strict';

// A prova da regra limite-de-linhas (scripts/regras/limite-de-linhas.js), com arquivos reais do repositório:
// o bookreader.js (914 linhas) passado de 1.000 falha com o arquivo, a contagem e o teto, e volta a passar
// quando encolhe; a catraca da linha de base (um arquivo da lista não cresce, e a lista desce com ele) roda
// pelo `verificar.js` num repositório temporário.

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { repositorioDeTestes } = require('./apoio-de-testes');
const regra = require('./limite-de-linhas');

const RAIZ = path.resolve(__dirname, '..', '..');
const real = arquivo => fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');
const linhas = fonte => fonte.split('\n').slice(0, -1);

let total = 0;
const prova = (condicao, porque) => { assert.ok(condicao, porque); total++; };

// O arquivo real que cabe: bookreader.js tem menos de 1.000 linhas.
const bookreader = real('bookreader.js');
const base = linhas(bookreader);
assert.ok(base.length > 800 && base.length < regra.LIMITE, `bookreader.js mudou de tamanho (${base.length}); escolha outro arquivo real abaixo do limite`);
prova(regra.verificar('bookreader.js', bookreader).length === 0, 'o arquivo real abaixo do teto passa');

// O mesmo arquivo passado do teto: linhas reais do próprio arquivo acrescentadas até 1.037.
const acima = `${[...base, ...base.slice(0, regra.LIMITE + 37 - base.length)].join('\n')}\n`;
assert.strictEqual(regra.contarLinhas(acima), regra.LIMITE + 37);
prova(regra.verificar('bookreader.js', acima).length === 37, 'uma ocorrência por linha acima do teto');
prova(regra.verificar('bookreader.js', acima)[0].linha === regra.LIMITE + 1, 'a primeira ocorrência é a linha 1001');

// Contar linhas: a última quebra fecha a linha; sem ela, a última linha conta.
prova(regra.contarLinhas('') === 0 && regra.contarLinhas('a\n') === 1 && regra.contarLinhas('a\nb') === 2 && regra.contarLinhas('a\n\n') === 2,
  'a contagem de linhas');
const exatas = `${'x\n'.repeat(regra.LIMITE)}`;
prova(regra.verificar('a.js', exatas).length === 0, '1.000 linhas exatas cabem');
prova(regra.verificar('a.js', `${exatas}y\n`).length === 1, '1.001 linhas passam');

// O que a regra olha: código sim, documentação, fixtures, saída de build, minificado e lockfile não.
for (const arquivo of ['painel.js', 'x/y.ts', 'complemento/servidor.py', 'a/b.html', 'painel.css', 'scripts/atualizar-extensao.sh', 'e2e/fixtures.js', 'e2e/tests/a.spec.js']) {
  prova(regra.seAplica(arquivo), `${arquivo} é código`);
}
for (const arquivo of ['docs/design/painel/anki/prototipo-ajustes-envio.html', 'docs/x.js', 'e2e/fixtures/pagina.html', 'preview/dist/painel.js',
  'dist/a.js', 'lib/vendor/x.js', 'lib/marked.min.js', 'package-lock.json', 'README.md', 'dados.json', 'foto.png', 'yarn.lock']) {
  prova(!regra.seAplica(arquivo), `${arquivo} não conta`);
}
// Gerado: a marca nas primeiras linhas isenta; no meio do arquivo não.
prova(regra.verificar('a.js', `// @generated\n${exatas}y\n`).length === 0, 'a marca de arquivo gerado isenta');
prova(regra.verificar('a.js', `${exatas}// @generated\n`).length === 1, 'a marca fora do cabeçalho não isenta');

// A catraca inteira, pelo verificar.js, num repositório temporário com o arquivo real.
const LIMPO = JSON.stringify({ 'limite-de-linhas': {} });
const BASE_COM_O_ARQUIVO = excesso => JSON.stringify({ 'limite-de-linhas': { 'bookreader.js': excesso } });
function verificar(arquivos) {
  const pasta = repositorioDeTestes(arquivos);
  try {
    const env = { ...process.env };
    delete env.REGRAS_BASE;
    const r = spawnSync('node', [path.join(__dirname, 'verificar.js'), '--raiz', pasta, '--base', '0000000000000000000000000000000000000000'], { cwd: pasta, encoding: 'utf8', env });
    return { status: r.status, saida: r.stdout, pasta };
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
}
const comLinhas = (fonte, linhaDeBase) => ({ 'bookreader.js': fonte, 'scripts/regras/linha-de-base.json': linhaDeBase });

// ANTES: o arquivo real passado de 1.000 linhas, fora da lista, falha com o arquivo, a contagem, o teto e o conserto.
let r = verificar(comLinhas(acima, LIMPO));
assert.strictEqual(r.status, 1, r.saida);
assert.match(r.saida, /✗ limite-de-linhas — bookreader\.js: 1037 linhas; o teto é 1000 \(37 acima\)/);
assert.match(r.saida, /Divida o arquivo por responsabilidade em módulos menores/);
total += 3;
// DEPOIS: o mesmo arquivo de volta ao tamanho real passa.
r = verificar(comLinhas(bookreader, LIMPO));
assert.strictEqual(r.status, 0, r.saida);
total++;

// Na linha de base: pode ficar como está, não pode crescer, e a lista desce com ele.
r = verificar(comLinhas(acima, BASE_COM_O_ARQUIVO(37)));
assert.strictEqual(r.status, 0, `na lista, sem crescer: ${r.saida}`);
const maisUma = `${acima}${base[0]}\n`;
r = verificar(comLinhas(maisUma, BASE_COM_O_ARQUIVO(37)));
assert.strictEqual(r.status, 1, 'uma linha a mais que a linha de base falha');
assert.match(r.saida, /bookreader\.js: 1038 linhas; o teto é 1000 \(38 acima\)\. Ele já passava do limite quando a regra entrou e a linha de base o deixa em 1037 linhas: não pode crescer/);
total += 3;
// Encolheu, mas a linha de base não desceu: falha, para o teto de cada um ser o tamanho de hoje.
const menos = `${[...base, ...base.slice(0, regra.LIMITE + 10 - base.length)].join('\n')}\n`;
r = verificar(comLinhas(menos, BASE_COM_O_ARQUIVO(37)));
assert.strictEqual(r.status, 1, 'encolher sem baixar a linha de base falha');
assert.match(r.saida, /bookreader\.js tem 1010 linhas e a linha de base ainda o deixa em 1037: baixe-a/);
r = verificar(comLinhas(menos, BASE_COM_O_ARQUIVO(10)));
assert.strictEqual(r.status, 0, r.saida);
total += 3;
// Abaixo de 1.000: sai da lista (a entrada que sobra falha), e fora dela o arquivo passa.
r = verificar(comLinhas(bookreader, BASE_COM_O_ARQUIVO(37)));
assert.strictEqual(r.status, 1, 'o arquivo que voltou ao limite sai da lista');
assert.match(r.saida, /bookreader\.js ficou em 1000 linhas ou menos: tire-o da linha de base/);
total += 2;

console.log(`limite-de-linhas: ${total} provas passaram`);

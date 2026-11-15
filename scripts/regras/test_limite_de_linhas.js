'use strict';

// A prova da regra limite-de-linhas (scripts/regras/limite-de-linhas.js), com arquivos reais do repositório:
// o bookreader.js (914 linhas) passado de 1.000 falha com o arquivo, a contagem e o teto, e volta a passar
// quando encolhe; a catraca da linha de base (um arquivo da lista não cresce, e a lista desce com ele) roda
// pelo `verificar.js` num repositório temporário.

const assert = require('assert');
const { execFileSync, spawnSync } = require('child_process');
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

// --atualizar depois de um arquivo da lista encolher: o conserto que a regra manda rodar tem de rodar.
function atualizar(arquivos) {
  const pasta = repositorioDeTestes(arquivos);
  try {
    const env = { ...process.env };
    delete env.REGRAS_BASE;
    const r = spawnSync('node', [path.join(__dirname, 'verificar.js'), '--raiz', pasta, '--base', '0000000000000000000000000000000000000000', '--atualizar'], { cwd: pasta, encoding: 'utf8', env });
    const gravada = JSON.parse(fs.readFileSync(path.join(pasta, 'scripts/regras/linha-de-base.json'), 'utf8'));
    return { status: r.status, saida: r.stdout, gravada: gravada['limite-de-linhas'] };
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
}
let a = atualizar(comLinhas(menos, BASE_COM_O_ARQUIVO(37)));
assert.strictEqual(a.status, 0, `--atualizar com um arquivo da lista encolhido: ${a.saida}`);
assert.deepStrictEqual(a.gravada, { 'bookreader.js': 10 }, 'a linha de base desce junto com o arquivo');
a = atualizar(comLinhas(bookreader, BASE_COM_O_ARQUIVO(37)));
assert.strictEqual(a.status, 0, `--atualizar com o arquivo de volta ao teto: ${a.saida}`);
assert.deepStrictEqual(a.gravada, {}, 'o arquivo que voltou ao teto sai da lista');
total += 4;

// Contra a main: a linha de base do ramo não esconde arquivo novo acima do teto nem a marca de gerado num arquivo da lista.
// O repositório tem um commit (a "main") com a linha de base dele; o que o ramo muda fica na árvore de trabalho.
function contraAMain(naMain, noRamo) {
  const pasta = repositorioDeTestes(naMain);
  try {
    const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: pasta, stdio: 'ignore' });
    git('add', '-A');
    git('commit', '-q', '-m', 'main');
    for (const [arquivo, texto] of Object.entries(noRamo)) fs.writeFileSync(path.join(pasta, arquivo), texto);
    const env = { ...process.env };
    delete env.REGRAS_BASE;
    const r = spawnSync('node', [path.join(__dirname, 'verificar.js'), '--raiz', pasta, '--base', 'HEAD'], { cwd: pasta, encoding: 'utf8', env });
    return { status: r.status, saida: r.stdout };
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
}
const GRANDE = (n, marca = '') => `${marca}${'x\n'.repeat(n - (marca ? 1 : 0))}`;
const LISTA = objeto => JSON.stringify({ 'limite-de-linhas': objeto });
const naMain = { 'grande.js': GRANDE(1100), 'bookreader.js': bookreader, 'scripts/regras/linha-de-base.json': LISTA({ 'grande.js': 100 }) };
// Troca de folga: grande.js encolhe 10 linhas e o bookreader.js (fora da lista) ganha 7 acima do teto; o total da regra não sobe.
const emFolga = `${[...base, ...base.slice(0, regra.LIMITE + 7 - base.length)].join('\n')}\n`;
r = contraAMain(naMain, { 'grande.js': GRANDE(1090), 'bookreader.js': emFolga, 'scripts/regras/linha-de-base.json': LISTA({ 'grande.js': 90, 'bookreader.js': 7 }) });
assert.strictEqual(r.status, 1, `a folga de um arquivo não passa para outro: ${r.saida}`);
assert.match(r.saida, /scripts\/regras\/linha-de-base\.json: limite-de-linhas bookreader\.js não está na linha de base de HEAD/);
// O arquivo novo acima do teto com a linha de base intocada também falha (o que a regra já fazia).
r = contraAMain(naMain, { 'bookreader.js': emFolga });
assert.strictEqual(r.status, 1, r.saida);
// Um valor maior que o da main para o mesmo arquivo falha, mesmo com o total igual (outro arquivo desceu na mesma medida).
const duas = { 'a.js': GRANDE(1050), 'b.js': GRANDE(1050), 'scripts/regras/linha-de-base.json': LISTA({ 'a.js': 50, 'b.js': 50 }) };
r = contraAMain(duas, { 'a.js': GRANDE(1040), 'b.js': GRANDE(1060), 'scripts/regras/linha-de-base.json': LISTA({ 'a.js': 40, 'b.js': 60 }) });
assert.strictEqual(r.status, 1, r.saida);
assert.match(r.saida, /limite-de-linhas b\.js tem 60 na linha de base do ramo, mais que os 50 de HEAD/);
// Encolher o arquivo e baixar a linha de base dele continua passando.
r = contraAMain(naMain, { 'grande.js': GRANDE(1090), 'scripts/regras/linha-de-base.json': LISTA({ 'grande.js': 90 }) });
assert.strictEqual(r.status, 0, r.saida);
// A marca de gerado não tira da lista o arquivo que a main já tem nela: o excesso real continua contando.
r = contraAMain(naMain, { 'grande.js': GRANDE(1100, '// DO NOT EDIT\n'), 'scripts/regras/linha-de-base.json': LISTA({}) });
assert.strictEqual(r.status, 1, `a marca de gerado num arquivo da lista não o isenta: ${r.saida}`);
assert.match(r.saida, /grande\.js: 1100 linhas; o teto é 1000 \(100 acima\)/);
// Num arquivo que a main não tem na lista, a marca continua isentando.
r = contraAMain(naMain, { 'gerado.js': GRANDE(1100, '// DO NOT EDIT\n') });
assert.strictEqual(r.status, 0, r.saida);
total += 7;

console.log(`limite-de-linhas: ${total} provas passaram`);

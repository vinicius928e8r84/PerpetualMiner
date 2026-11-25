'use strict';

const assert = require('assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { repositorioDeTestes } = require('./apoio-de-testes');
const regra = require('./limite-de-linhas');
const saude = require('./saude-do-codigo');
const semComentario = require('./sem-comentario');

const RAIZ = path.resolve(__dirname, '..', '..');

function rodarVerificar(pasta, args) {
  const env = { ...process.env };
  for (const nome of ['REGRAS_BASE', 'REGRAS_PR', 'GITHUB_EVENT_NAME']) delete env[nome];
  return spawnSync('node', [path.join(__dirname, 'verificar.js'), '--raiz', pasta, ...args], { cwd: pasta, encoding: 'utf8', env });
}
const real = arquivo => fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');
const linhas = fonte => fonte.split('\n').slice(0, -1);

let total = 0;
const prova = (condicao, porque) => { assert.ok(condicao, porque); total++; };

const bookreader = real('bookreader/bookreader.js');
const base = linhas(bookreader);
assert.ok(base.length > 700 && base.length < regra.LIMITE, `bookreader/bookreader.js mudou de tamanho (${base.length}); escolha outro arquivo real abaixo do limite`);
prova(regra.verificar('bookreader/bookreader.js', bookreader).length === 0, 'o arquivo real abaixo do teto passa');

const acima = `${[...base, ...base.slice(0, regra.LIMITE + 37 - base.length)].join('\n')}\n`;
assert.strictEqual(regra.contarLinhas(acima), regra.LIMITE + 37);
prova(regra.verificar('bookreader/bookreader.js', acima).length === 37, 'uma ocorrência por linha acima do teto');
prova(regra.verificar('bookreader/bookreader.js', acima)[0].linha === regra.LIMITE + 1, 'a primeira ocorrência é a linha 1001');

prova(regra.contarLinhas('') === 0 && regra.contarLinhas('a\n') === 1 && regra.contarLinhas('a\nb') === 2 && regra.contarLinhas('a\n\n') === 2,
  'a contagem de linhas');
const exatas = `${'x\n'.repeat(regra.LIMITE)}`;
prova(regra.verificar('a.js', exatas).length === 0, '1.000 linhas exatas cabem');
prova(regra.verificar('a.js', `${exatas}y\n`).length === 1, '1.001 linhas passam');

for (const arquivo of ['painel.js', 'x/y.ts', 'complemento/servidor.py', 'a/b.html', 'painel.css', 'scripts/atualizar-extensao.sh', 'e2e/fixtures.js', 'e2e/tests/a.spec.js']) {
  prova(regra.seAplica(arquivo), `${arquivo} é código`);
}
for (const arquivo of ['docs/design/painel/anki/prototipo-ajustes-envio.html', 'docs/x.js', 'e2e/fixtures/pagina.html', 'preview/dist/painel.js',
  'dist/a.js', 'lib/vendor/x.js', 'lib/marked.min.js', 'package-lock.json', 'README.md', 'dados.json', 'foto.png', 'yarn.lock']) {
  prova(!regra.seAplica(arquivo), `${arquivo} não conta`);
}
prova(regra.verificar('a.js', `// @generated\n${exatas}y\n`).length === 0, 'a marca de arquivo gerado isenta');
prova(regra.verificar('a.js', `${exatas}// @generated\n`).length === 1, 'a marca fora do cabeçalho não isenta');

const LIMPO = JSON.stringify({ 'limite-de-linhas': {} });
const BASE_COM_O_ARQUIVO = excesso => JSON.stringify({ 'limite-de-linhas': { 'bookreader/bookreader.js': excesso } });
function verificar(arquivos) {
  const pasta = repositorioDeTestes(arquivos);
  try {
    const r = rodarVerificar(pasta, ['--base', '0000000000000000000000000000000000000000']);
    return { status: r.status, saida: r.stdout, pasta };
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
}
const comOsTetosDoBookreader = (linhaDeBase, fonte) => {
  const comentarios = semComentario.verificar('bookreader/bookreader.js', fonte).length;
  return JSON.stringify({
    ...JSON.parse(linhaDeBase),
    'saude-do-codigo': { 'bookreader/bookreader.js': saude.verificar('bookreader/bookreader.js', fonte).length },
    'sem-comentario': comentarios > 0 ? { 'bookreader/bookreader.js': comentarios } : {},
  });
};
const comLinhas = (fonte, linhaDeBase) => ({ 'bookreader/bookreader.js': fonte, 'scripts/regras/linha-de-base.json': comOsTetosDoBookreader(linhaDeBase, fonte) });

// ANTES: o arquivo real passado de 1.000 linhas, fora da lista, falha com o arquivo, a contagem, o teto e o conserto.
let r = verificar(comLinhas(acima, LIMPO));
assert.strictEqual(r.status, 1, r.saida);
assert.match(r.saida, /✗ limite-de-linhas — bookreader\/bookreader\.js: 1037 linhas; o teto é 1000 \(37 acima\)/);
assert.match(r.saida, /Divida o arquivo por responsabilidade em módulos menores/);
total += 3;
// DEPOIS: o mesmo arquivo de volta ao tamanho real passa.
r = verificar(comLinhas(bookreader, LIMPO));
assert.strictEqual(r.status, 0, r.saida);
total++;

r = verificar(comLinhas(acima, BASE_COM_O_ARQUIVO(37)));
assert.strictEqual(r.status, 0, `na lista, sem crescer: ${r.saida}`);
const maisUma = `${acima}${base[0]}\n`;
r = verificar(comLinhas(maisUma, BASE_COM_O_ARQUIVO(37)));
assert.strictEqual(r.status, 1, 'uma linha a mais que a linha de base falha');
assert.match(r.saida, /bookreader\/bookreader\.js: 1038 linhas; o teto é 1000 \(38 acima\)\. Ele já passava do limite quando a regra entrou e a linha de base o deixa em 1037 linhas: não pode crescer/);
total += 3;
const menos = `${[...base, ...base.slice(0, regra.LIMITE + 10 - base.length)].join('\n')}\n`;
r = verificar(comLinhas(menos, BASE_COM_O_ARQUIVO(37)));
assert.strictEqual(r.status, 0, `encolher sem baixar a linha de base passa: ela desce depois do merge\n${r.saida}`);
assert.match(r.saida, /a linha de base pode descer[^]*limite-de-linhas bookreader\/bookreader\.js: 37 → 10/);
r = verificar(comLinhas(menos, BASE_COM_O_ARQUIVO(10)));
assert.strictEqual(r.status, 0, r.saida);
total += 3;
r = verificar(comLinhas(bookreader, BASE_COM_O_ARQUIVO(37)));
assert.strictEqual(r.status, 0, `o arquivo que voltou ao limite passa, e a linha de base pode descer\n${r.saida}`);
assert.match(r.saida, /limite-de-linhas bookreader\/bookreader\.js: 37 → 0/);
total += 3;

function atualizar(arquivos) {
  const pasta = repositorioDeTestes(arquivos);
  try {
    const r = rodarVerificar(pasta, ['--base', '0000000000000000000000000000000000000000', '--atualizar']);
    const gravada = JSON.parse(fs.readFileSync(path.join(pasta, 'scripts/regras/linha-de-base.json'), 'utf8'));
    return { status: r.status, saida: r.stdout, gravada: gravada['limite-de-linhas'] };
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
}
let a = atualizar(comLinhas(menos, BASE_COM_O_ARQUIVO(37)));
assert.strictEqual(a.status, 0, `--atualizar com um arquivo da lista encolhido: ${a.saida}`);
assert.deepStrictEqual(a.gravada, { 'bookreader/bookreader.js': 10 }, 'a linha de base desce junto com o arquivo');
a = atualizar(comLinhas(bookreader, BASE_COM_O_ARQUIVO(37)));
assert.strictEqual(a.status, 0, `--atualizar com o arquivo de volta ao teto: ${a.saida}`);
assert.deepStrictEqual(a.gravada, {}, 'o arquivo que voltou ao teto sai da lista');
total += 4;

function contraAMain(naMain, noRamo) {
  const pasta = repositorioDeTestes(naMain);
  try {
    const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: pasta, stdio: 'ignore' });
    git('add', '-A');
    git('commit', '-q', '-m', 'main');
    for (const [arquivo, texto] of Object.entries(noRamo)) fs.writeFileSync(path.join(pasta, arquivo), texto);
    const r = rodarVerificar(pasta, ['--base', 'HEAD']);
    return { status: r.status, saida: r.stdout };
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
}
const GRANDE = (n, marca = '') => `${marca}${'x\n'.repeat(n - (marca ? 1 : 0))}`;
const LISTA = objeto => comOsTetosDoBookreader(JSON.stringify({ 'limite-de-linhas': objeto }), bookreader);
const naMain = { 'grande.js': GRANDE(1100), 'bookreader/bookreader.js': bookreader, 'scripts/regras/linha-de-base.json': LISTA({ 'grande.js': 100 }) };
const emFolga = `${[...base, ...base.slice(0, regra.LIMITE + 7 - base.length)].join('\n')}\n`;
r = contraAMain(naMain, { 'grande.js': GRANDE(1090), 'bookreader/bookreader.js': emFolga, 'scripts/regras/linha-de-base.json': LISTA({ 'grande.js': 90, 'bookreader/bookreader.js': 7 }) });
assert.strictEqual(r.status, 1, `a folga de um arquivo não passa para outro: ${r.saida}`);
assert.match(r.saida, /scripts\/regras\/linha-de-base\.json: limite-de-linhas bookreader\/bookreader\.js não está na linha de base de HEAD/);
r = contraAMain(naMain, { 'bookreader/bookreader.js': emFolga });
assert.strictEqual(r.status, 1, r.saida);
const duas = { 'a.js': GRANDE(1050), 'b.js': GRANDE(1050), 'scripts/regras/linha-de-base.json': LISTA({ 'a.js': 50, 'b.js': 50 }) };
r = contraAMain(duas, { 'a.js': GRANDE(1040), 'b.js': GRANDE(1060), 'scripts/regras/linha-de-base.json': LISTA({ 'a.js': 40, 'b.js': 60 }) });
assert.strictEqual(r.status, 1, r.saida);
assert.match(r.saida, /limite-de-linhas b\.js tem 60 na linha de base do ramo, mais que os 50 de HEAD/);
r = contraAMain(naMain, { 'grande.js': GRANDE(1090), 'scripts/regras/linha-de-base.json': LISTA({ 'grande.js': 90 }) });
assert.strictEqual(r.status, 0, r.saida);
r = contraAMain(naMain, { 'grande.js': GRANDE(1100, "const aviso = 'DO NOT EDIT';\n"), 'scripts/regras/linha-de-base.json': LISTA({}) });
assert.strictEqual(r.status, 1, `a marca de gerado num arquivo da lista não o isenta: ${r.saida}`);
assert.match(r.saida, /grande\.js: 1100 linhas; o teto é 1000 \(100 acima\)/);
r = contraAMain(naMain, { 'gerado.js': GRANDE(1100, "const aviso = 'DO NOT EDIT';\n") });
assert.strictEqual(r.status, 0, r.saida);
total += 7;

console.log(`limite-de-linhas: ${total} provas passaram`);

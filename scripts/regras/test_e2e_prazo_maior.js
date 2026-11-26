'use strict';

const assert = require('assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { REGRAS } = require('./verificar');
const { repositorioDeTestes } = require('./apoio-de-testes');

const REGRA = REGRAS.find(regra => regra.id === 'e2e-prazo-maior');
const CONFIG = 'e2e/playwright.config.js';
const SPEC = 'e2e/tests/a.spec.js';
const APOIO = 'e2e/apoio-a.js';

let total = 0;
const confere = (achados, quantas, porque) => {
  assert.strictEqual(achados.length, quantas, `${porque}\n${JSON.stringify(achados, null, 2)}`);
  total++;
  return achados;
};

const config = ({ retries = 'process.env.CI ? 1 : 0', timeout = '30_000', esperar = null } = {}) => [
  "const { defineConfig } = require('@playwright/test');",
  'module.exports = defineConfig({',
  `  timeout: ${timeout},`,
  ...(esperar ? [`  expect: { timeout: ${esperar} },`] : []),
  `  retries: ${retries},`,
  '});',
  '',
].join('\n');

const git = (pasta, ...args) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: pasta, encoding: 'utf8' }).trim();

function repositorioNaBase(arquivo, fonteDaBase) {
  const pasta = repositorioDeTestes({ [arquivo]: fonteDaBase });
  git(pasta, 'add', '-A');
  git(pasta, 'commit', '-q', '-m', 'base');
  return pasta;
}

function acusa(arquivo, daBase, agora) {
  const pasta = repositorioNaBase(arquivo, daBase);
  try {
    return REGRA.verificar(arquivo, agora, pasta, 'HEAD');
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
}

const noConfig = (daBase, agora) => acusa(CONFIG, daBase, agora);
const noSpec = (daBase, agora) => acusa(SPEC, daBase, agora);

confere(noConfig(config(), config()), 0, 'o config de hoje passa');
const subiuRetries = confere(noConfig(config(), config({ retries: 'process.env.CI ? 2 : 0' })), 1, 'o retries que sobe');
assert.match(subiuRetries[0].detalhe, /retries/);
total++;
confere(noConfig(config(), config({ retries: 'process.env.CI ? 1 : 3' })), 1, 'o retries que sobe fora do CI');
confere(noConfig(config(), config({ retries: '1' })), 0, 'o retries que fica igual, escrito de outro jeito');
confere(noConfig(config(), config({ retries: 'process.env.CI ? 0 : 0' })), 0, 'o retries que desce');
confere(noConfig(config(), config({ timeout: '60_000' })), 1, 'o timeout do teste que sobe');
confere(noConfig(config(), config({ timeout: '30 * 1000' })), 0, 'o timeout que fica igual, escrito como conta');
confere(noConfig(config(), config({ timeout: '20_000' })), 0, 'o timeout que desce');
confere(noConfig(config(), config({ esperar: '10_000' })), 1, 'o expect.timeout que nasce acima do padrão do Playwright');
confere(noConfig(config(), config({ esperar: '5_000' })), 0, 'o expect.timeout que nasce no padrão do Playwright');
confere(noConfig(config({ esperar: '10_000' }), config({ esperar: '20_000' })), 1, 'o expect.timeout que sobe');
confere(noConfig(config({ esperar: '10_000' }), config({ esperar: '10_000', timeout: '30_000' })), 0, 'o expect.timeout que fica');
confere(noConfig(config({ esperar: '10_000' }), config({ retries: 'process.env.CI ? 1 : 0' })), 0, 'o expect.timeout que sai do config');
confere(REGRA.verificar(CONFIG, config({ retries: '9' }), repositorioDeTestes({}), null), 0, 'sem base de comparação o config não é acusado');
confere(REGRA.verificar(CONFIG, fs.readFileSync(path.resolve(__dirname, '..', '..', CONFIG), 'utf8'), path.resolve(__dirname, '..', '..'), 'HEAD'), 0,
  'o playwright.config.js de hoje passa contra o HEAD');

const SEM_PRAZO = "test('a', async () => {\n  await expect(x).toBeVisible();\n});\n";
confere(noSpec(SEM_PRAZO, SEM_PRAZO), 0, 'um spec sem prazo passa');
confere(noSpec(SEM_PRAZO, `test.setTimeout(90_000);\n${SEM_PRAZO}`), 1, 'um test.setTimeout novo é uma ocorrência');
confere(noSpec(SEM_PRAZO, `test.slow();\n${SEM_PRAZO}`), 1, 'um test.slow() novo é uma ocorrência');
confere(noSpec(SEM_PRAZO, `test.info().setTimeout(90_000);\n${SEM_PRAZO}`), 1, 'o setTimeout do testInfo é uma ocorrência');
confere(noSpec(SEM_PRAZO, SEM_PRAZO.replace('toBeVisible()', 'toBeVisible({ timeout: 20_000 })')), 1, 'um { timeout: N } novo é uma ocorrência');
confere(noSpec(SEM_PRAZO, `// test.setTimeout(90_000);\n/* test.slow(); { timeout: 1 } */\n${SEM_PRAZO}`), 0, 'comentário não conta');
confere(noSpec(SEM_PRAZO, `${SEM_PRAZO}const espera = () => new Promise(ok => setTimeout(ok, 100));\nfakes.anki.concluirEnvio(id, { erro: 'anki_timeout' });\n`), 0,
  'o setTimeout de um temporizador e o anki_timeout não são prazo de teste');

const COM_PRAZO = "await expect(x).toBeVisible({ timeout: 5_000 });\nawait expect(y).toBeVisible({ timeout: 15_000 });\n";
const DE_HOJE = confere(noSpec(COM_PRAZO, COM_PRAZO), 2, 'os prazos de hoje são ocorrências, e não subiram');
assert.deepStrictEqual(DE_HOJE.map(achado => achado.linha), [1, 2]);
total++;
const SUBIU = confere(noSpec(COM_PRAZO, COM_PRAZO.replace('5_000', '20_000')), 3, 'um timeout que cresce vira uma ocorrência a mais');
assert.ok(SUBIU.some(achado => /subiu/.test(achado.detalhe) && achado.linha === 1), 'o achado diz que o prazo subiu, na linha dele');
total++;
confere(noSpec(COM_PRAZO, COM_PRAZO.replace('15_000', '1_000')), 2, 'um timeout que desce não é acusado além da ocorrência');
confere(noSpec(COM_PRAZO, COM_PRAZO.replace('5_000', 'prazoLongo')), 3, 'trocar o número por um nome que ninguém vê é subir');
confere(noSpec(COM_PRAZO, COM_PRAZO.replace('15_000', '5_000').replace('5_000', '15_000')), 2, 'os mesmos prazos em outra ordem não sobem');
confere(noSpec(COM_PRAZO, `${COM_PRAZO}await expect(z).toBeVisible({ timeout: 1_000 });\n`), 3, 'um timeout novo e curto é uma ocorrência a mais');
confere(noSpec('await esperar({ timeout: ateTresSegundos(t, 1000) });\n', 'await esperar({ timeout: ateTresSegundos(t, 1000) });\n'), 1,
  'um prazo calculado que fica igual não é acusado além da ocorrência');
confere(REGRA.verificar(SPEC, COM_PRAZO, repositorioDeTestes({}), null), 2, 'sem base de comparação só contam as ocorrências');

for (const arquivo of [CONFIG, SPEC, 'e2e/estado-final.js', 'e2e/loja/playwright.config.js']) {
  assert.strictEqual(REGRA.seAplica(arquivo), true, `${arquivo} está no escopo`);
  total++;
}
for (const arquivo of ['popup/popup.js', 'testes/test_x.js', 'e2e/aprovados-visuais/a.json', 'scripts/testar.mjs']) {
  assert.strictEqual(REGRA.seAplica(arquivo), false, `${arquivo} está fora do escopo`);
  total++;
}

function montarRepositorio() {
  const pasta = repositorioDeTestes({
    'scripts/regras/linha-de-base.json': `${JSON.stringify({ 'e2e-prazo-maior': { [APOIO]: 1 } }, null, 2)}\n`,
    [CONFIG]: config(),
    [APOIO]: "await expect(x).toBeVisible({ timeout: 5_000 });\n",
  });
  git(pasta, 'checkout', '-q', '-b', 'main');
  git(pasta, 'add', '-A');
  git(pasta, 'commit', '-q', '-m', 'main');
  git(pasta, 'checkout', '-q', '-b', 'mudanca');
  return pasta;
}

const pasta = montarRepositorio();
const verificar = () => spawnSync('node', [path.join(__dirname, 'verificar.js'), '--raiz', pasta, '--base', 'main'], { encoding: 'utf8' });
const escrever = (arquivo, texto) => fs.writeFileSync(path.join(pasta, arquivo), texto);
const doRepositorio = arquivo => fs.readFileSync(path.join(pasta, arquivo), 'utf8');
const acusada = resultado => /✗ e2e-prazo-maior/.test(resultado.stdout);

let r = verificar();
assert.ok(!acusada(r), `a base passa:\n${r.stdout}`);
escrever(APOIO, `test.setTimeout(90_000);\n${doRepositorio(APOIO)}`);
r = verificar();
assert.ok(acusada(r), `um test.setTimeout novo falha:\n${r.stdout}`);
assert.match(r.stdout, /e2e\/apoio-a\.js/);
assert.match(r.stdout, /relogioParado/, 'a mensagem diz o conserto');
escrever(APOIO, doRepositorio(APOIO).replace('test.setTimeout(90_000);\n', '').replace('5_000', '20_000'));
r = verificar();
assert.ok(acusada(r), `um timeout que cresce falha:\n${r.stdout}`);
assert.match(r.stdout, /subiu/);
escrever(APOIO, doRepositorio(APOIO).replace('20_000', '5_000'));
r = verificar();
assert.ok(!acusada(r), `desfeito, volta a passar:\n${r.stdout}`);
escrever(CONFIG, doRepositorio(CONFIG).replace('process.env.CI ? 1 : 0', 'process.env.CI ? 2 : 0'));
r = verificar();
assert.ok(acusada(r), `um retries que sobe falha:\n${r.stdout}`);
assert.match(r.stdout, /retries subiu/);
fs.rmSync(pasta, { recursive: true, force: true });
total += 10;

console.log(`e2e-prazo-maior: ${total} provas passaram`);

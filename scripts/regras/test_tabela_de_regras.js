'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { REGRAS } = require('./verificar');
const { regrasSemGuarda, linhasDaAjuda, FORA_DAS_REGRAS } = require('./apoio-da-tabela-de-regras');

const RAIZ = path.resolve(__dirname, '..', '..');
const FERRAMENTAS_DA_PASTA = ['baixar-no-merge'];

let total = 0;
const prova = (achadas, esperadas, porque) => { assert.deepStrictEqual(achadas, esperadas, porque); total++; };

prova(regrasSemGuarda([{ id: 'a', guarda: 'guarda uma coisa' }, { id: 'b' }, { id: 'c', guarda: '   ' }, { id: 'd', guarda: 7 }, { id: 'e', guarda: 'duas\nlinhas' }]),
  ['b', 'c', 'd', 'e'], 'a regra sem guarda, com guarda vazia, que não é texto ou de mais de uma linha é apontada');
prova(regrasSemGuarda([{ id: 'a', guarda: 'guarda uma coisa' }]), [], 'a regra com guarda de uma linha passa');
prova(linhasDaAjuda([{ id: 'regra-um', guarda: 'guarda um' }, { id: 'regra-dois-mais-longa', guarda: 'guarda dois' }]),
  ['  regra-um               guarda um', '  regra-dois-mais-longa  guarda dois'], 'cada regra sai numa linha, com as guardas alinhadas');

prova(regrasSemGuarda(REGRAS), [], 'toda regra de REGRAS diz o que guarda');

const ajuda = spawnSync('node', [path.join(__dirname, 'verificar.js'), '--help'], { encoding: 'utf8' });
assert.strictEqual(ajuda.status, 0, ajuda.stdout + ajuda.stderr);
total++;
const linhasDaSaida = ajuda.stdout.split('\n');
for (const regra of REGRAS) {
  const linha = linhasDaSaida.find(texto => texto.trim().startsWith(`${regra.id} `));
  assert.ok(linha, `o --help não lista a regra ${regra.id}`);
  assert.ok(linha.endsWith(regra.guarda), `o --help não diz o que ${regra.id} guarda`);
  total += 2;
}
for (const check of FORA_DAS_REGRAS) {
  assert.ok(ajuda.stdout.includes(check.quem), `o --help não cita o check de fora ${check.quem}`);
  total++;
}
for (const quem of ['catalogo-da-voz.spec.js', 'texto-literal.spec.js', 'Registro da PR', 'test_empacotar.js', 'test_contrato_fechado.js',
  'lint-do-que-mudou.js', 'auditoria-de-dependencias.js', 'linha-de-base-refeita.js']) {
  assert.ok(FORA_DAS_REGRAS.some(check => check.quem.includes(quem)), `falta o check de fora ${quem}`);
  total++;
}

for (const prova of ['test_regras.js', 'test_texto_fora_da_voz.js', 'test_e2e_prazo_maior.js']) {
  assert.ok(ajuda.stdout.includes(prova), `o --help não aponta para ${prova}`);
  assert.ok(fs.existsSync(path.join(__dirname, prova)), `${prova} não existe`);
  total += 2;
}

const agentes = fs.readFileSync(path.join(RAIZ, 'AGENTS.md'), 'utf8');
assert.ok(!/^\| What it guards/m.test(agentes) && !agentes.includes('Rules and what enforces them'), 'o AGENTS.md não tem mais a tabela de regras');
assert.match(agentes, /node scripts\/regras\/verificar\.js --help/, 'o AGENTS.md aponta para o --help');
total += 2;

const ids = REGRAS.map(regra => regra.id);
const arquivosDeRegra = fs.readdirSync(__dirname).filter(arquivo => !arquivo.startsWith('apoio-') && /^[a-z0-9]+(-[a-z0-9]+)+\.js$/.test(arquivo)).map(arquivo => arquivo.slice(0, -3)).filter(arquivo => !FERRAMENTAS_DA_PASTA.includes(arquivo)).sort();
prova(arquivosDeRegra, [...ids].sort(), 'cada arquivo de regra de scripts/regras/ (fora as ferramentas da pasta) está em REGRAS e cada regra de REGRAS tem o seu arquivo');

console.log(`test_tabela_de_regras: ${total} provas ok`);

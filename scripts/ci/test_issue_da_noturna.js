'use strict';

// A issue única da suíte noturna (scripts/ci/issue-da-noturna.js), com um `gh` de mentira no PATH que guarda cada chamada:
// vermelha abre uma issue ou comenta na aberta, verde comenta e fecha, cancelada não faz nada, e uma falha do `gh` reprova o passo.

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { decidir } = require('./issue-da-noturna.js');

const script = path.join(__dirname, 'issue-da-noturna.js');
const URL_DA_EXECUCAO = 'https://github.com/dono/repo/actions/runs/42';

assert.strictEqual(decidir(['success', 'success']), 'verde');
assert.strictEqual(decidir(['success', 'failure']), 'vermelha');
assert.strictEqual(decidir(['failure', 'failure']), 'vermelha');
assert.strictEqual(decidir(['cancelled', 'failure']), 'vermelha', 'uma fatia cancelada não esconde a que falhou');
assert.strictEqual(decidir(['success', 'cancelled']), 'vermelha', 'um job cortado pelo teto de tempo termina cancelled: é uma travada, não um nada');
assert.strictEqual(decidir(['cancelled', 'cancelled']), 'vermelha');
assert.strictEqual(decidir(['skipped', 'success']), 'nada');
assert.strictEqual(decidir(['success', '']), 'nada', 'resultado ausente');
assert.strictEqual(decidir([]), 'nada');

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-noturna-'));
const bin = path.join(pasta, 'bin');
const chamadas = path.join(pasta, 'chamadas.jsonl');
const abertas = path.join(pasta, 'abertas');
fs.mkdirSync(bin);
// O `gh` de mentira: `issue list` responde com o conteúdo de `abertas` (um número por linha, a mais nova primeiro); `GH_FALHA` o derruba.
fs.writeFileSync(path.join(bin, 'gh'), `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(chamadas)}, JSON.stringify(args) + '\\n');
if (process.env.GH_FALHA) { console.error('gh: falhou de propósito'); process.exit(1); }
if (args[0] === 'issue' && args[1] === 'list') {
  const numeros = fs.existsSync(${JSON.stringify(abertas)}) ? fs.readFileSync(${JSON.stringify(abertas)}, 'utf8').split('\\n').filter(Boolean) : [];
  console.log(JSON.stringify(numeros.map(numero => ({ number: Number(numero) }))));
}
`, { mode: 0o755 });

function rodar({ fatias, conexaoReal, aberta, falha }) {
  fs.rmSync(chamadas, { force: true });
  fs.rmSync(abertas, { force: true });
  if (aberta) fs.writeFileSync(abertas, `${aberta}\n`);
  const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` };
  delete env.GH_FALHA;
  if (falha) env.GH_FALHA = '1';
  const r = spawnSync('node', [script, URL_DA_EXECUCAO, fatias, conexaoReal], { env, encoding: 'utf8' });
  const todas = fs.existsSync(chamadas) ? fs.readFileSync(chamadas, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
  // Só o que escreve: o que lista ou prepara o rótulo não conta como mudança de issue.
  const escritas = todas.filter(a => ['create', 'comment', 'close'].includes(a[1]) && a[0] === 'issue');
  return { status: r.status, saida: r.stdout + r.stderr, todas, escritas };
}
const valor = (args, opcao) => args[args.indexOf(opcao) + 1];

// Vermelha sem issue aberta: abre uma, com o rótulo e o endereço da execução.
{
  const r = rodar({ fatias: 'failure', conexaoReal: 'success' });
  assert.strictEqual(r.status, 0, r.saida);
  assert.strictEqual(r.escritas.length, 1, 'uma só issue');
  assert.strictEqual(r.escritas[0][1], 'create');
  assert.strictEqual(valor(r.escritas[0], '--label'), 'noturna');
  assert(/vermelha/i.test(valor(r.escritas[0], '--title')), 'o título diz que a noturna está vermelha');
  assert(valor(r.escritas[0], '--body').includes(URL_DA_EXECUCAO) && valor(r.escritas[0], '--body').includes('as fatias da e2e: failure'), 'o corpo traz a execução e o que falhou');
  assert(r.todas.some(a => a[0] === 'label' && a[1] === 'create' && a.includes('noturna')), 'o rótulo é garantido antes');
}

// Vermelha com issue aberta: comenta nela, não abre outra (uma issue só, qualquer que seja a noite).
{
  const r = rodar({ fatias: 'success', conexaoReal: 'failure', aberta: 7 });
  assert.strictEqual(r.status, 0, r.saida);
  assert.deepStrictEqual(r.escritas.map(a => [a[1], a[2]]), [['comment', '7']], 'só um comentário na aberta');
  assert(valor(r.escritas[0], '--body').includes(URL_DA_EXECUCAO) && valor(r.escritas[0], '--body').includes('Conexão real: failure'));
}

// Verde com issue aberta: comenta e fecha. Verde sem issue: não escreve nada.
{
  const r = rodar({ fatias: 'success', conexaoReal: 'success', aberta: 7 });
  assert.strictEqual(r.status, 0, r.saida);
  assert.deepStrictEqual(r.escritas.map(a => [a[1], a[2]]), [['comment', '7'], ['close', '7']], 'comenta e fecha');
  assert.deepStrictEqual(rodar({ fatias: 'success', conexaoReal: 'success' }).escritas, [], 'verde sem issue');
}

// Cancelada (o teto de tempo corta o job e ele termina cancelled): é vermelha, abre a issue ou comenta na aberta.
{
  const r = rodar({ fatias: 'cancelled', conexaoReal: 'success' });
  assert.strictEqual(r.status, 0, r.saida);
  assert.deepStrictEqual(r.escritas.map(a => a[1]), ['create'], 'uma noite que travou abre a issue');
  assert(valor(r.escritas[0], '--body').includes('as fatias da e2e: cancelled'));
  const comAberta = rodar({ fatias: 'success', conexaoReal: 'cancelled', aberta: 7 });
  assert.deepStrictEqual(comAberta.escritas.map(a => [a[1], a[2]]), [['comment', '7']]);
}

// Pulada ou sem resultado: nem lista as issues. (O cancelamento manual da execução nem chega aqui: o job tem `!cancelled()`.)
{
  const r = rodar({ fatias: 'skipped', conexaoReal: 'success', aberta: 7 });
  assert.strictEqual(r.status, 0, r.saida);
  assert.deepStrictEqual(r.todas, [], 'não chama o gh');
}

// Se o gh falha, o passo reprova (a noturna vermelha sem aviso é o pior caso).
{
  const r = rodar({ fatias: 'failure', conexaoReal: 'success', falha: true });
  assert.notStrictEqual(r.status, 0, 'o passo reprova');
  assert(/gh/.test(r.saida), 'a mensagem fala do gh');
}

fs.rmSync(pasta, { recursive: true, force: true });
console.log('issue da noturna ok');

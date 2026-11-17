'use strict';

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

function rodar({ fatias, conexaoReal, complemento = 'success', aberta, falha }) {
  fs.rmSync(chamadas, { force: true });
  fs.rmSync(abertas, { force: true });
  if (aberta) fs.writeFileSync(abertas, `${aberta}\n`);
  const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` };
  delete env.GH_FALHA;
  if (falha) env.GH_FALHA = '1';
  const r = spawnSync('node', [script, URL_DA_EXECUCAO, fatias, conexaoReal, complemento], { env, encoding: 'utf8' });
  const todas = fs.existsSync(chamadas) ? fs.readFileSync(chamadas, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
  const escritas = todas.filter(a => ['create', 'comment', 'close'].includes(a[1]) && a[0] === 'issue');
  return { status: r.status, saida: r.stdout + r.stderr, todas, escritas };
}
const valor = (args, opcao) => args[args.indexOf(opcao) + 1];

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

{
  const r = rodar({ fatias: 'success', conexaoReal: 'failure', aberta: 7 });
  assert.strictEqual(r.status, 0, r.saida);
  assert.deepStrictEqual(r.escritas.map(a => [a[1], a[2]]), [['comment', '7']], 'só um comentário na aberta');
  assert(valor(r.escritas[0], '--body').includes(URL_DA_EXECUCAO) && valor(r.escritas[0], '--body').includes('Conexão real: failure'));
}

{
  const r = rodar({ fatias: 'success', conexaoReal: 'success', aberta: 7 });
  assert.strictEqual(r.status, 0, r.saida);
  assert.deepStrictEqual(r.escritas.map(a => [a[1], a[2]]), [['comment', '7'], ['close', '7']], 'comenta e fecha');
  assert.deepStrictEqual(rodar({ fatias: 'success', conexaoReal: 'success' }).escritas, [], 'verde sem issue');
}

{
  const r = rodar({ fatias: 'cancelled', conexaoReal: 'success' });
  assert.strictEqual(r.status, 0, r.saida);
  assert.deepStrictEqual(r.escritas.map(a => a[1]), ['create'], 'uma noite que travou abre a issue');
  assert(valor(r.escritas[0], '--body').includes('as fatias da e2e: cancelled'));
  const comAberta = rodar({ fatias: 'success', conexaoReal: 'cancelled', aberta: 7 });
  assert.deepStrictEqual(comAberta.escritas.map(a => [a[1], a[2]]), [['comment', '7']]);
}

{
  const r = rodar({ fatias: 'skipped', conexaoReal: 'success', aberta: 7 });
  assert.strictEqual(r.status, 0, r.saida);
  assert.deepStrictEqual(r.todas, [], 'não chama o gh');
}

{
  const r = rodar({ fatias: 'failure', conexaoReal: 'success', falha: true });
  assert.notStrictEqual(r.status, 0, 'o passo reprova');
  assert(/gh/.test(r.saida), 'a mensagem fala do gh');
}

{
  const r = rodar({ fatias: 'success', conexaoReal: 'success', complemento: 'failure' });
  assert.strictEqual(r.status, 0, r.saida);
  assert.deepStrictEqual(r.escritas.map(a => a[1]), ['create'], 'o complemento vermelho (teste ou teto de tempo) abre a issue');
  assert(valor(r.escritas[0], '--body').includes('complemento (Python 3.9 e 3.13): failure'));
  assert(valor(r.escritas[0], '--body').includes('Teto de tempo'), 'o corpo diz como reconhecer o teto de tempo');
  assert.deepStrictEqual(rodar({ fatias: 'success', conexaoReal: 'success', complemento: 'cancelled' }).escritas.map(a => a[1]), ['create']);
  assert.deepStrictEqual(rodar({ fatias: 'success', conexaoReal: 'success', complemento: 'skipped', aberta: 7 }).todas, [], 'complemento pulado não fecha a issue');
  const fechando = rodar({ fatias: 'success', conexaoReal: 'success', complemento: 'success', aberta: 7 });
  assert.deepStrictEqual(fechando.escritas.map(a => [a[1], a[2]]), [['comment', '7'], ['close', '7']], 'verde nos três fecha');
  assert.strictEqual(spawnSync('node', [script, URL_DA_EXECUCAO, 'success', 'success'], { encoding: 'utf8' }).status, 2, 'faltando o resultado do complemento é erro de uso');
}

{
  const fluxo = fs.readFileSync(path.join(__dirname, '..', '..', '.github', 'workflows', 'noturna.yml'), 'utf8');
  assert(/run: xvfb-run --auto-servernum node scripts\/testar\.mjs e2e -- --workers=1 \$\(node scripts\/ci\/fatias-e2e\.js \$\{\{ matrix\.fatia \}\}\)\n\s+env:\n\s+PM_TETO_S: '420'/.test(fluxo), 'cada fatia da e2e tem o teto de 7 minutos, nas fatias balanceadas do PR');
  assert(!/--shard/.test(fluxo), 'um teto por fatia só diz algo se as fatias forem as balanceadas');
  assert(/run: node scripts\/testar\.mjs complemento\n\s+env:\n\s+PM_TETO_S: '360'/.test(fluxo), 'o complemento tem o teto de 6 minutos');
  assert(/needs: \[e2e, e2e-conexao-real, complemento\]/.test(fluxo) && /COMPLEMENTO: \$\{\{ needs\.complemento\.result \}\}/.test(fluxo), 'a issue lê o resultado do complemento');
}

fs.rmSync(pasta, { recursive: true, force: true });
console.log('issue da noturna ok');

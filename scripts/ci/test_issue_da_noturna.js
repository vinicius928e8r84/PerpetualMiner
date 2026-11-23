'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { decidir } = require('./issue-da-noturna.js');
const { lerYaml } = require('../yaml-de-workflow.js');

const script = path.join(__dirname, 'issue-da-noturna.js');
const URL_DA_EXECUCAO = 'https://github.com/dono/repo/actions/runs/42';

function decisaoPorResultados() {
  assert.strictEqual(decidir(['success', 'success']), 'verde');
  assert.strictEqual(decidir(['success', 'failure']), 'vermelha');
  assert.strictEqual(decidir(['failure', 'failure']), 'vermelha');
  assert.strictEqual(decidir(['cancelled', 'failure']), 'vermelha', 'uma fatia cancelada não esconde a que falhou');
  assert.strictEqual(decidir(['success', 'cancelled']), 'vermelha', 'um job cortado pelo teto de tempo termina cancelled: é uma travada, não um nada');
  assert.strictEqual(decidir(['cancelled', 'cancelled']), 'vermelha');
  assert.strictEqual(decidir(['skipped', 'success']), 'nada');
  assert.strictEqual(decidir(['success', '']), 'nada', 'resultado ausente');
  assert.strictEqual(decidir([]), 'nada');
}

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

function abreAIssueQuandoUmaFatiaFalha() {
  const r = rodar({ fatias: 'failure', conexaoReal: 'success' });
  assert.strictEqual(r.status, 0, r.saida);
  assert.strictEqual(r.escritas.length, 1, 'uma só issue');
  assert.strictEqual(r.escritas[0][1], 'create');
  assert.strictEqual(valor(r.escritas[0], '--label'), 'noturna');
  assert(/vermelha/i.test(valor(r.escritas[0], '--title')), 'o título diz que a noturna está vermelha');
  assert(valor(r.escritas[0], '--body').includes(URL_DA_EXECUCAO) && valor(r.escritas[0], '--body').includes('as fatias da e2e: failure'), 'o corpo traz a execução e o que falhou');
  assert(r.todas.some(a => a[0] === 'label' && a[1] === 'create' && a.includes('noturna')), 'o rótulo é garantido antes');
}

function comentaNaIssueAbertaQuandoAConexaoRealFalha() {
  const r = rodar({ fatias: 'success', conexaoReal: 'failure', aberta: 7 });
  assert.strictEqual(r.status, 0, r.saida);
  assert.deepStrictEqual(r.escritas.map(a => [a[1], a[2]]), [['comment', '7']], 'só um comentário na aberta');
  assert(valor(r.escritas[0], '--body').includes(URL_DA_EXECUCAO) && valor(r.escritas[0], '--body').includes('Conexão real: failure'));
}

function comentaEFechaAIssueQuandoTudoFicaVerde() {
  const r = rodar({ fatias: 'success', conexaoReal: 'success', aberta: 7 });
  assert.strictEqual(r.status, 0, r.saida);
  assert.deepStrictEqual(r.escritas.map(a => [a[1], a[2]]), [['comment', '7'], ['close', '7']], 'comenta e fecha');
  assert.deepStrictEqual(rodar({ fatias: 'success', conexaoReal: 'success' }).escritas, [], 'verde sem issue');
}

function abreAIssueQuandoANoiteTravou() {
  const r = rodar({ fatias: 'cancelled', conexaoReal: 'success' });
  assert.strictEqual(r.status, 0, r.saida);
  assert.deepStrictEqual(r.escritas.map(a => a[1]), ['create'], 'uma noite que travou abre a issue');
  assert(valor(r.escritas[0], '--body').includes('as fatias da e2e: cancelled'));
  const comAberta = rodar({ fatias: 'success', conexaoReal: 'cancelled', aberta: 7 });
  assert.deepStrictEqual(comAberta.escritas.map(a => [a[1], a[2]]), [['comment', '7']]);
}

function naoChamaOGhQuandoAFatiaFoiPulada() {
  const r = rodar({ fatias: 'skipped', conexaoReal: 'success', aberta: 7 });
  assert.strictEqual(r.status, 0, r.saida);
  assert.deepStrictEqual(r.todas, [], 'não chama o gh');
}

function reprovaOPassoQuandoOGhFalha() {
  const r = rodar({ fatias: 'failure', conexaoReal: 'success', falha: true });
  assert.notStrictEqual(r.status, 0, 'o passo reprova');
  assert(/gh/.test(r.saida), 'a mensagem fala do gh');
}

function abreAIssueQuandoOComplementoFalha() {
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

function corpoDaIssueNaoFalaSoDaNoite() {
  const r = rodar({ fatias: 'failure', conexaoReal: 'success' });
  const corpo = valor(r.escritas[0], '--body');
  assert(!/esta noite/i.test(corpo), 'a suíte também roda a cada push na main: o corpo não fala só de noite');
  assert(/primeira execução verde/.test(corpo), 'a issue fecha na primeira execução verde, de qualquer gatilho');
}

const fluxo = fs.readFileSync(path.join(__dirname, '..', '..', '.github', 'workflows', 'noturna.yml'), 'utf8');
const yaml = lerYaml(fluxo);
const passoDe = (job, texto) => yaml.jobs[job].steps.find(passo => passo.run === texto);
const ehTesteDaE2e = passo => /testar\.mjs e2e/.test(passo.run || '');

const SPECS_DA_CONEXAO_REAL = [
  ['painel-envio-apagar', 'o Apagar tudo chega à fila real'],
  ['painel-minerar-frases-menu', 'o menu e o modal saíram de painel-minerar-frases e rodam junto dele'],
  ['painel-anki-continuar', 'a fila do contrato semeada na real'],
  ['painel-envio-perfil', 'os perfis do Anki na real'],
  ['configuracoes-ia-copia-em-voo', 'a chave guardada só na Conexão real'],
  ['configuracoes-chatgpt-plano', 'o login do ChatGPT na Conexão real'],
  ...['painel-envio-parado', 'painel-envio-plano', 'painel-envio-copia', 'painel-envio-visual'].map(spec => [spec, 'o Envio anda pela fila real']),
  ...['painel-conserto', 'painel-envio-retido', 'painel-envio-anki-fechado'].map(spec => [spec, 'o Envio criado fica na Conexão real']),
  ...['boas-vindas-nivel', 'painel-envio-desconhecido'].map(spec => [spec, 'o perfil e a leitura vêm da Conexão real']),
  ...['overlay-marca', 'overlay-visual', 'seam', 'sincronizacao'].map(spec => [spec, 'o vocabulário vem da Conexão real']),
];

function fatiasDaE2eTemTetoDeSeteMinutos() {
  const e2e = passoDe('e2e', 'xvfb-run --auto-servernum node scripts/testar.mjs e2e -- --workers=1 $(node scripts/ci/fatias-e2e.js ${{ matrix.fatia }})');
  assert(e2e, 'cada fatia da e2e roda nas fatias balanceadas do PR');
  assert.strictEqual(String(e2e.env.PM_TETO_S), '420', 'cada fatia da e2e tem o teto de 7 minutos');
  assert(!/--shard/.test(fluxo), 'um teto por fatia só diz algo se as fatias forem as balanceadas');
}

function complementoTemTetoDeSeisMinutos() {
  const complemento = passoDe('complemento', 'node scripts/testar.mjs complemento');
  assert(complemento, 'a noturna roda o grupo complemento');
  assert.strictEqual(String(complemento.env.PM_TETO_S), '360', 'o complemento tem o teto de 6 minutos');
  assert.strictEqual(String(complemento.env.PM_VERSAO_NO_LANCAMENTO), '1', 'a versão fica para o lançamento, como no push: a main atrasada de versão não deixa a noturna vermelha');
}

function conexaoRealRodaAsSpecsDeFalhasEPedidos() {
  const real = yaml.jobs['e2e-conexao-real'].steps.find(ehTesteDaE2e);
  assert.strictEqual(real.env.PM_CONEXAO, 'real', 'a e2e com a Conexão real roda no modo real');
  const specs = real.run.match(/tests\/[\w-]+\.spec\.js/g) || [];
  assert.strictEqual(specs.length, 41, 'a noturna roda contra a Conexão real as specs de falhas e pedidos, as do vocabulário, as do perfil e as do Envio (C6)');
  for (const [spec, motivo] of SPECS_DA_CONEXAO_REAL) assert(specs.includes(`tests/${spec}.spec.js`), `${spec}: ${motivo}`);
  for (const spec of specs) assert(fs.existsSync(path.join(__dirname, '..', '..', 'e2e', spec)), `${spec} existe: um nome errado não roda nada`);
}

function issueEsperaOsTresJobsELeOComplemento() {
  const avisar = yaml.jobs.avisar;
  assert.deepStrictEqual(String(avisar.needs).replace(/[[\]\s]/g, '').split(','), ['e2e', 'e2e-conexao-real', 'complemento'], 'a issue espera o complemento');
  assert.strictEqual(avisar.steps.find(passo => /issue-da-noturna/.test(passo.run || '')).env.COMPLEMENTO, '${{ needs.complemento.result }}', 'a issue lê o resultado do complemento');
}

function suiteRodaNoPushSemCancelarACron() {
  assert(/^on:[\s\S]*?^ {2}push:\n {4}branches: \[main\]$/m.test(fluxo), 'a suíte inteira roda no push para a main');
  assert(/^ {2}group: noturna-\$\{\{ github\.event_name \}\}-\$\{\{ github\.ref \}\}$/m.test(fluxo), 'o grupo separa o push do cron: um push não cancela a noturna agendada');
  assert(/^ {2}cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \|\| github\.event_name == 'push' \}\}$/m.test(fluxo), 'só a execução mais nova do push segue');
}


decisaoPorResultados();
abreAIssueQuandoUmaFatiaFalha();
comentaNaIssueAbertaQuandoAConexaoRealFalha();
comentaEFechaAIssueQuandoTudoFicaVerde();
abreAIssueQuandoANoiteTravou();
naoChamaOGhQuandoAFatiaFoiPulada();
reprovaOPassoQuandoOGhFalha();
abreAIssueQuandoOComplementoFalha();
corpoDaIssueNaoFalaSoDaNoite();
fatiasDaE2eTemTetoDeSeteMinutos();
complementoTemTetoDeSeisMinutos();
conexaoRealRodaAsSpecsDeFalhasEPedidos();
issueEsperaOsTresJobsELeOComplemento();
suiteRodaNoPushSemCancelarACron();

fs.rmSync(pasta, { recursive: true, force: true });
console.log('issue da noturna ok');

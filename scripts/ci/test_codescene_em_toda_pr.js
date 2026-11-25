'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { NOME_DO_CHECK, APP_DA_NUVEM, PRIMEIRA_PR_COBRADA, cobranca, liberacaoDoDono, situacaoDoCheck, conferir } = require('./codescene-em-toda-pr');
const { lerYaml } = require('../yaml-de-workflow.js');

const RAIZ = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(__dirname, 'codescene-em-toda-pr.js');
const HEAD = 'a'.repeat(40);

let total = 0;
const prova = (achado, esperado, porque) => { assert.deepStrictEqual(achado, esperado, porque); total++; };

const pr = (numero, corpo = '') => ({ numero, corpo, head: HEAD });
const LIBERACAO = `Liberação do dono (CodeScene): ${HEAD.slice(0, 7)} — o CodeScene está fora do ar`;
const check = (id, status, conclusion = null) => ({ id, name: NOME_DO_CHECK, status, conclusion, app: APP_DA_NUVEM });
const LOCAL = (id, status, conclusion = null) => ({ ...check(id, status, conclusion), app: 'codescene-perpetualminer-vinicius' });

prova(PRIMEIRA_PR_COBRADA, 639, 'o corte continua na #639: as PRs anteriores seguem isentas');
prova(cobranca(pr(638)).cobra, false, 'a PR anterior à #639 fica isenta');
prova(cobranca(pr(639)).cobra, true, 'a #639, sem nada de refatoração, é cobrada');
prova(cobranca(pr(757)).cobra, true, 'a PR comum depois do corte é cobrada, com título e rótulo quaisquer');
prova([cobranca(pr(757, `Texto da PR\n\n${LIBERACAO}\n`)).cobra, /liberação do dono/.test(cobranca(pr(757, LIBERACAO)).motivo)], [false, true], 'a liberação do dono para o head desta PR a isenta, dizendo por quê');

prova(liberacaoDoDono(LIBERACAO, HEAD), true, 'a linha com o head abreviado libera');
prova(liberacaoDoDono(`liberação do dono (codescene): ${HEAD}`, HEAD), true, 'o head inteiro, sem maiúsculas, também');
prova(liberacaoDoDono('', HEAD), false, 'sem a linha não há liberação');
prova(liberacaoDoDono(`Liberação do dono (CodeScene): ${'b'.repeat(7)}`, HEAD), false, 'a liberação de outro head não vale: um push novo a perde');
prova(liberacaoDoDono('Liberação do dono (CodeScene): aaaaaa', HEAD), false, 'seis dígitos não bastam para dizer qual head');
prova(liberacaoDoDono(`Liberação do dono (CodeScene): ${HEAD.slice(0, 7)}`, HEAD), true, 'o head abreviado sem motivo vale');
prova(liberacaoDoDono(`Veja a Liberação do dono (CodeScene): ${HEAD.slice(0, 7)}`, HEAD), false, 'a linha tem de começar pela liberação, não citá-la no meio de uma frase');
prova(liberacaoDoDono(`Liberação do dono (CodeScene): ${HEAD.slice(0, 7)}`, 'c'.repeat(40)), false, 'outro head, mesmo com o corpo igual');

prova(situacaoDoCheck([]), { estado: 'ausente' }, 'sem o check no head: ausente');
prova(situacaoDoCheck([{ ...check(1, 'completed', 'success'), name: 'Regras de revisão' }]), { estado: 'ausente' }, 'outro check não conta');
prova(situacaoDoCheck([check(1, 'in_progress')]), { estado: 'rodando' }, 'o check que ainda roda');
prova(situacaoDoCheck([check(1, 'completed', 'success')]), { estado: 'passou', conclusao: 'success' }, 'success passa');
for (const conclusao of ['failure', 'neutral', 'cancelled', 'timed_out', 'action_required', 'skipped']) {
  prova(situacaoDoCheck([check(1, 'completed', conclusao)]).estado, 'reprovou', `${conclusao} não é PASS`);
}
prova(situacaoDoCheck([check(1, 'completed', 'success'), check(2, 'completed', 'failure')]).estado, 'reprovou', 'vale a rodada mais nova do check');
prova(situacaoDoCheck([check(2, 'completed', 'success'), check(1, 'completed', 'failure')]).estado, 'passou', 'vale a mais nova, em qualquer ordem');
prova(APP_DA_NUVEM, 'codescene-access', 'o app que conta é o da nuvem');
prova(situacaoDoCheck([LOCAL(1, 'completed', 'success')]), { estado: 'ausente' }, 'só o app local em success: a nuvem não reportou, e o check segue ausente');
prova(situacaoDoCheck([LOCAL(1, 'queued')]), { estado: 'ausente' }, 'o app local pendente sozinho não conta');
prova(situacaoDoCheck([check(1, 'completed', 'success'), LOCAL(2, 'in_progress')]), { estado: 'passou', conclusao: 'success' },
  'o app local pendente não segura a nuvem em success');
prova(situacaoDoCheck([check(1, 'completed', 'success'), LOCAL(2, 'completed', 'failure')]), { estado: 'passou', conclusao: 'success' },
  'o app local reprovado não segura a nuvem em success');
prova(situacaoDoCheck([LOCAL(1, 'completed', 'success'), check(2, 'completed', 'failure')]), { estado: 'reprovou', conclusao: 'failure' },
  'a nuvem reprovada segura, mesmo com o app local em success');
prova(situacaoDoCheck([LOCAL(1, 'completed', 'success'), check(2, 'in_progress')]).estado, 'rodando', 'a nuvem rodando segura, mesmo com o app local em success');
prova(situacaoDoCheck([check(1, 'completed', 'failure'), LOCAL(2, 'completed', 'success'), check(3, 'completed', 'success')]).estado, 'passou',
  'a rodada nova da nuvem substitui a antiga dela');

function portasCom(respostas) {
  const relogio = { agora: 0, lidas: 0, avisos: [] };
  const portas = {
    lerChecks: async sha => {
      assert.strictEqual(sha, HEAD, 'lê os checks do head da PR, não do merge');
      relogio.lidas++;
      return respostas[Math.min(relogio.lidas - 1, respostas.length - 1)];
    },
    dormir: async segundos => { relogio.agora += segundos * 1000; },
    agora: () => relogio.agora,
    avisar: texto => relogio.avisos.push(texto),
  };
  return { portas, relogio };
}

async function provarAEspera() {
  const COMUM = pr(757);

  let { portas, relogio } = portasCom([[check(1, 'completed', 'success')]]);
  let r = await conferir(COMUM, portas, 600);
  prova([r.ok, relogio.lidas], [true, 1], `o check em success passa na primeira leitura: ${r.mensagem}`);

  ({ portas, relogio } = portasCom([[check(1, 'completed', 'failure')]]));
  r = await conferir(COMUM, portas, 600);
  prova([r.ok, /está em failure, não em success/.test(r.mensagem)], [false, true], `o check reprovado reprova o job: ${r.mensagem}`);

  ({ portas, relogio } = portasCom([[], [check(1, 'in_progress')], [check(1, 'completed', 'success')]]));
  r = await conferir(COMUM, portas, 600);
  prova([r.ok, relogio.lidas, relogio.agora, relogio.avisos.length], [true, 3, 40000, 2],
    `o job que roda antes do CodeScene espera ele reportar e terminar: ${r.mensagem}`);

  ({ portas, relogio } = portasCom([[]]));
  r = await conferir(COMUM, portas, 600);
  prova([r.ok, /ainda não reportou em 600 s/.test(r.mensagem), relogio.agora], [false, true, 600000],
    `o check que nunca chega falha no prazo, sem passar em silêncio e sem esperar para sempre: ${r.mensagem}`);

  prova(r.mensagem.includes('Liberação do dono (CodeScene): <head>'), true, `a falha diz como o dono libera a PR: ${r.mensagem}`);

  ({ portas, relogio } = portasCom([[LOCAL(1, 'completed', 'success')]]));
  r = await conferir(COMUM, portas, 600);
  prova([r.ok, /ainda não reportou em 600 s/.test(r.mensagem)], [false, true], `o app local em success não vale pela nuvem ausente: ${r.mensagem}`);

  ({ portas, relogio } = portasCom([[check(1, 'completed', 'success'), LOCAL(2, 'queued')]]));
  r = await conferir(COMUM, portas, 600);
  prova([r.ok, relogio.lidas], [true, 1], `o app local pendente não segura a PR: ${r.mensagem}`);

  ({ portas, relogio } = portasCom([[check(1, 'queued')]]));
  r = await conferir(COMUM, portas, 60);
  prova([r.ok, /ainda não terminou em 60 s/.test(r.mensagem)], [false, true], `o check que não termina também falha no prazo: ${r.mensagem}`);

  ({ portas, relogio } = portasCom([[check(1, 'completed', 'failure')]]));
  r = await conferir(pr(638), portas, 600);
  prova([r.ok, relogio.lidas], [true, 0], 'a PR anterior ao corte nem lê os checks');

  ({ portas, relogio } = portasCom([[check(1, 'completed', 'failure')]]));
  r = await conferir(pr(757, LIBERACAO), portas, 600);
  prova([r.ok, relogio.lidas, /liberação do dono/.test(r.mensagem)], [true, 0, true], `a liberação do dono passa mesmo com o check vermelho: ${r.mensagem}`);

  ({ portas, relogio } = portasCom([[]]));
  r = await conferir(pr(757, LIBERACAO), portas, 600);
  prova([r.ok, relogio.agora], [true, 0], 'com o CodeScene fora do ar, a liberação passa sem esperar os dez minutos');

  ({ portas, relogio } = portasCom([[check(1, 'completed', 'failure')]]));
  r = await conferir(pr(757, `Liberação do dono (CodeScene): ${'b'.repeat(7)}`), portas, 600);
  prova([r.ok, relogio.lidas], [false, 1], 'a liberação de um head antigo não vale para o head de agora');
}

function rodarComGhFalso(saidaDoGh, env = {}) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-codescene-'));
  const gh = path.join(pasta, 'gh');
  fs.writeFileSync(gh, `#!/bin/sh\necho "$@" >> "${pasta}/chamadas"\n${saidaDoGh}\n`);
  fs.chmodSync(gh, 0o755);
  const r = spawnSync('node', [SCRIPT], {
    encoding: 'utf8',
    env: {
      PATH: `${pasta}:${process.env.PATH}`, GH_TOKEN: 'segredo-do-token', GITHUB_REPOSITORY: 'dono/repo', PM_PRAZO_CODESCENE_S: '0',
      PR_NUMERO: '650', PR_CORPO: 'Texto da PR', PR_HEAD: HEAD, ...env,
    },
  });
  const chamadas = fs.existsSync(path.join(pasta, 'chamadas')) ? fs.readFileSync(path.join(pasta, 'chamadas'), 'utf8') : '';
  fs.rmSync(pasta, { recursive: true, force: true });
  return { status: r.status, saida: r.stdout + r.stderr, chamadas };
}

function provarOComando() {
  const sucesso = `echo '${JSON.stringify(check(9, 'completed', 'success'))}'`;
  let r = rodarComGhFalso(sucesso);
  prova([r.status, /✓ CodeScene Code Health Review \(main\): success/.test(r.saida)], [0, true], `pelo comando, com o gh: ${r.saida}`);
  prova(r.chamadas.includes(`repos/dono/repo/commits/${HEAD}/check-runs?check_name=CodeScene%20Code%20Health%20Review%20(main)`), true,
    `pergunta ao GitHub pelos checks do head, filtrando pelo nome: ${r.chamadas}`);
  r = rodarComGhFalso(`echo '${JSON.stringify(check(9, 'completed', 'failure'))}'`);
  prova(r.status, 1, `o check reprovado sai com 1: ${r.saida}`);
  r = rodarComGhFalso('echo "HTTP 401: Bad credentials" >&2; exit 1');
  prova([r.status, r.saida.includes('segredo-do-token')], [1, false], `o erro do GitHub reprova e não mostra o token: ${r.saida}`);
  prova(r.chamadas.includes('app: .app.slug'), true, `pede o app de cada rodada: ${r.chamadas}`);
  r = rodarComGhFalso(sucesso, { PR_HEAD: 'curto' });
  prova([r.status, /PR_HEAD não é um SHA inteiro/.test(r.saida), r.chamadas], [1, true, ''], `ambiente errado é erro, não passe: ${r.saida}`);
  r = rodarComGhFalso('exit 1', { PR_NUMERO: '600' });
  prova([r.status, /isenta/.test(r.saida)], [0, true], `a PR anterior à #639 passa sem perguntar: ${r.saida}`);
  r = rodarComGhFalso(sucesso, { PR_TITULO: 'Ajusta o rótulo do botão', PR_NUMERO: '700' });
  prova([r.status, r.chamadas.includes('check-runs')], [0, true], `a PR comum, sem "CodeScene" nem "refatora" no título, também é cobrada: ${r.saida}`);
  r = rodarComGhFalso(`echo '${JSON.stringify(check(9, 'completed', 'failure'))}'`, { PR_NUMERO: '700' });
  prova(r.status, 1, `a PR comum com o check vermelho é barrada: ${r.saida}`);
  r = rodarComGhFalso('exit 1', { PR_NUMERO: '700', PR_CORPO: `Texto\n\n${LIBERACAO}` });
  prova([r.status, /liberação do dono/.test(r.saida), r.chamadas], [0, true, ''], `a liberação do dono, pelo comando, passa sem perguntar ao GitHub: ${r.saida}`);
  r = rodarComGhFalso(sucesso, { PR_NUMERO: '64a' });
  prova([r.status, /PR_NUMERO inválido/.test(r.saida)], [1, true], `número da PR inválido é erro: ${r.saida}`);
}

function provarOWorkflow() {
  const workflow = lerYaml(fs.readFileSync(path.join(RAIZ, '.github', 'workflows', 'regras.yml'), 'utf8'));
  const job = workflow.jobs.regras;
  const passo = job.steps.find(p => p.name === 'CodeScene em toda PR');
  prova(Boolean(passo), true, 'o passo está no job "Regras de revisão": sem ele, a regra não vale');
  prova(job.name, 'Regras de revisão', 'no job obrigatório');
  prova(passo.run, 'node scripts/ci/codescene-em-toda-pr.js', 'roda o script, sem nada da PR no comando');
  prova(/github\.event_name == 'pull_request'/.test(passo.if) && /!cancelled\(\)/.test(passo.if), true, 'em toda PR, mesmo depois de outro passo falhar');
  prova(Object.fromEntries(Object.entries(passo.env)), {
    GH_TOKEN: '${{ github.token }}',
    PR_NUMERO: '${{ github.event.pull_request.number }}',
    PR_CORPO: '${{ github.event.pull_request.body }}',
    PR_HEAD: '${{ github.event.pull_request.head.sha }}',
  }, 'o corpo (onde mora a liberação do dono) vai pelo ambiente, e o head é o da PR');
  prova(passo.if.includes("github.event_name == 'pull_request'") && workflow.on.pull_request.types.includes('edited'), true, 'editar o corpo da PR (a liberação do dono) roda o passo de novo');
  prova(workflow.permissions.checks, 'read', 'o token do job lê os checks');
  prova(job['timeout-minutes'] >= 12, true, 'o job dá tempo para os 10 minutos de espera');
}

provarAEspera().then(() => {
  provarOComando();
  provarOWorkflow();
  console.log(`codescene-em-toda-pr: ${total} provas passaram`);
}, erro => { console.error(erro); process.exit(1); });

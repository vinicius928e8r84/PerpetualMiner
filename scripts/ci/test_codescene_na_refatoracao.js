'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { NOME_DO_CHECK, PRIMEIRA_PR_COBRADA, cobranca, situacaoDoCheck, conferir } = require('./codescene-na-refatoracao');
const { lerYaml } = require('../yaml-de-workflow.js');

const RAIZ = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(__dirname, 'codescene-na-refatoracao.js');
const HEAD = 'a'.repeat(40);

let total = 0;
const prova = (achado, esperado, porque) => { assert.deepStrictEqual(achado, esperado, porque); total++; };

const pr = (numero, titulo, rotulos = []) => ({ numero, titulo, rotulos, head: HEAD });
const check = (id, status, conclusion = null) => ({ id, name: NOME_DO_CHECK, status, conclusion, app: 'codescene-local' });

prova(PRIMEIRA_PR_COBRADA, 639, 'a cobrança começa na PR #639, a primeira de refatoração depois da ordem do dono');
prova(cobranca(pr(638, 'A Fila sai de envio.py (CodeScene, Onda 1)')).cobra, false, 'a PR anterior à #639 fica isenta, mesmo de refatoração');
prova(cobranca(pr(639, 'A Fila sai de envio.py (CodeScene, Onda 1)')).cobra, true, 'a #639 com "CodeScene" no título é cobrada');
prova(cobranca(pr(700, 'Refatoração do painel de envio')).cobra, true, '"refatora" no título também marca a PR de refatoração');
prova(cobranca(pr(700, 'O painel lembra o baralho', ['refatoracao'])).cobra, true, 'o rótulo refatoracao também marca');
prova(cobranca(pr(700, 'O painel lembra o baralho', ['bug'])).cobra, false, 'a PR de produto que não é refatoração não é cobrada');

prova(situacaoDoCheck([]), { estado: 'ausente' }, 'sem o check no head: ausente');
prova(situacaoDoCheck([{ ...check(1, 'completed', 'success'), name: 'Regras de revisão' }]), { estado: 'ausente' }, 'outro check não conta');
prova(situacaoDoCheck([check(1, 'in_progress')]), { estado: 'rodando' }, 'o check que ainda roda');
prova(situacaoDoCheck([check(1, 'completed', 'success')]), { estado: 'passou', conclusao: 'success' }, 'success passa');
for (const conclusao of ['failure', 'neutral', 'cancelled', 'timed_out', 'action_required', 'skipped']) {
  prova(situacaoDoCheck([check(1, 'completed', conclusao)]).estado, 'reprovou', `${conclusao} não é PASS`);
}
prova(situacaoDoCheck([check(1, 'completed', 'success'), check(2, 'completed', 'failure')]).estado, 'reprovou', 'vale a rodada mais nova do check');
prova(situacaoDoCheck([check(2, 'completed', 'success'), check(1, 'completed', 'failure')]).estado, 'passou', 'vale a mais nova, em qualquer ordem');
const DA_NUVEM = (id, status, conclusion) => ({ ...check(id, status, conclusion), app: 'codescene-cloud' });
prova(situacaoDoCheck([check(1, 'completed', 'success'), DA_NUVEM(2, 'completed', 'failure')]), { estado: 'reprovou', conclusao: 'failure' },
  'os dois apps do CodeScene contam: um em failure reprova, mesmo com o outro em success');
prova(situacaoDoCheck([check(1, 'completed', 'success'), DA_NUVEM(2, 'in_progress')]).estado, 'rodando', 'com um app ainda rodando, espera');
prova(situacaoDoCheck([DA_NUVEM(1, 'completed', 'failure'), check(2, 'completed', 'success'), DA_NUVEM(3, 'completed', 'success')]).estado, 'passou',
  'a rodada nova de um app substitui a antiga do mesmo app');

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
  const DE_REFATORACAO = pr(642, 'A fábrica de closures vira classe (CodeScene, onda 3)');

  let { portas, relogio } = portasCom([[check(1, 'completed', 'success')]]);
  let r = await conferir(DE_REFATORACAO, portas, 600);
  prova([r.ok, relogio.lidas], [true, 1], `o check em success passa na primeira leitura: ${r.mensagem}`);

  ({ portas, relogio } = portasCom([[check(1, 'completed', 'failure')]]));
  r = await conferir(DE_REFATORACAO, portas, 600);
  prova([r.ok, /está em failure, não em success/.test(r.mensagem)], [false, true], `o check reprovado reprova o job: ${r.mensagem}`);

  ({ portas, relogio } = portasCom([[], [check(1, 'in_progress')], [check(1, 'completed', 'success')]]));
  r = await conferir(DE_REFATORACAO, portas, 600);
  prova([r.ok, relogio.lidas, relogio.agora, relogio.avisos.length], [true, 3, 40000, 2],
    `o job que roda antes do CodeScene espera ele reportar e terminar: ${r.mensagem}`);

  ({ portas, relogio } = portasCom([[]]));
  r = await conferir(DE_REFATORACAO, portas, 600);
  prova([r.ok, /ainda não reportou em 600 s/.test(r.mensagem), relogio.agora], [false, true, 600000],
    `o check que nunca chega falha no prazo, sem passar em silêncio e sem esperar para sempre: ${r.mensagem}`);

  ({ portas, relogio } = portasCom([[check(1, 'queued')]]));
  r = await conferir(DE_REFATORACAO, portas, 60);
  prova([r.ok, /ainda não terminou em 60 s/.test(r.mensagem)], [false, true], `o check que não termina também falha no prazo: ${r.mensagem}`);

  ({ portas, relogio } = portasCom([[check(1, 'completed', 'failure')]]));
  r = await conferir(pr(638, 'TESTE CodeScene'), portas, 600);
  prova([r.ok, relogio.lidas], [true, 0], 'a PR isenta nem lê os checks');
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
      PR_NUMERO: '650', PR_TITULO: 'O resumo sai do painel (CodeScene, Onda 1)', PR_ROTULOS: '[]', PR_HEAD: HEAD, ...env,
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
  r = rodarComGhFalso(sucesso, { PR_NUMERO: '64a' });
  prova([r.status, /PR_NUMERO inválido/.test(r.saida)], [1, true], `número da PR inválido é erro: ${r.saida}`);
}

function provarOWorkflow() {
  const workflow = lerYaml(fs.readFileSync(path.join(RAIZ, '.github', 'workflows', 'regras.yml'), 'utf8'));
  const job = workflow.jobs.regras;
  const passo = job.steps.find(p => p.name === 'CodeScene na refatoração');
  prova(Boolean(passo), true, 'o passo está no job "Regras de revisão": sem ele, a regra não vale');
  prova(job.name, 'Regras de revisão', 'no job obrigatório');
  prova(passo.run, 'node scripts/ci/codescene-na-refatoracao.js', 'roda o script, sem nada da PR no comando');
  prova(/github\.event_name == 'pull_request'/.test(passo.if) && /!cancelled\(\)/.test(passo.if), true, 'em toda PR, mesmo depois de outro passo falhar');
  prova(Object.fromEntries(Object.entries(passo.env)), {
    GH_TOKEN: '${{ github.token }}',
    PR_NUMERO: '${{ github.event.pull_request.number }}',
    PR_TITULO: '${{ github.event.pull_request.title }}',
    PR_ROTULOS: '${{ toJSON(github.event.pull_request.labels.*.name) }}',
    PR_HEAD: '${{ github.event.pull_request.head.sha }}',
  }, 'o título e os rótulos vão pelo ambiente, e o head é o da PR');
  prova(workflow.permissions.checks, 'read', 'o token do job lê os checks');
  prova(job['timeout-minutes'] >= 12, true, 'o job dá tempo para os 10 minutos de espera');
}

provarAEspera().then(() => {
  provarOComando();
  provarOWorkflow();
  console.log(`codescene-na-refatoracao: ${total} provas passaram`);
}, erro => { console.error(erro); process.exit(1); });

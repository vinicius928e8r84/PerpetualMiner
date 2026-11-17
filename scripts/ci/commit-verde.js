'use strict';

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PREFIXO = 'verde/';
const SO_DE_PR = ['Registro da PR'];
const FALHAS = ['failure', 'timed_out', 'cancelled', 'action_required', 'startup_failure', 'stale'];
const RAIZ = path.resolve(__dirname, '..', '..');

function nomeDaTag(sha, quando) {
  return `${PREFIXO}${quando.toISOString().slice(0, 10)}-${sha.slice(0, 7)}`;
}

function esperados(raiz = RAIZ) {
  const lista = JSON.parse(fs.readFileSync(path.join(raiz, 'scripts/ci/checks-obrigatorios.json'), 'utf8')).checks;
  return lista.filter(nome => !SO_DE_PR.includes(nome));
}

function avaliar(checkRuns, { esperados: nomes, ignorar = [] }) {
  const runs = checkRuns.filter(run => !ignorar.includes(run.name));
  const falhou = runs.filter(run => run.status === 'completed' && FALHAS.includes(run.conclusion)).map(run => run.name);
  if (falhou.length) return { estado: 'vermelho', motivo: `check vermelho: ${falhou.join(', ')}` };
  const presentes = new Set(runs.map(run => run.name));
  const faltam = nomes.filter(nome => !presentes.has(nome));
  if (faltam.length) return { estado: 'pendente', motivo: `check que ainda não apareceu: ${faltam.join(', ')}` };
  const abertos = runs.filter(run => run.status !== 'completed').map(run => run.name);
  if (abertos.length) return { estado: 'pendente', motivo: `check ainda rodando: ${abertos.join(', ')}` };
  return { estado: 'verde', motivo: 'todos os checks passaram' };
}

const git = (raiz, ...args) => execFileSync('git', ['-C', raiz, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function tagsDoCommit(sha, raiz = RAIZ) {
  const saida = git(raiz, 'tag', '--points-at', sha, '--list', `${PREFIXO}*`);
  return saida.split('\n').map(linha => linha.trim()).filter(Boolean);
}

function conferir({ raiz = RAIZ, modo = 'exigir' } = {}) {
  if (modo === 'ignorar') return { ok: true, mensagem: '' };
  const falha = motivo => ({ ok: modo !== 'exigir', mensagem: `commit sem registro de verde: ${motivo}` });
  let sha;
  let sujo;
  let tags;
  try {
    sha = git(raiz, 'rev-parse', 'HEAD').trim();
    sujo = git(raiz, 'status', '--porcelain').trim() !== '';
    tags = tagsDoCommit(sha, raiz);
  } catch (erro) {
    return falha(`não consegui ler o git (${erro.message.split('\n')[0]})`);
  }
  if (!tags.length) {
    return falha(`${sha.slice(0, 7)} não tem tag ${PREFIXO}* (a suíte completa não passou nele, ou as tags não foram baixadas: git fetch origin --tags)`);
  }
  if (sujo) return falha(`${sha.slice(0, 7)} está marcado (${tags[0]}), mas a árvore tem mudanças que não estão nele`);
  return { ok: true, mensagem: `${sha.slice(0, 7)} é um commit verde (${tags[0]})` };
}

function modoDoAmbiente(env = process.env) {
  return ['avisar', 'ignorar'].includes(env.PM_COMMIT_VERDE) ? env.PM_COMMIT_VERDE : 'exigir';
}

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

function checkRunsDoCommit(repo, sha) {
  const saida = gh('api', '--paginate', `repos/${repo}/commits/${sha}/check-runs?per_page=100`, '--jq', '.check_runs[] | {name, status, conclusion}');
  return saida.split('\n').filter(Boolean).map(linha => JSON.parse(linha));
}

function estaNaMain(repo, sha) {
  const situacao = gh('api', `repos/${repo}/compare/main...${sha}`, '--jq', '.status').trim();
  return situacao === 'behind' || situacao === 'identical';
}

function criarTag(repo, sha, nome) {
  const r = spawnSync('gh', ['api', '-X', 'POST', `repos/${repo}/git/refs`, '-f', `ref=refs/tags/${nome}`, '-f', `sha=${sha}`], { encoding: 'utf8' });
  if (r.status === 0) return 'criada';
  if (/Reference already exists/i.test(`${r.stdout}${r.stderr}`)) return 'existia';
  throw new Error(`gh api não criou a tag ${nome}: ${(r.stderr || r.stdout).trim()}`);
}

const dormir = segundos => new Promise(resolver => setTimeout(resolver, segundos * 1000));

async function marcar({ sha, repo, esperarMinutos = 0, ignorar = [], intervalo = 30, agora = () => new Date() }) {
  if (!estaNaMain(repo, sha)) return { marcou: false, estado: 'fora', motivo: 'o commit não está na main' };
  const limite = Date.now() + esperarMinutos * 60 * 1000;
  for (;;) {
    const veredito = avaliar(checkRunsDoCommit(repo, sha), { esperados: esperados(), ignorar });
    if (veredito.estado !== 'pendente' || Date.now() >= limite) {
      if (veredito.estado !== 'verde') return { marcou: false, ...veredito };
      const nome = nomeDaTag(sha, agora());
      return { marcou: true, nome, resultado: criarTag(repo, sha, nome), ...veredito };
    }
    console.log(`${veredito.motivo}; espero ${intervalo}s`);
    await dormir(intervalo);
  }
}

function opcoes(argumentos) {
  const achado = { ignorar: [] };
  for (let i = 0; i < argumentos.length; i++) {
    if (argumentos[i] === '--ignorar') achado.ignorar.push(argumentos[++i]);
    else if (argumentos[i] === '--esperar') achado.esperar = Number(argumentos[++i]);
    else if (argumentos[i] === '--raiz') achado.raiz = path.resolve(argumentos[++i]);
    else if (argumentos[i] === '--exigir') achado.modo = 'exigir';
    else achado.soltos = [...(achado.soltos || []), argumentos[i]];
  }
  return achado;
}

async function principal([comando, ...resto]) {
  const o = opcoes(resto);
  if (comando === 'conferir') {
    const { ok, mensagem } = conferir({ raiz: o.raiz, modo: o.modo || modoDoAmbiente() });
    if (mensagem) (ok && /é um commit verde/.test(mensagem) ? console.log : console.error)(mensagem);
    return ok ? 0 : 1;
  }
  if (comando === 'marcar') {
    const sha = (o.soltos || [])[0];
    const repo = process.env.GITHUB_REPOSITORY;
    if (!/^[0-9a-f]{40}$/.test(sha || '') || !repo) {
      console.error('uso: GITHUB_REPOSITORY=dono/repo node scripts/ci/commit-verde.js marcar <sha inteiro> [--esperar <minutos>] [--ignorar <nome do check>]');
      return 2;
    }
    const r = await marcar({ sha, repo, esperarMinutos: o.esperar || 0, ignorar: o.ignorar });
    console.log(r.marcou ? `${r.nome}: tag ${r.resultado} em ${sha}` : `${sha.slice(0, 7)} não foi marcado: ${r.motivo}`);
    return 0;
  }
  console.error('uso: node scripts/ci/commit-verde.js conferir [--exigir] | marcar <sha>');
  return 2;
}

module.exports = { PREFIXO, nomeDaTag, avaliar, esperados, conferir, modoDoAmbiente, tagsDoCommit };

if (require.main === module) {
  principal(process.argv.slice(2)).then(codigo => process.exit(codigo), erro => { console.error(erro.message); process.exit(1); });
}

'use strict';

const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { conferir, lerDoGitHub } = require('./registro-da-pr.js');
const { soMergesLimposDaMain } = require('./so-merge-da-main.js');

const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'so-merge-da-main-'));
const git = (...args) => execFileSync('git', ['-C', raiz, '-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const grava = (arquivo, texto) => fs.writeFileSync(path.join(raiz, arquivo), texto);
const commita = (arquivo, texto, assunto = arquivo) => { grava(arquivo, texto); git('add', '-A'); git('commit', '-q', '-m', assunto); return git('rev-parse', 'HEAD'); };
const publicaMain = sha => git('update-ref', 'refs/remotes/origin/main', sha);
const vale = (de, ate) => soMergesLimposDaMain({ de, ate, base: 'main', raiz });

try {
  git('init', '-q', '-b', 'main');
  const inicio = commita('a.txt', 'a\nb\nc\n');
  publicaMain(inicio);

  git('checkout', '-q', '-b', 'pr');
  const revisado = commita('pr.txt', 'a mudança da PR');

  git('checkout', '-q', 'main');
  const m1 = commita('outro.txt', 'main andou');
  publicaMain(m1);
  const m2 = commita('mais.txt', 'main andou de novo');
  publicaMain(m2);

  git('checkout', '-q', 'pr');
  git('merge', '-q', '--no-ff', '-m', 'Merge origin/main', m1);
  const umMerge = git('rev-parse', 'HEAD');
  git('merge', '-q', '--no-ff', '-m', 'Merge origin/main', m2);
  const doisMerges = git('rev-parse', 'HEAD');
  assert.strictEqual(vale(revisado, revisado), true, 'o mesmo commit');
  assert.strictEqual(vale(revisado, umMerge), true, 'um merge limpo da main');
  assert.strictEqual(vale(revisado, doisMerges), true, 'dois merges limpos da main em sequência');
  assert.strictEqual(vale(umMerge, doisMerges), true, 'só o segundo merge');
  assert.strictEqual(vale(doisMerges, revisado), false, 'o sentido contrário não é um merge da main');
  assert.strictEqual(vale(revisado.slice(0, 7), doisMerges), false, 'SHA abreviado');
  assert.strictEqual(vale('0'.repeat(40), doisMerges), false, 'um commit que o clone não tem');
  assert.strictEqual(soMergesLimposDaMain({ de: revisado, ate: doisMerges, base: 'main;rm', raiz }), false, 'a base é um nome de branch');
  assert.strictEqual(soMergesLimposDaMain({ de: revisado, ate: doisMerges, base: 'nao-existe', raiz }), false, 'sem a base no clone');
  assert.strictEqual(soMergesLimposDaMain({ de: revisado, ate: doisMerges, raiz }), false, 'sem o nome da base');

  const novo = commita('novo.txt', 'código novo depois da revisão');
  git('merge', '-q', '--no-ff', '-m', 'Merge origin/main', m2);
  assert.strictEqual(vale(doisMerges, novo), false, 'um commit novo da PR');
  git('reset', '-q', '--hard', doisMerges);

  git('checkout', '-q', '-b', 'outra', inicio);
  const deOutra = commita('outra.txt', 'trabalho de outra branch');
  git('checkout', '-q', 'pr');
  git('merge', '-q', '--no-ff', '-m', 'Merge outra', deOutra);
  assert.strictEqual(vale(doisMerges, git('rev-parse', 'HEAD')), false, 'o merge de uma branch que não está na main');
  git('reset', '-q', '--hard', doisMerges);

  git('checkout', '-q', '-b', 'escondida', revisado);
  git('merge', '-q', '--no-commit', '--no-ff', m1);
  grava('pr.txt', 'a mudança da PR, trocada dentro do merge');
  git('add', '-A');
  git('commit', '-q', '-m', 'Merge origin/main');
  assert.strictEqual(vale(revisado, git('rev-parse', 'HEAD')), false, 'o merge que muda um arquivo além do merge limpo');

  git('checkout', '-q', 'main');
  const conflitoNaMain = commita('a.txt', 'a\nmain\nc\n');
  publicaMain(conflitoNaMain);
  git('checkout', '-q', '-b', 'conflito', inicio);
  const conflitoNaPr = commita('a.txt', 'a\npr\nc\n');
  assert.throws(() => git('merge', '-q', '--no-ff', conflitoNaMain));
  grava('a.txt', 'a\nmain e pr\nc\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'Merge origin/main');
  assert.strictEqual(vale(conflitoNaPr, git('rev-parse', 'HEAD')), false, 'o merge com conflito resolvido à mão');

  const REGISTRO = head => `## Code review\n\nVeredito: CLEAN\nHead: ${head}\nAutor: a\nRevisor: b\nRisco: BAIXA`;
  const CORPO = ['## Summary', '', 'Sem issue', '', '## Evidence', '', '## Merge Danger', '', 'Door: two-way', 'Blast Radius: CI', 'Política: sem mudança', 'Atenção: BAIXA'].join('\n');
  const pedidos = [];
  global.fetch = async url => {
    pedidos.push(String(url));
    const caminho = new URL(url).pathname;
    const corpo = caminho.endsWith('/pulls/7') ? { body: CORPO, labels: [], head: { sha: head.atual }, base: { ref: 'main' } }
      : caminho.endsWith('/issues/7/comments') ? [{ body: REGISTRO(revisado), created_at: '2026-01-01T00:00:00Z', author_association: 'OWNER' }] : [];
    return { ok: true, status: 200, json: async () => corpo };
  };
  const head = { atual: doisMerges };
  const env = { GITHUB_REPOSITORY: 'dono/repo', PR: '7', RAIZ_DO_GIT: raiz };
  (async () => {
    let lido = await lerDoGitHub(env, doisMerges);
    assert.deepStrictEqual(lido.headsEquivalentes, [revisado], 'o registro do head anterior vale por merges limpos da main');
    const ok = conferir({ ...lido, head: doisMerges });
    assert.strictEqual(ok.ok, true, ok.mensagem);
    assert(ok.mensagem.includes(`registro do head ${revisado}`) && ok.mensagem.includes('só há merges limpos da main'), ok.mensagem);
    assert.strictEqual(conferir({ ...lido, head: doisMerges, headsEquivalentes: [] }).ok, false, 'sem a equivalência, o head novo pede revisão nova');

    head.atual = novo;
    lido = await lerDoGitHub(env, novo);
    assert.deepStrictEqual(lido.headsEquivalentes, [], 'um commit novo da PR invalida o registro');
    assert.strictEqual(conferir({ ...lido, head: novo }).ok, false);

    const achados = REGISTRO(revisado).replace('CLEAN', 'FINDINGS');
    const falta = conferir({ corpo: CORPO, rotulos: [], registros: [REGISTRO(revisado), achados], head: doisMerges, headsEquivalentes: [revisado] });
    assert.strictEqual(falta.ok, false, 'o FINDINGS mais novo do head anterior também vale para o head com merges limpos');
    assert.match(falta.mensagem, /é FINDINGS, não CLEAN/);
    console.log('test_so_merge_da_main: ok');
  })().catch(erro => { console.error(erro); process.exitCode = 1; }).finally(() => fs.rmSync(raiz, { recursive: true, force: true }));
} catch (erro) {
  fs.rmSync(raiz, { recursive: true, force: true });
  throw erro;
}

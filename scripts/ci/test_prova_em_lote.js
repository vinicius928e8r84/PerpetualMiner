'use strict';

const assert = require('assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { FRASE, conferir, faltaDaProva, faltasDoCorpo, lotesQueContemOHead } = require('./registro-da-pr.js');
const { planejar } = require('./registrar-na-pr.js');
const REGISTRAR = path.join(__dirname, 'registrar-na-pr.js');

const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'prova-em-lote-'));
const git = (...args) => execFileSync('git', ['-C', raiz, '-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const commita = (arquivo, texto) => { fs.writeFileSync(path.join(raiz, arquivo), texto); git('add', '-A'); git('commit', '-q', '-m', arquivo); return git('rev-parse', 'HEAD'); };

const MODELO = ['## Summary', '', 'O que mudou.', '', 'Sem issue', '', '## Evidence', '', 'Rodei.', '', '## Merge Danger', '', '**Door:** two-way', '', '**Blast Radius:** CI', '', '**Política:** sem mudança', '', '**Atenção:** ALTA', ''];
const corpoCom = (...linhas) => [...MODELO, '## Prova real', '', ...linhas, '', '## Known limits', '', 'Nenhum.'].join('\n');
const registro = head => ['Veredito: CLEAN', `Head: ${head}`, 'Autor: a', 'Revisor: b', 'Risco: ALTA'].join('\n');
const doLote = (lote, ...resto) => corpoCom(FRASE, `Lote: ${lote}`, ...resto);
const faltas = (corpo, head, lotes) => faltaDaProva(corpo, head, lotes);

try {
  git('init', '-q', '-b', 'main');
  const inicio = commita('base.txt', 'base');
  git('checkout', '-q', '-b', 'pr-a');
  const headA = commita('a.txt', 'a');
  git('checkout', '-q', '-b', 'pr-b', inicio);
  const headB = commita('b.txt', 'b');
  git('checkout', '-q', '-b', 'pr-c', inicio);
  const headC = commita('c.txt', 'c');
  git('checkout', '-q', '-b', 'lote', inicio);
  git('merge', '-q', '--no-ff', '-m', 'lote A', headA);
  git('merge', '-q', '--no-ff', '-m', 'lote B', headB);
  const lote = git('rev-parse', 'HEAD');
  const corpo = doLote(lote, 'Rodei no Anki de verdade, no Mac e no Windows.');
  const contem = head => lotesQueContemOHead({ corpo, head, raiz });

  assert.deepStrictEqual(contem(headA), [lote], 'o lote contém o head da PR A');
  assert.deepStrictEqual(contem(headB), [lote], 'o lote contém o head da PR B: a mesma prova vale para as duas');
  assert.deepStrictEqual(contem(headC), [], 'o lote não contém o head da PR C, que ficou de fora');
  assert.deepStrictEqual(lotesQueContemOHead({ corpo, head: lote, raiz }), [lote], 'o próprio commit de lote é um head que ele contém');
  assert.deepStrictEqual(lotesQueContemOHead({ corpo: corpoCom(FRASE, `Lote: ${'0'.repeat(40)}`), head: headA, raiz }), [], 'um lote que não existe no repositório não contém nada');
  assert.deepStrictEqual(lotesQueContemOHead({ corpo: corpoCom(FRASE, `Lote: ${lote.slice(0, 8)}`), head: headA, raiz }), [], 'o lote abreviado não vale');
  assert.deepStrictEqual(lotesQueContemOHead({ corpo: `${MODELO.join('\n')}\n\`\`\`\n## Prova real\nLote: ${lote}\n\`\`\``, head: headA, raiz }), [], 'o lote num bloco de código não conta');
  assert.deepStrictEqual(lotesQueContemOHead({ corpo: null, head: headA, raiz }), [], 'PR sem corpo');

  assert.strictEqual(faltas(corpo, headA, contem(headA)), null, 'a prova do lote vale para a PR A');
  assert.strictEqual(faltas(corpo, headB, contem(headB)), null, 'e para a PR B');
  assert.match(faltas(corpo, headC, contem(headC)), /é do lote [0-9a-f]{40}, que não contém o head [0-9a-f]{40} \(o head mudou depois do lote/, 'a PR C não está no lote');
  assert.match(faltas(corpo, headA), /é do lote/, 'sem a lista de lotes que contêm o head, o lote não vale');

  git('checkout', '-q', 'pr-a');
  const headANovo = commita('a2.txt', 'a mudou depois do lote');
  assert.match(faltas(corpo, headANovo, contem(headANovo)), /que não contém o head/, 'um commit novo na PR tira o head do lote: prove de novo');

  const comOutroTexto = (...linhas) => doLote(lote, ...linhas);
  assert.match(faltas(comOutroTexto('NÃO COBERTO: o Windows'), headA, [lote]), /não coberta ou bloqueada/, 'a lacuna da prova vale também no lote');
  assert.match(faltas(corpoCom(`Lote: ${lote}`), headA, [lote]), /não tem a linha PROVADO 100% REAL/, 'o lote sem a frase não vale');
  assert.strictEqual(faltas(corpoCom(FRASE, `Head: ${headA}`, `Lote: ${'0'.repeat(40)}`), headA, []), null, 'o Head certo continua valendo mesmo com um lote que não vale');

  const pr = head => ({ corpo: corpoCom('Ainda não.'), rotulos: [], registros: [registro(head)], head });
  const prA = { ...pr(headA), corpo: corpo };
  assert.strictEqual(conferir({ ...prA, lotes: contem(headA) }).ok, true, conferir({ ...prA, lotes: contem(headA) }).mensagem);
  assert.strictEqual(conferir({ ...prA, lotes: [] }).ok, false, 'sem o lote que contém o head, o check barra');
  assert.deepStrictEqual(faltasDoCorpo({ corpo, rotulos: [], head: headA, repositorio: 'dono/repo', lotes: [lote] }).filter(falta => /Prova real/.test(falta)), [], 'o conferidor do corpo aceita a prova do lote');

  const pedido = { comando: 'prova', lote, cobertura: FRASE };
  const plano = planejar(pedido, { ...pr(headA), corpo: corpoCom('Ainda não.').replace('## Prova real', '## Antes') }, 'Rodei no Anki de verdade.', raiz);
  assert(!plano.recusa, plano.recusa);
  assert(plano.secao.includes(`${FRASE}\nLote: ${lote}`) && !plano.secao.includes('Head:'), 'a seção diz o lote e não o head');
  assert.strictEqual(plano.depois.ok, true, plano.depois.mensagem);
  assert.match(planejar({ ...pedido, lote: lote.slice(0, 8) }, pr(headA), 'x', raiz).recusa, /--lote pede o SHA inteiro/, 'o lote abreviado');
  assert.match(planejar(pedido, pr(headC), 'x', raiz).recusa, /o check não aceitaria esta prova: .*que não contém o head/, 'a PR fora do lote recusa a prova');
  assert.match(planejar({ ...pedido, lote: headA.replace(/./, c => (c === '0' ? '1' : '0')) }, pr(headA), 'x', raiz).recusa, /que não contém o head/, 'um lote que o repositório não tem (git fetch origin)');
  assert.strictEqual(planejar({ ...pedido, cobertura: 'BLOQUEADA-Mac-Windows' }, pr(headA), 'Só no Mac.', raiz).depois.ok, false, 'a prova parcial do lote não passa com ALTA');
  const lerUso = (...args) => spawnSync('node', [REGISTRAR, ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, GITHUB_REPOSITORY: 'dono/repo', GITHUB_TOKEN: 'segredo' } });
  const NOTA = ['--cobertura', 'total', '--nota', 'nota.md'];
  for (const [args, padrao] of [
    [['prova', '--pr', '7', '--lote', lote, '--head', headA, ...NOTA], /--lote e --head não vão juntos/],
    [['revisao', '--pr', '7', '--lote', lote], /--lote é só do comando prova/],
    [['prova', '--pr', '7', '--lote', lote, '--cobertura', 'total'], /prova pede --nota/],
    [['prova', '--pr', '7', ...NOTA], /prova pede --head/],
  ]) {
    const feito = lerUso(...args);
    assert.strictEqual(feito.status, 2, args.join(' '));
    assert.match(feito.stdout, padrao, args.join(' '));
  }
  assert.match(lerUso('--help').stdout, /--lote <SHA do commit de lote>/, 'a ajuda explica o --lote');
} finally {
  fs.rmSync(raiz, { recursive: true, force: true });
}
console.log('test_prova_em_lote: ok');

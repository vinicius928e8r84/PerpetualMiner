'use strict';

const assert = require('assert');
const fs = require('fs');
const { FRASE, conferir } = require('./registro-da-pr.js');
const { caminhosDaApi, caminhosDaPrNoGit, caminhosSensiveisDe } = require('./caminhos-sensiveis.js');
const { raizTemporaria } = require('../regras/apoio-sem-comentario');

const HEAD = '96cfa870d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6';
const MODELO = ['## Summary', '', 'O que mudou.', '', 'Sem issue', '', '## Evidence', '', 'Rodei.', '', '## Merge Danger', '', '**Door:** two-way', '', '**Blast Radius:** CI', '', '**Política:** sem mudança', ''];
const corpoCom = (atencao, ...linhas) => [...MODELO, `**Atenção:** ${atencao}`, ...linhas].join('\n');
const PROVA = ['', '## Prova real', '', FRASE, `Head: ${HEAD}`, 'Rodei o CI de verdade.'];
const REVISAO = ['## Code review', '', 'Veredito: CLEAN', `Head: ${HEAD}`, 'Autor: sessão do autor', 'Revisor: sessão da revisão', 'Risco: BAIXA'].join('\n');
const SENSIVEL = ['.github/workflows/regras.yml'];

const resultado = pr => conferir({ corpo: corpoCom('BAIXA'), rotulos: [], registros: [REVISAO], head: HEAD, ...pr });

for (const caminho of ['.github/workflows/regras.yml', '.github/PULL_REQUEST_TEMPLATE.md', 'scripts/regras/verificar.js', 'scripts/ci/registro-da-pr.js',
  'scripts/ganchos/pre-push', 'AGENTS.md', 'CLAUDE.md', 'engine/CLAUDE.md', '.claude/skills/x/SKILL.md', '.agents/skills/popup/SKILL.md']) {
  assert.deepStrictEqual(caminhosSensiveisDe([caminho]), [caminho], `${caminho} é sensível`);
}
for (const caminho of ['popup/popup.js', 'scripts/testar.mjs', 'scripts/regras-do-site/x.js', '.github-antigo/x', 'docs/AGENTS.md.md', 'MEUAGENTS.md', 'complemento/servidor.py']) {
  assert.deepStrictEqual(caminhosSensiveisDe([caminho]), [], `${caminho} não é sensível`);
}
assert.deepStrictEqual(caminhosSensiveisDe(['b/CLAUDE.md', 'popup/popup.js', 'b/CLAUDE.md', 'AGENTS.md']), ['AGENTS.md', 'b/CLAUDE.md'], 'sem repetição, em ordem');

assert.deepStrictEqual(caminhosDaApi([{ filename: 'popup/popup.js' }, { filename: 'lib/novo.js', previous_filename: 'scripts/ci/velho.js' }, { filename: 'AGENTS.md' }]),
  ['AGENTS.md', 'scripts/ci/velho.js'], 'o nome antigo de um arquivo que saiu de uma pasta sensível também conta');

assert.strictEqual(resultado({}).ok, true, 'sem caminho sensível a atenção BAIXA basta');
assert.strictEqual(resultado({ caminhosSensiveis: [] }).ok, true, 'a lista vazia é o mesmo que nenhuma');

const semProva = resultado({ caminhosSensiveis: SENSIVEL });
assert.strictEqual(semProva.ok, false, 'a PR que diz BAIXA e mexe em .github/ pede a prova real');
assert.match(semProva.mensagem, /caminho sensível \(\.github\/[^)]*AGENTS\.md[^)]*\): o corpo não tem a seção "Prova real"/);

const comProva = resultado({ corpo: corpoCom('BAIXA', ...PROVA), caminhosSensiveis: SENSIVEL });
assert.strictEqual(comProva.ok, true, comProva.mensagem);
assert.match(comProva.mensagem, /atenção ALTA \(o corpo diz BAIXA, mexe em \.github\/workflows\/regras\.yml\)/, 'o que vale é ALTA e diz por quê');
assert.match(comProva.mensagem, new RegExp(`${FRASE}$`));

assert.strictEqual(resultado({ corpo: corpoCom('BAIXA', ...PROVA), caminhosSensiveis: SENSIVEL, head: HEAD.replace('9', '8'), registros: [REVISAO.replace(HEAD, HEAD.replace('9', '8'))] }).ok, false,
  'a prova de outro head não vale');

assert.strictEqual(resultado({ corpo: corpoCom('ALTA', ...PROVA), caminhosSensiveis: SENSIVEL }).mensagem.includes('o corpo diz'), false, 'o corpo que já diz ALTA não é corrigido');

const soTiraComentario = { ok: true, arquivos: ['scripts/ci/x.js'] };
assert.strictEqual(resultado({ caminhosSensiveis: SENSIVEL, soTiraComentario }).ok, true, 'a PR que só tira comentário, provado token a token, não pede a prova');

function emUmaPr(antes, depois) {
  const { raiz, git, gravar, commit } = raizTemporaria();
  try {
    gravar({ 'LEIAME.md': 'x\n', ...antes });
    commit('base');
    git('checkout', '-q', '-b', 'pr');
    gravar(depois);
    commit('pr');
    return caminhosDaPrNoGit({ raiz, base: 'main', head: 'pr' });
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
  }
}

assert.deepStrictEqual(emUmaPr({}, { 'popup/popup.js': 'a\n' }), [], 'uma PR só de extensão');
assert.deepStrictEqual(emUmaPr({}, { 'popup/popup.js': 'a\n', '.github/workflows/novo.yml': 'on: push\n', 'scripts/regras/nova.js': 'x\n' }),
  ['.github/workflows/novo.yml', 'scripts/regras/nova.js'], 'o que a PR acrescentou');
assert.deepStrictEqual(emUmaPr({ 'AGENTS.md': 'a\n', 'lib/x.js': 'x\n' }, { 'AGENTS.md': null }), ['AGENTS.md'], 'apagar um arquivo sensível conta');
assert.deepStrictEqual(emUmaPr({ 'scripts/ci/velho.js': 'conteúdo grande o bastante para o git achar o rename\n'.repeat(5) }, { 'scripts/ci/velho.js': null, 'lib/novo.js': 'conteúdo grande o bastante para o git achar o rename\n'.repeat(5) }),
  ['scripts/ci/velho.js'], 'tirar um arquivo de uma pasta sensível conta, mesmo renomeado para fora');
assert.throws(() => caminhosDaPrNoGit({ raiz: __dirname, base: 'origem-que-nao-existe' }), 'sem a base, falha em vez de dizer que não há caminho sensível');

console.log('test_caminhos_sensiveis: ok');

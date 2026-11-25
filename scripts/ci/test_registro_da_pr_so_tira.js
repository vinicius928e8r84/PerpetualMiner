'use strict';

const assert = require('assert');
const { ROTULO_DE_RISCO_ALTO, conferir } = require('./registro-da-pr.js');

const HEAD = '96cfa870d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6';
const MODELO = ['## Summary', '', 'O que mudou.', '', 'Sem issue', '', '## Evidence', '', 'Rodei.', '', '## Merge Danger', '', '**Door:** two-way', '', '**Blast Radius:** CI', '', '**Política:** sem mudança', ''];
const corpoCom = (...linhas) => [...MODELO, ...linhas].join('\n');
const revisao = (risco = 'BAIXA') => ['## Code review', '', 'Veredito: CLEAN', `Head: ${HEAD}`, 'Autor: sessão do autor', 'Revisor: sessão da revisão', `Risco: ${risco}`].join('\n');

const resultado = pr => conferir({ corpo: corpoCom('**Atenção:** BAIXA'), rotulos: [], registros: [revisao()], head: HEAD, ...pr });
const passa = (pr, caso) => {
  const { ok, mensagem } = resultado(pr);
  assert.strictEqual(ok, true, `${caso}: ${mensagem}`);
  return mensagem;
};
const recusa = (pr, padrao, caso) => {
  const { ok, mensagem } = resultado(pr);
  assert.strictEqual(ok, false, caso);
  assert.match(mensagem, padrao, caso);
};

const SO_COMENTARIO = { ok: true, arquivos: ['lib/a.js', 'lib/b.js'] };
const SEM_A_PROVA = /atenção ALTA: o corpo não tem a seção "Prova real"/;

assert.match(passa({ corpo: corpoCom('**Atenção:** ALTA'), soTiraComentario: SO_COMENTARIO }, 'ALTA no corpo, sem a seção da prova, e a conferência provou'), /atenção BAIXA \(a PR só tira comentário: código idêntico token a token em 2 arquivo\(s\), sem comentário novo\)/);
passa({ registros: [revisao('ALTA')], soTiraComentario: SO_COMENTARIO }, 'o revisor viu risco ALTA, e a conferência provou');
recusa({ corpo: corpoCom('**Atenção:** ALTA'), soTiraComentario: { ok: false, motivo: 'o código mudou' } }, SEM_A_PROVA, 'a conferência que não provou não dispensa a prova');
recusa({ corpo: corpoCom('**Atenção:** ALTA'), soTiraComentario: undefined }, SEM_A_PROVA, 'sem a conferência, nada muda');
recusa({ rotulos: [ROTULO_DE_RISCO_ALTO], soTiraComentario: SO_COMENTARIO }, SEM_A_PROVA, 'o rótulo risco:alto é decisão de uma pessoa e continua pedindo a prova');
recusa({ corpo: '', soTiraComentario: SO_COMENTARIO }, /não segue o modelo do \/pr/, 'o corpo continua tendo de seguir o modelo');
recusa({ registros: [], soTiraComentario: SO_COMENTARIO }, /nenhum comentário ou revisão da PR é o registro do \/code-review/, 'a revisão continua sendo exigida');

console.log('registro-da-pr só tira comentário: 7 provas ok');

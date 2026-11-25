'use strict';

const assert = require('assert');
const crypto = require('crypto');

globalThis.PerpetualMiner = {};
require('../painel/painel-anki-primeira-conexao-estado.js');
const { FaseDaPrimeiraConexao, ConversaComOAbridor } = globalThis.PerpetualMiner;

const RETRATO_DA_FASE = 'e884f2d55e373a7467c428692c39c21a807da738427289081cc0d1a3e3dfdc42';
const RETRATO_DA_CONVERSA = 'a8abc6a558c2d6f7e5ceb4d7c2cd6db37dbb205299fe8f88d0af45be01fa5bdc';

const BOOLEANOS = [false, true];
const SITUACOES = ['conectando', 'desligada', 'ligada'];

function combinacoes(opcoes) {
  return Object.entries(opcoes).reduce(
    (todas, [nome, valores]) => todas.flatMap(base => valores.map(valor => ({ ...base, [nome]: valor }))),
    [{}],
  );
}

const retratoDe = linhas => crypto.createHash('sha256').update(JSON.stringify(linhas)).digest('hex');

function depoisDe(proxima, estado, evento) {
  const novo = proxima(estado, evento);
  return [evento, estado, novo, novo === estado];
}

function linhasDaFase() {
  const { FASE, EVENTO, proxima, cobreAsAbas } = FaseDaPrimeiraConexao;
  const estados = combinacoes({ fase: Object.values(FASE), pendente: BOOLEANOS });
  const conexoes = combinacoes({ situacao: SITUACOES, respondeu: BOOLEANOS, jaConectou: BOOLEANOS, naArea: BOOLEANOS, resolvido: BOOLEANOS });
  const eventos = [
    ...conexoes.map(conexao => ({ tipo: EVENTO.CONEXAO, ...conexao })),
    ...[true, false, undefined, 'sim'].map(pendente => ({ tipo: EVENTO.LEU, pendente })),
    { tipo: EVENTO.RESOLVEU }, { tipo: EVENTO.PRONTO_PASSOU }, { tipo: 'desconhecido' },
  ];
  return estados.flatMap(estado => [
    ['cobre', estado, cobreAsAbas(estado)],
    ...eventos.map(evento => depoisDe(proxima, estado, evento)),
  ]);
}

function linhasDaConversa() {
  const { FASE, EVENTO, proxima, resolvido, acoes } = ConversaComOAbridor;
  const estados = combinacoes({ fase: Object.values(FASE), agoraNao: BOOLEANOS, recusada: BOOLEANOS, detalhe: ['', 'x'] });
  const eventos = [
    ...[true, false, undefined].map(valor => ({ tipo: EVENTO.AGORA_NAO, valor })),
    { tipo: EVENTO.LIGOU }, { tipo: EVENTO.PERMITIR }, { tipo: EVENTO.TENTAR },
    ...BOOLEANOS.map(tem => ({ tipo: EVENTO.PERMISSAO, tem })),
    ...BOOLEANOS.map(dada => ({ tipo: EVENTO.RESPONDEU, dada })),
    ...['achou', 'nao_achou', 'sem_permissao', 'outro', undefined].flatMap(resultado => ['', 'por que'].map(detalhe => ({ tipo: EVENTO.CONFERIU, resultado, detalhe }))),
    { tipo: EVENTO.CONFERIU }, { tipo: 'desconhecido' },
  ];
  return estados.flatMap(estado => [
    ['resolvido e ações', estado, resolvido(estado), acoes(estado)],
    ...eventos.map(evento => depoisDe(proxima, estado, evento)),
  ]);
}

assert.strictEqual(retratoDe(linhasDaFase()), RETRATO_DA_FASE, 'a fase do card mudou em alguma combinação de estado e evento');
assert.strictEqual(retratoDe(linhasDaConversa()), RETRATO_DA_CONVERSA, 'a conversa com o abridor mudou em alguma combinação de estado e evento');
console.log('primeira conexão, espaço inteiro, ok');

'use strict';

const assert = require('assert');

const { comoValores, exemploDoAbridor, exemploDoConserto, carregar, relogioFalso } = require('./abrir_o_anki_de_mentira.js');

const PRAZO_DA_ESPERA_INTEIRA = 125_000;

async function percorrer({ consertos, abrir = 'no_lugar', situacoes = ['desligada'], continuar, ligaNoSegundo = false }) {
  const relogio = relogioFalso();
  const respostas = consertos.map(exemploDoConserto);
  let consertados = 0;
  let ligada = false;
  const responder = mensagem => {
    if (mensagem.acao !== 'consertar') return exemploDoAbridor('abrir', abrir);
    ligada = ligaNoSegundo && ++consertados === 2;
    return respostas.shift();
  };
  const conferir = async () => (ligaNoSegundo ? (ligada ? 'ligada' : 'desligada') : situacoes[0]);
  const { AbrirOAnki, enviadas } = carregar({ relogio, responder, situacoes, extras: { ConexaoAnki: { jaConectou: () => true, ...(ligaNoSegundo ? { conferir } : {}) } } });
  const fases = [];
  const andando = AbrirOAnki.abrirOuConsertar({ aoMudar: fase => fases.push(fase), ...(continuar ? { continuar } : {}) });
  await relogio.avancar(PRAZO_DA_ESPERA_INTEIRA);
  await relogio.avancar(PRAZO_DA_ESPERA_INTEIRA);
  const { quando, ...fim } = await comoValores(andando);
  assert.ok(quando, 'o diagnóstico leva a hora');
  return { ...fim, fases, pedidos: enviadas.map(e => e.mensagem.acao) };
}

async function oAnkiFechadoAbreEEspera() {
  const fim = await percorrer({ consertos: ['anki_fechado'], situacoes: ['desligada', 'ligada'] });
  assert.deepStrictEqual(fim, {
    desfecho: 'aberto', fases: ['abrindo'], pedidos: ['consertar', 'abrir'],
    passos: ['consertar → fechado', 'abrir → abriu', 'esperar a Conexão depois de abrir → respondeu'],
  });
}

async function oAbridorQueNaoAbreDizOQueAconteceu() {
  const fim = await percorrer({ consertos: ['anki_fechado'], abrir: 'nao_abre' });
  assert.deepStrictEqual(fim, {
    desfecho: 'nao_abriu', resultado: 'nao_abriu', detalhe: '', fases: ['abrindo'], pedidos: ['consertar', 'abrir'],
    passos: ['consertar → fechado', 'abrir → nao_abriu'],
  });
}

async function oAnkiTravadoReiniciaEEsperaAConexao() {
  const fim = await percorrer({ consertos: ['anki_travado'], situacoes: ['desligada', 'ligada'] });
  assert.deepStrictEqual(fim, {
    desfecho: 'reiniciado', fases: ['abrindo'], pedidos: ['consertar'],
    passos: ['consertar → reiniciado', 'esperar a Conexão depois de reiniciado → respondeu'],
  });
}

async function oAnkiReiniciadoSemConexaoNaoConsertou() {
  const fim = await percorrer({ consertos: ['anki_travado'], continuar: () => false });
  assert.deepStrictEqual(fim, {
    desfecho: 'falhou', motivo: 'sem_resposta_depois', fases: ['abrindo'], pedidos: ['consertar'],
    passos: ['consertar → reiniciado', 'esperar a Conexão depois de reiniciado → sem resposta'],
  });
}

async function oDesfechoDireitoDoConsertoNaoAbreNemEspera() {
  const fim = await percorrer({ consertos: ['complemento_sumiu'] });
  assert.deepStrictEqual(fim, { desfecho: 'sumiu', fases: [], pedidos: ['consertar'], passos: ['consertar → sumiu'] });
}

async function seAPessoaDesistirDepoisDeAbrirNaoConsertaDeNovo() {
  let continua = true;
  const fim = await percorrer({ consertos: ['anki_fechado'], continuar: () => { const vale = continua; continua = false; return vale; } });
  assert.deepStrictEqual(fim.pedidos, ['consertar', 'abrir']);
  assert.deepStrictEqual([fim.desfecho, fim.fases], ['sem_resposta', ['abrindo']]);
  assert.deepStrictEqual(fim.passos, ['consertar → fechado', 'abrir → abriu', 'esperar a Conexão depois de abrir → sem resposta']);
}

async function oSegundoConsertoSoValeSeMudouAlgo() {
  const casos = [
    ['ligou o complemento', 'complemento_desativado', 'ligado'],
    ['reiniciou o Anki', 'anki_travado', 'reiniciado'],
    ['o abridor não conseguiu', 'anki_nao_abre', 'falhou'],
    ['a pessoa fechou o Anki', 'anki_fechou_na_espera', 'fechou'],
    ['a Conexão já responde', 'conexao_responde', 'sem_resposta'],
    ['o Anki segue fechado', 'anki_fechado', 'sem_resposta'],
  ];
  for (const [nome, segundo, desfecho] of casos) {
    const fim = await percorrer({ consertos: ['anki_fechado', segundo], ligaNoSegundo: true });
    assert.strictEqual(fim.desfecho, desfecho, nome);
    assert.deepStrictEqual(fim.pedidos, ['consertar', 'abrir', 'consertar'], nome);
    assert.deepStrictEqual(fim.passos.slice(0, 3), ['consertar → fechado', 'abrir → abriu', 'esperar a Conexão depois de abrir → sem resposta'], nome);
  }
}

const CASOS = [
  oAnkiFechadoAbreEEspera,
  oAbridorQueNaoAbreDizOQueAconteceu,
  oAnkiTravadoReiniciaEEsperaAConexao,
  oAnkiReiniciadoSemConexaoNaoConsertou,
  oDesfechoDireitoDoConsertoNaoAbreNemEspera,
  seAPessoaDesistirDepoisDeAbrirNaoConsertaDeNovo,
  oSegundoConsertoSoValeSeMudouAlgo,
];

async function main() {
  for (const caso of CASOS) await caso();
  console.log('abrir o anki passos tests passed');
}

main().catch(erro => { console.error(erro); process.exit(1); });

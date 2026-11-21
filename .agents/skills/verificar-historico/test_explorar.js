'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { CENARIOS, armazenamento, conferir, principal } = require('./explorar');

const A = { id: 1, texto: 'A', data: '18/11/2026', keywords: ['a@1'] };
const B = { id: 2, texto: 'B', status: 'new' };
const NOVA = { id: 99, texto: 'C', exportadaTxt: true, streaming: 'netflix' };
const projecaoDeA = '{"texto":"A","id":"1","keywords":["a@1"]}';
const projecaoDeB = '{"texto":"B","id":"2","status":"new"}';
const SERIE = 'o frases final não é o de nenhuma ordem em série';

function mundoQueAnota(dados) {
  const passos = [];
  return { passos, mundo: { dados, passo: (oQue, efeito) => { passos.push(oQue); return Promise.resolve().then(efeito); } } };
}

const PEDIDOS_AO_ARMAZENAMENTO = [
  ['get', null, ['lê frases'], { frases: [A], x: 1 }],
  ['get', 'frases', ['lê frases'], { frases: [A] }],
  ['get', ['frases', 'falta'], ['lê frases'], { frases: [A] }],
  ['get', { frases: [] }, ['lê frases'], { frases: [A] }],
  ['get', 'x', [], { x: 1 }],
  ['get', ['x', 'falta'], [], { x: 1 }],
  ['get', { y: 5, x: 0 }, [], { y: 5, x: 1 }],
  ['set', { frases: [B] }, ['grava frases'], undefined],
  ['set', { x: 2 }, [], undefined],
  ['remove', 'frases', [], undefined],
];

async function armazenamentoSoViraPassoQuandoTocaFrases() {
  for (const [metodo, pedido, passosEsperados, resposta] of PEDIDOS_AO_ARMAZENAMENTO) {
    const { passos, mundo } = mundoQueAnota({ frases: [A], x: 1 });
    const obtida = await armazenamento(mundo)[metodo](pedido);
    assert.deepEqual({ passos, obtida }, { passos: passosEsperados, obtida: resposta }, `${metodo} ${JSON.stringify(pedido)}`);
  }
}

async function outraAreaNuncaViraPassoEDevolveACopia() {
  const { passos, mundo } = mundoQueAnota({ frases: [A] });
  const sync = armazenamento(mundo, { frases: [B] });
  await sync.set({ frases: [A, B] });
  const lida = await sync.get(null);
  lida.frases[0].texto = 'mudou';
  assert.deepEqual({ passos, depois: await sync.get('frases') }, { passos: [], depois: { frases: [A, B] } });
}

async function aRespostaVaiParaODevolverSemPromessa() {
  const { passos, mundo } = mundoQueAnota({ frases: [A], x: 1 });
  const local = armazenamento(mundo);
  const devolvidas = [];
  const retornos = [
    local.get('frases', r => devolvidas.push(r)),
    local.set({ x: 3 }, r => devolvidas.push(r)),
    local.remove(['x'], r => devolvidas.push(r)),
  ];
  await new Promise(r => setImmediate(r));
  assert.deepEqual({ retornos, devolvidas, passos, dados: mundo.dados },
    { retornos: [undefined, undefined, undefined], devolvidas: [{ frases: [A] }, undefined, undefined], passos: ['lê frases'], dados: { frases: [A] } });
}

const execucao = (final, { fim = new Map(), parados = [] } = {}) => ({ mundo: { dados: { frases: final } }, fim, parados });
const cenario = (frases, ...opsDeCadaAtor) => ({ dados: frases === undefined ? {} : { frases }, atores: opsDeCadaAtor.map(ops => ({ ops })) });
const editarA = { tipo: 'editar', ids: [1], campos: { status: 'exported' } };
const apagarB = { tipo: 'apagar', ids: [2] };
const acrescentarC = { tipo: 'acrescentarSeNova', frase: { texto: 'C', exportadaTxt: true } };

const CONFERENCIAS = [
  ['uma ordem em série casa', cenario([A, B], [editarA], [apagarB]), execucao([{ ...A, status: 'exported' }]), []],
  ['a outra ordem também casa', cenario([A, B], [apagarB, editarA]), execucao([{ ...A, status: 'exported' }]), []],
  ['a Frase nova não leva o id nem o que não é projetado', cenario([A], [acrescentarC], [acrescentarC]), execucao([NOVA, A]), []],
  ['sem frases no começo', cenario(undefined, [acrescentarC]), execucao([NOVA]), []],
  ['impasse e ator que falhou', cenario([A], []),
    execucao([A], { parados: ['Um', 'Dois'], fim: new Map([['Tres', { erro: 'Error: boom\n    at x' }], ['Quatro', { r: 1 }], ['Cinco', { erro: 'TypeError: y' }]]) }),
    ['impasse: Um, Dois não terminou', 'Tres falhou: Error: boom', 'Cinco falhou: TypeError: y']],
  ['ids repetidos e duplicata', cenario([A], []), execucao([A, A]), ['ids repetidos: 1, 1',
    `duplicata: a mesma Frase entrou duas vezes; ${SERIE}\n      final: ${projecaoDeA}\n             ${projecaoDeA}\n`
    + `      em série, por exemplo: ${projecaoDeA}`]],
  ['a Frase repetida que uma ordem em série também repete não é duplicata', cenario([A], [{ tipo: 'acrescentar', frase: { texto: 'A', keywords: ['a@1'] } }]),
    execucao([A, { ...A, id: 7 }, B]), [`perda: uma escrita sumiu (Frase, campo ou apagamento); ${SERIE}\n`
      + `      final: ${projecaoDeA}\n             {"texto":"A","keywords":["a@1"]}\n             {"texto":"B","status":"new"}\n`
      + `      em série, por exemplo: ${projecaoDeA}\n                             {"texto":"A","keywords":["a@1"]}`]],
  ['perda de um campo', cenario([A, B], [editarA], [apagarB]), execucao([A]),
    [`perda: uma escrita sumiu (Frase, campo ou apagamento); ${SERIE}\n      final: ${projecaoDeA}\n`
      + `      em série, por exemplo: {"texto":"A","id":"1","keywords":["a@1"],"status":"exported"}`]],
  ['perda de um apagamento', cenario([A, B], [apagarB]), execucao([B, A]),
    [`perda: uma escrita sumiu (Frase, campo ou apagamento); ${SERIE}\n      final: ${projecaoDeA}\n             ${projecaoDeB}\n`
      + `      em série, por exemplo: ${projecaoDeA}`]],
];

function conferirComparaComTodaOrdemEmSerie() {
  for (const [nome, cenarioDoCaso, execucaoDoCaso, erros] of CONFERENCIAS) assert.deepEqual(conferir(cenarioDoCaso, execucaoDoCaso), erros, nome);
}

const local = ({ pagina }) => pagina.chrome.storage.local;
const atorQueGrava = (nome, frases) => ({ nome, ops: [], rodar: lados => local(lados).set({ frases }) });
const atorQueFalha = nome => ({ nome, ops: [], rodar: () => { throw new Error('boom'); } });
const CENARIOS_DE_RELATORIO = [
  { nome: 'calmo', dados: { frases: [A] }, atores: [{ nome: 'Nada', ops: [], rodar: () => 1 }] },
  { nome: 'sumiu', conhecido: 'perda', dados: { frases: [A] }, atores: [{ nome: 'Nada', ops: [], rodar: () => 1 }] },
  { nome: 'so-o-conhecido', conhecido: 'Quebra falhou', dados: { frases: [A] }, atores: [atorQueFalha('Quebra')] },
  { nome: 'outro-achado', conhecido: 'perda', dados: { frases: [A] }, atores: [atorQueFalha('Quebra'), atorQueGrava('Grava', [B])] },
  { nome: 'duas-gravacoes', dados: { frases: [A] }, atores: [atorQueGrava('Primeiro', [B]), atorQueGrava('Segundo', [B])] },
];

const linhaDo = (nome, ordens, falhas, estado) => `${nome}: ${ordens} ordens, ${falhas} contraexemplos, N ms → ${estado}`;
const perdaDeAParaB = `    → perda: uma escrita sumiu (Frase, campo ou apagamento); ${SERIE}\n`
  + '      final: {"texto":"B","status":"new"}\n'
  + `      em série, por exemplo: ${projecaoDeA}`;
const contraexemploDasDuasGravacoes = quantas => [`  contraexemplo (o primeiro de ${quantas}):`,
  '     1. Primeiro       grava frases  ?', '     2. Segundo        grava frases  ?', perdaDeAParaB];
const RELATORIO_INTEIRO = [
  linhaDo('calmo', 1, 0, 'PASSOU'),
  linhaDo('sumiu', 1, 0, 'PASSOU (o achado conhecido sumiu: atualize o cenário)'),
  linhaDo('so-o-conhecido', 1, 1, 'FALHOU SÓ COMO O ACHADO CONHECIDO (Quebra falhou)'),
  '  contraexemplo (o primeiro de 1):', '    → Quebra falhou: Error: boom',
  linhaDo('outro-achado', 1, 1, 'FALHOU'),
  '  contraexemplo (o primeiro de 1):', '     1. Grava          grava frases  ?', '    → Quebra falhou: Error: boom', perdaDeAParaB,
  linhaDo('duas-gravacoes', 2, 2, 'FALHOU'), ...contraexemploDasDuasGravacoes(2),
];

const RELATORIOS = [
  [[], RELATORIO_INTEIRO, 1],
  [['--cenario'], RELATORIO_INTEIRO, 1],
  [['--cenario', 'calmo'], [linhaDo('calmo', 1, 0, 'PASSOU')], 0],
  [['--cenario', 'so-o-conhecido'], RELATORIO_INTEIRO.slice(2, 5), 0],
  [['--cenario', 'sumiu'], [linhaDo('sumiu', 1, 0, 'PASSOU (o achado conhecido sumiu: atualize o cenário)')], 1],
  [['--um', '--cenario', 'duas-gravacoes'], [linhaDo('duas-gravacoes', 1, 1, 'FALHOU'), ...contraexemploDasDuasGravacoes(1)], 1],
  [['--cenario', 'nenhum'], [], 0],
];

async function relatorioDe(argumentos) {
  const linhas = [];
  const { argv, exitCode } = process;
  const log = console.log;
  process.argv = [argv[0], 'explorar.js', ...argumentos];
  console.log = (...partes) => linhas.push(...partes.join(' ').replace(/, \d+ ms → /, ', N ms → ').split('\n'));
  try {
    await principal();
    return { linhas, saida: process.exitCode };
  } finally {
    Object.assign(process, { argv, exitCode });
    console.log = log;
  }
}

async function principalRelataCadaCenarioEDecideASaida() {
  const reais = CENARIOS.splice(0, CENARIOS.length, ...CENARIOS_DE_RELATORIO);
  try {
    for (const [argumentos, linhas, saida] of RELATORIOS) {
      assert.deepEqual(await relatorioDe(argumentos), { linhas: linhas.flatMap(l => l.split('\n')), saida }, argumentos.join(' '));
    }
  } finally {
    CENARIOS.splice(0, CENARIOS.length, ...reais);
  }
}

function aLinhaDeComandoRodaOPrincipal() {
  const saida = execFileSync(process.execPath, [path.join(__dirname, 'explorar.js'), '--cenario', 'nenhum'], { encoding: 'utf8' });
  assert.deepEqual({ saida, nomes: CENARIOS.map(c => c.nome) },
    { saida: '', nomes: ['foto-e-painel', 'carregar-com-conta', 'legenda-e-painel', 'legenda-repetida'] });
}

(async () => {
  await armazenamentoSoViraPassoQuandoTocaFrases();
  await outraAreaNuncaViraPassoEDevolveACopia();
  await aRespostaVaiParaODevolverSemPromessa();
  conferirComparaComTodaOrdemEmSerie();
  await principalRelataCadaCenarioEDecideASaida();
  aLinhaDeComandoRodaOPrincipal();
  console.log('ok test_explorar');
})().catch(erro => {
  console.error(erro);
  process.exitCode = 1;
});

'use strict';

const assert = require('assert');
const crypto = require('crypto');

const { prepararAPagina, noComId } = require('./painel_de_mentira.js');

const { documento, raiz } = prepararAPagina();
const { textoDaVoz } = raiz;
raiz.Contexto = { haQuanto: () => 'há pouco' };
const chamadas = [];
raiz.CartaoDaIA = { baixarConexao: () => chamadas.push('baixarConexao'), trocarChave: () => chamadas.push('trocarChave') };
globalThis.setInterval = () => {};

const chip = noComId(documento, 'shell-chip');
const chipNome = noComId(documento, 'shell-chip-nome');
const chipEstado = noComId(documento, 'shell-chip-estado', 'shell-chip__estado');
const chipAvatar = noComId(documento, 'shell-avatar');
const resumo = noComId(documento, 'cfg-conta-resumo');
const corpo = noComId(documento, 'cfg-conta-corpo');
const outroLugar = noComId(documento, 'outro-lugar');

require('../painel/painel-conta.js');
documento.disparar('DOMContentLoaded');
const { Conta } = raiz;
Conta.aoPedir({ entrar: () => chamadas.push('entrar'), sair: () => chamadas.push('sair'), tentarDeNovo: () => chamadas.push('tentarDeNovo') });
Conta.montarCartao(outroLugar);

const RETRATO_DA_MATRIZ = '77f8c00616bff6f82ae6cbeb6dd829f9c1801c739ba7c57b3afdbb2f2903d0a6';

function forma(no) {
  if (no.nodeType === 3) return no.data;
  const dataset = Object.keys(no.dataset || {}).length ? { dataset: no.dataset } : {};
  const atributos = Object.fromEntries([...no.atributos.entries()].sort());
  return {
    tag: no.localName, classe: no.className, id: no.id, type: no.type, hidden: Boolean(no.hidden), title: no.title, src: no.src, alt: no.alt,
    ...dataset, atributos, filhos: no.childNodes.map(forma),
  };
}

const lugares = () => [chip, chipNome, chipEstado, chipAvatar, resumo, corpo, outroLugar].map(forma);
const textoDoChip = () => [chipNome.textContent, chipEstado.textContent, chipEstado.hidden, chip.title, chipEstado.className];

const CONTAS = [null, { displayName: 'Ana Silva', photoURL: '' }, { displayName: '', photoURL: 'https://exemplo.test/ana.png' }];
const DADOS = [{ n: 3, total: 10 }, { n: 3, total: 10, detalhes: 'HTTP 500' }];
const CODIGOS = [undefined, 'outdated_connection', 'other_account_unsent', 'legacy_key_unbound', 'outro'];

const codigosDa = situacao => (situacao === 'chavePendente' ? CODIGOS : [undefined]);

function dadosDa(situacao) {
  return DADOS.flatMap(dados => codigosDa(situacao).map(codigo => ({ ...dados, ...(codigo && { codigo }) })));
}

function cenariosDaConta(conta) {
  const dasSituacoes = Object.values(Conta.SITUACOES).flatMap(situacao => dadosDa(situacao).map(dados => ({ conta, situacao, dados })));
  return [{ conta, falhaNoLogin: 'falha no login' }, { conta, falhaNoLogin: null }, ...dasSituacoes];
}

const cenarios = () => CONTAS.flatMap(cenariosDaConta);

function mostrar({ conta, situacao, dados, falhaNoLogin }) {
  Conta.mostrarConta(conta);
  if (situacao) Conta.mostrarSincronizacao(situacao, dados);
  Conta.mostrarFalhaNoLogin(falhaNoLogin || null);
}

function oRetratoDaMatriz() {
  const linhas = cenarios().map(cenario => {
    mostrar(cenario);
    return [lugares(), textoDoChip()];
  });
  return crypto.createHash('sha256').update(JSON.stringify(linhas)).digest('hex');
}

function semContaOChipConvida() {
  Conta.mostrarConta(null);
  assert.deepStrictEqual(textoDoChip().slice(0, 4), [textoDaVoz('SHL-05.semContaNome'), textoDaVoz('SHL-05.semContaEstado'), false, textoDaVoz('SHL-05.semConta')]);
  assert.strictEqual(resumo.textContent, textoDaVoz('SHL-05.semConta'));
  assert.strictEqual(chipAvatar.textContent, '?');
  assert.strictEqual(corpo.querySelectorAll('button').length, 1);
  assert.strictEqual(corpo.querySelector('button').textContent, textoDaVoz('CFG-06.botao'));
  assert.strictEqual(outroLugar.textContent, corpo.textContent, 'o outro lugar desenha o mesmo cartão');
}

function comContaOChipDizOEstado() {
  Conta.mostrarConta({ displayName: 'Ana Silva', photoURL: '' });
  assert.deepStrictEqual(textoDoChip(), ['Ana Silva', '', true, 'Ana Silva', 'shell-chip__estado']);
  assert.strictEqual(resumo.textContent, 'Ana Silva');
  assert.strictEqual(chipAvatar.textContent, 'A');
  Conta.mostrarSincronizacao('sincronizado');
  assert.strictEqual(chipEstado.textContent, textoDaVoz('CFG-02', { quando: 'há pouco' }));
  assert.strictEqual(resumo.textContent, textoDaVoz('CFG-27', { nome: 'Ana Silva', estado: chipEstado.textContent }));
  Conta.mostrarSincronizacao('parcial', { n: 2, total: 5 });
  assert.strictEqual(chipEstado.className, 'shell-chip__estado shell-chip__estado--erro');
  assert.strictEqual(chipEstado.textContent, textoDaVoz('SHL-05.parcial', { n: 2, total: 5 }));
  assert.throws(() => Conta.mostrarSincronizacao('inventada'), /Situação de sincronização desconhecida: inventada/);
}

function osBotoesChamamOsPedidos() {
  Conta.mostrarConta({ displayName: 'Ana', photoURL: '' });
  Conta.mostrarSincronizacao('expirou');
  const nomes = corpo.querySelectorAll('button').map(botao => botao.textContent);
  assert.deepStrictEqual(nomes, [textoDaVoz('CFG-08.entrar')]);
  corpo.querySelector('button').disparar('click');
  Conta.mostrarSincronizacao('semSincronizar');
  corpo.querySelectorAll('button').find(botao => botao.textContent === textoDaVoz('CFG-03.tentarDeNovo')).disparar('click');
  corpo.querySelectorAll('button').find(botao => botao.textContent === textoDaVoz('CFG-23')).disparar('click');
  Conta.mostrarSincronizacao('chavePendente', { codigo: 'outdated_connection' });
  corpo.querySelectorAll('button').find(botao => botao.textContent === textoDaVoz('CFG-35.erroAtualizar')).disparar('click');
  Conta.mostrarSincronizacao('chavePendente', { codigo: 'legacy_key_unbound' });
  corpo.querySelectorAll('button').find(botao => botao.textContent === textoDaVoz('CFG-35.erroTrocar')).disparar('click');
  Conta.mostrarConta(null);
  corpo.querySelector('button').disparar('click');
  assert.deepStrictEqual(chamadas.splice(0), ['entrar', 'tentarDeNovo', 'sair', 'baixarConexao', 'trocarChave', 'entrar']);
}

function oSincronizadoGuardaQuandoFicouEmDia() {
  Conta.mostrarConta({ displayName: 'Ana', photoURL: '' });
  const agora = Date.now;
  Date.now = () => 1000;
  Conta.mostrarSincronizacao('sincronizado');
  Date.now = () => 9000;
  Conta.mostrarSincronizacao('sincronizado', { sincronizadoEm: 5 });
  Date.now = agora;
  Conta.mostrarSincronizacao('sincronizando');
  assert.strictEqual(chipEstado.textContent, textoDaVoz('CFG-01'));
}

function oFocoNoBotaoAcompanhaORedesenho() {
  Conta.mostrarConta(null);
  corpo.querySelector('button').focus();
  Conta.mostrarFalhaNoLogin('de novo');
  assert.strictEqual(documento.activeElement.textContent, textoDaVoz('CFG-06.botao'));
  assert.ok(corpo.contains(documento.activeElement));
  Conta.mostrarConta({ displayName: 'Ana', photoURL: '' });
  assert.ok(corpo.contains(documento.activeElement));
}

semContaOChipConvida();
comContaOChipDizOEstado();
osBotoesChamamOsPedidos();
oSincronizadoGuardaQuandoFicouEmDia();
oFocoNoBotaoAcompanhaORedesenho();
assert.strictEqual(oRetratoDaMatriz(), RETRATO_DA_MATRIZ, 'a conta, o chip ou o cartão mudou em alguma combinação de conta, sincronização e falha');
console.log('painel da conta ok');

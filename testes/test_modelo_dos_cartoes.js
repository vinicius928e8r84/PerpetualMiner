'use strict';

const assert = require('assert');
const { DocumentoFalso } = require('./dom-falso.js');

const documento = new DocumentoFalso();
globalThis.document = documento;
globalThis.Option = function Option(texto, valor) {
  const no = documento.createElement('option');
  no.textContent = texto;
  no.value = valor;
  return no;
};

const SITUACAO = { LIGADA: 'ligada', CONECTANDO: 'conectando', DESLIGADA: 'desligada' };
const resposta = { atual: { status: 200, dados: null } };
const aoAcompanhar = [];
const aoAbrirASecao = [];
const aoMudarOStorage = [];
const pedidos = [];

globalThis.PerpetualMiner = {
  textoDaVoz: id => id,
  ConversaComOAnki: { pedir: async pedido => { pedidos.push(pedido); return resposta.atual; } },
  PedidoAoAnki: { estadoDoModelo: () => 'estado', escolherOModelo: modelo => `escolher:${modelo}` },
  ConexaoAnki: { SITUACAO, acompanhar: funcao => aoAcompanhar.push(funcao) },
  Shell: { aoAbrirASecao: (secao, funcao) => aoAbrirASecao.push([secao, funcao]) },
  ChaveDaOpenAI: { MARCA: 'marca' },
  ColunaDoChatGPT: { linhaDoPlano: () => documento.createElement('p') },
};
globalThis.chrome = { storage: { onChanged: { addListener: funcao => aoMudarOStorage.push(funcao) } } };

require('../veio/componentes.js');
require('../painel/painel-ia-modelo.js');
const { ModeloDosCartoes } = globalThis.PerpetualMiner;
documento.disparar('DOMContentLoaded');

const lugar = { prefixo: 'cfg' };
const no = ModeloDosCartoes.avancado(lugar);
const acompanhar = aoAcompanhar[0];

const leitura = dados => { resposta.atual = { status: 200, dados }; return ModeloDosCartoes.reler(); };
const detalhes = () => no.querySelector('details');
const corpoDoAvancado = () => (detalhes() ? detalhes().textContent : '');

const comOModelo = (extra = {}) => ({ modelos: ['gpt-a', 'gpt-b'], escolha: 'automatico', paga: 'chave', ...extra });

(async () => {
  assert.strictEqual(detalhes(), null, 'sem leitura, não há nada para mostrar');

  for (const dados of [null, {}, { modelos: 'gpt-a', escolha: 'automatico', paga: 'chave' }, { modelos: [], escolha: 7, paga: 'chave' }]) {
    await leitura(dados);
    assert.strictEqual(detalhes(), null, `uma leitura que não é o estado do modelo não desenha: ${JSON.stringify(dados)}`);
  }

  await leitura(comOModelo({ paga: null }));
  assert.strictEqual(detalhes(), null, 'sem quem pague, não há o que mostrar');

  await leitura(comOModelo());
  assert.ok(detalhes(), 'com quem pague, o painel aparece');
  assert.strictEqual(detalhes().open, false, 'sem novidade, nasce fechado');
  assert.ok(corpoDoAvancado().includes('CFG-44.chave'));
  assert.strictEqual(detalhes().querySelector('select').id, 'cfg-ia-modelo');

  await leitura(comOModelo({ aviso: { modelo: 'gpt-a', saida: '2026-12-01' } }));
  assert.strictEqual(detalhes().open, true, 'o aviso da saída abre o painel');
  assert.ok(detalhes().querySelector('.ia-modelo__aviso'));

  await leitura(comOModelo({ trocou: { de: 'gpt-a', porque: 'pagador' } }));
  assert.strictEqual(detalhes().open, true, 'a troca abre o painel');
  assert.ok(corpoDoAvancado().includes('CFG-45.trocou'));

  resposta.atual = { status: 503, dados: null };
  await ModeloDosCartoes.reler();
  assert.strictEqual(detalhes().open, false, 'o erro não abre o painel, mesmo com a novidade da leitura anterior');
  await leitura(comOModelo({ trocou: { de: 'gpt-a', porque: 'pagador' } }));

  detalhes().open = false;
  detalhes().disparar('toggle');
  await leitura(comOModelo({ trocou: { de: 'gpt-a', porque: 'outro' } }));
  assert.strictEqual(detalhes().open, false, 'o que a pessoa fechou continua fechado');
  assert.ok(corpoDoAvancado().includes('CFG-44.trocou'));

  resposta.atual = { status: 503, dados: null };
  await ModeloDosCartoes.reler();
  assert.ok(corpoDoAvancado().includes('CFG-44.erro'), 'o erro de 503 mostra a nota e Tentar de novo');
  assert.ok(detalhes().querySelector('button'));

  acompanhar(SITUACAO.DESLIGADA);
  assert.strictEqual(detalhes(), null, 'ao desligar, o que havia (mesmo o erro) é esquecido');

  const antes = pedidos.length;
  acompanhar(SITUACAO.DESLIGADA);
  assert.strictEqual(detalhes(), null);
  assert.strictEqual(pedidos.length, antes, 'desligada de novo, sem estado, não faz nada');

  resposta.atual = { status: 200, dados: comOModelo() };
  acompanhar(SITUACAO.LIGADA);
  await new Promise(resolver => setImmediate(resolver));
  assert.ok(detalhes(), 'ao ligar, relê o estado');

  const rodadaAntes = pedidos.length;
  acompanhar(SITUACAO.LIGADA);
  await new Promise(resolver => setImmediate(resolver));
  assert.strictEqual(pedidos.length, rodadaAntes, 'ligada de novo, sem ter desligado, não relê');

  acompanhar(SITUACAO.CONECTANDO);
  acompanhar(SITUACAO.DESLIGADA);
  assert.strictEqual(detalhes(), null, 'conectando não conta como desligar, mas desligar depois esquece');

  console.log('ok');
})().catch(erro => { console.error(erro); process.exit(1); });

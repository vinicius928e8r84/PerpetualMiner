'use strict';

const assert = require('assert');

globalThis.PerpetualMiner = {};
require('../lib/pedido-ao-anki.js');
require('../lib/envio-gravado.js');
require('../lib/apagar-frases-pendente.js');
const { ApagarFrasesPendente, ConversaComOAnki } = globalThis.PerpetualMiner;

const ENDERECO = 'http://127.0.0.1:8766';

function montar({ gravado, conexao = 'responde' }) {
  const armazenamento = { ...gravado };
  const alarmes = new Map();
  const pedidos = [];
  const chrome = {
    storage: { local: {
      get: async chaves => Object.fromEntries(Object.keys(chaves).map(chave => [chave, chave in armazenamento ? armazenamento[chave] : chaves[chave]])),
      set: async valores => { Object.assign(armazenamento, valores); },
      remove: async chave => { delete armazenamento[chave]; },
    } },
    alarms: {
      get: async nome => alarmes.get(nome),
      create: async (nome, opcoes) => { alarmes.set(nome, opcoes); },
      clear: async nome => alarmes.delete(nome),
    },
  };
  const transporte = async pedido => {
    pedidos.push(`${pedido.metodo} ${pedido.caminho}`);
    if (conexao === 'fora') throw new TypeError('Failed to fetch');
    return conexao === 'responde' ? { status: 200, texto: '{"ok":true}' } : { status: 404, texto: '{"error":"not_found"}' };
  };
  const pendente = ApagarFrasesPendente.criar({ chrome, conversa: ConversaComOAnki.criar({ transporte }) });
  return { chrome, armazenamento, alarmes, pedidos, pendente };
}

const MARCA = { pm_envio: { envios: [], apagarFrases: true } };

async function aConexaoQueConfirmaTiraAMarcaEOAlarme() {
  const { armazenamento, alarmes, pedidos, pendente } = montar({ gravado: MARCA });
  await pendente.conferir();
  assert.deepStrictEqual(pedidos, ['POST /jobs/apagar-frases'], 'pede o apagamento à Conexão');
  assert.strictEqual('pm_envio' in armazenamento, false, 'a Conexão confirmou: a marca sai');
  assert.strictEqual(alarmes.size, 0, 'e o alarme também');
}

async function umEnvioNovoContinuaAcompanhadoSemAMarca() {
  const envios = [{ id: 'a', lang: 'en', ids: [1], jobId: null, falhaAoCriar: null }];
  const { armazenamento, pendente } = montar({ gravado: { pm_envio: { envios, apagarFrases: true } } });
  await pendente.conferir();
  assert.deepStrictEqual(armazenamento.pm_envio, { envios }, 'um Envio novo continua acompanhado; só a marca sai');
}

async function aConexaoForaDeixaAMarcaEOAlarme() {
  const { armazenamento, alarmes, pedidos, pendente } = montar({ gravado: MARCA, conexao: 'fora' });
  await pendente.cuidar();
  assert.strictEqual(alarmes.get(ApagarFrasesPendente.ALARME).periodInMinutes, 0.5, 'com a marca, o alarme de 30 s existe');
  await pendente.conferir();
  assert.strictEqual(pedidos.length, 1);
  assert.deepStrictEqual(armazenamento.pm_envio, MARCA.pm_envio, 'a Conexão não respondeu: a marca fica');
  assert.strictEqual(alarmes.size, 1, 'e o alarme também, para a próxima volta');
}

async function aConexaoComErroDeixaAMarcaEOAlarme() {
  const { armazenamento, alarmes, pedidos, pendente } = montar({ gravado: MARCA, conexao: 'erro' });
  await pendente.cuidar();
  await pendente.conferir();
  assert.strictEqual(pedidos.length, 1);
  assert.deepStrictEqual(armazenamento.pm_envio, MARCA.pm_envio, 'a Conexão respondeu com erro: a marca fica');
  assert.strictEqual(alarmes.size, 1, 'e o alarme também');
}

async function semMarcaNadaSaiNemAcordaOAlarme() {
  const { alarmes, pedidos, pendente } = montar({ gravado: {} });
  await pendente.cuidar();
  await pendente.conferir();
  assert.deepStrictEqual(pedidos, [], 'sem marca, nada sai');
  assert.strictEqual(alarmes.size, 0, 'e nenhum alarme acorda o service worker à toa');
}

async function acordarDeNovoNaoEmpurraOAlarmeQueJaExiste() {
  const { alarmes, pendente } = montar({ gravado: MARCA });
  alarmes.set(ApagarFrasesPendente.ALARME, { periodInMinutes: 0.5, delayInMinutes: 0.1 });
  await pendente.cuidar();
  assert.strictEqual(alarmes.get(ApagarFrasesPendente.ALARME).delayInMinutes, 0.1, 'acordar de novo não empurra o alarme que já existe');
}

async function ligarOuveOAlarmeEAMudancaDaMarca() {
  const { chrome, armazenamento, alarmes, pedidos } = montar({ gravado: MARCA });
  const ouvintes = [];
  chrome.alarms.onAlarm = { addListener: ouvinte => ouvintes.push(['onAlarm', ouvinte]) };
  chrome.storage.onChanged = { addListener: ouvinte => ouvintes.push(['onChanged', ouvinte]) };
  globalThis.PerpetualMiner.PareamentoComOAnki = { pedirAssinado: async (endereco, pedido) => {
    pedidos.push(`${pedido.metodo} ${endereco}${pedido.caminho}`);
    return { status: 200, texto: '{"ok":true}' };
  } };
  ApagarFrasesPendente.ligar({ chrome });
  const aguardar = () => new Promise(r => setImmediate(r));
  const ouvinte = evento => async (...args) => { ouvintes.find(([nome]) => nome === evento)[1](...args); await aguardar(); };
  await aguardar();
  assert.strictEqual(alarmes.has(ApagarFrasesPendente.ALARME), true, 'ao ligar, com a marca, o alarme é criado');

  await ouvinte('onAlarm')({ name: 'pm-virada-do-dia' });
  assert.deepStrictEqual(pedidos, [], 'outro alarme não pede nada');
  await ouvinte('onAlarm')({ name: ApagarFrasesPendente.ALARME });
  assert.deepStrictEqual(pedidos, [`POST ${ENDERECO}/jobs/apagar-frases`], 'a volta do alarme pede o apagamento, assinado, ao endereço da Conexão');
  assert.strictEqual('pm_envio' in armazenamento, false, 'e a Conexão confirmou: a marca sai');

  armazenamento.pm_envio = MARCA.pm_envio;
  await ouvinte('onChanged')({ outra: {} }, 'local');
  assert.strictEqual(alarmes.has(ApagarFrasesPendente.ALARME), false, 'outra chave não liga o alarme');
  await ouvinte('onChanged')({ pm_envio: {} }, 'local');
  assert.strictEqual(alarmes.has(ApagarFrasesPendente.ALARME), true, 'a marca nova liga o alarme');
  delete armazenamento.pm_envio;
  await ouvinte('onChanged')({ pm_envio: {} }, 'local');
  assert.strictEqual(alarmes.has(ApagarFrasesPendente.ALARME), false, 'sem marca, o alarme sai');

  const semAlarmes = { storage: chrome.storage };
  const ouvidos = ouvintes.length;
  ApagarFrasesPendente.ligar({ chrome: semAlarmes, endereco: ENDERECO });
  assert.strictEqual(ouvintes.length, ouvidos, 'sem `alarms` nada é ligado');
}

const CASOS = [
  aConexaoQueConfirmaTiraAMarcaEOAlarme, umEnvioNovoContinuaAcompanhadoSemAMarca, aConexaoForaDeixaAMarcaEOAlarme, aConexaoComErroDeixaAMarcaEOAlarme,
  semMarcaNadaSaiNemAcordaOAlarme, acordarDeNovoNaoEmpurraOAlarmeQueJaExiste, ligarOuveOAlarmeEAMudancaDaMarca,
];

(async () => {
  for (const caso of CASOS) await caso();
  console.log('test_apagar_frases_pendente.js ok');
})().catch(erro => { console.error(erro); process.exit(1); });

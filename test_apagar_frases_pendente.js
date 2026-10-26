'use strict';

// O Apagar tudo que a Conexão não confirmou (a marca `apagarFrases` em `pm_envio`) é pedido de novo pelo service worker,
// mesmo com todo painel fechado: um alarme de 30 s existe enquanto a marca existe. Roda sem navegador:
// `node test_apagar_frases_pendente.js`.

const assert = require('assert');

globalThis.PerpetualMiner = {};
require('./lib/pedido-ao-anki.js');
require('./lib/apagar-frases-pendente.js');
const { ApagarFrasesPendente, PedidoAoAnki } = globalThis.PerpetualMiner;

const ENDERECO = 'http://127.0.0.1:8766';

/** Um `chrome` mínimo: o armazenamento local e os alarmes; `pedidos` anota o que saiu para a Conexão. */
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
  const pedir = async (endereco, pedido) => {
    pedidos.push(`${pedido.metodo} ${pedido.caminho}`);
    if (conexao === 'fora') throw new TypeError('Failed to fetch');
    return { ok: conexao === 'responde', status: conexao === 'responde' ? 200 : 404 };
  };
  const pendente = ApagarFrasesPendente.criar({ chrome, PedidoAoAnki: { ...PedidoAoAnki, pedir }, endereco: ENDERECO });
  return { chrome, armazenamento, alarmes, pedidos, pendente };
}

const MARCA = { pm_envio: { envios: [], apagarFrases: true } };

(async () => {
  {
    const { armazenamento, alarmes, pedidos, pendente } = montar({ gravado: MARCA });
    await pendente.conferir();
    assert.deepStrictEqual(pedidos, ['POST /jobs/apagar-frases'], 'pede o apagamento à Conexão');
    assert.strictEqual('pm_envio' in armazenamento, false, 'a Conexão confirmou: a marca sai');
    assert.strictEqual(alarmes.size, 0, 'e o alarme também');
  }
  {
    const envios = [{ id: 'a', lang: 'en', ids: [1], jobId: null, falhaAoCriar: null }];
    const { armazenamento, pendente } = montar({ gravado: { pm_envio: { envios, apagarFrases: true } } });
    await pendente.conferir();
    assert.deepStrictEqual(armazenamento.pm_envio, { envios }, 'um Envio novo continua acompanhado; só a marca sai');
  }
  {
    const { armazenamento, alarmes, pedidos, pendente } = montar({ gravado: MARCA, conexao: 'fora' });
    await pendente.cuidar();
    assert.strictEqual(alarmes.get(ApagarFrasesPendente.ALARME).periodInMinutes, 0.5, 'com a marca, o alarme de 30 s existe');
    await pendente.conferir();
    assert.strictEqual(pedidos.length, 1);
    assert.deepStrictEqual(armazenamento.pm_envio, MARCA.pm_envio, 'a Conexão não respondeu: a marca fica');
    assert.strictEqual(alarmes.size, 1, 'e o alarme também, para a próxima volta');
  }
  {
    // Uma Conexão antiga que responde 404 à rota: não confirmou, a marca fica.
    const { armazenamento, alarmes, pedidos, pendente } = montar({ gravado: MARCA, conexao: 'erro' });
    await pendente.cuidar();
    await pendente.conferir();
    assert.strictEqual(pedidos.length, 1);
    assert.deepStrictEqual(armazenamento.pm_envio, MARCA.pm_envio, 'a Conexão respondeu com erro: a marca fica');
    assert.strictEqual(alarmes.size, 1, 'e o alarme também');
  }
  {
    const { alarmes, pedidos, pendente } = montar({ gravado: {} });
    await pendente.cuidar();
    await pendente.conferir();
    assert.deepStrictEqual(pedidos, [], 'sem marca, nada sai');
    assert.strictEqual(alarmes.size, 0, 'e nenhum alarme acorda o service worker à toa');
  }
  {
    const { alarmes, pendente } = montar({ gravado: MARCA });
    alarmes.set(ApagarFrasesPendente.ALARME, { periodInMinutes: 0.5, delayInMinutes: 0.1 });
    await pendente.cuidar();
    assert.strictEqual(alarmes.get(ApagarFrasesPendente.ALARME).delayInMinutes, 0.1, 'acordar de novo não empurra o alarme que já existe');
  }
  {
    // A ligação do service worker (`background.js` chama `ligar`): ao ligar e a cada mudança de `pm_envio` o alarme é conferido,
    // a volta do alarme pede o apagamento, e outro alarme ou outra chave não fazem nada.
    const { chrome, armazenamento, alarmes, pedidos } = montar({ gravado: MARCA });
    const ouvintes = [];
    chrome.alarms.onAlarm = 'onAlarm';
    chrome.storage.onChanged = 'onChanged';
    const ouvirChrome = (evento, ouvinte) => ouvintes.push([evento, ouvinte]);
    globalThis.PerpetualMiner.PedidoAoAnki = { ...PedidoAoAnki, pedir: async (endereco, pedido) => { pedidos.push(`${pedido.metodo} ${pedido.caminho}`); return { ok: true }; } };
    ApagarFrasesPendente.ligar({ chrome, ouvirChrome, endereco: ENDERECO });
    // O ouvinte não devolve a promessa do que dispara: o teste espera o que está pendente.
    const aguardar = () => new Promise(r => setImmediate(r));
    const ouvinte = evento => async (...args) => { ouvintes.find(([nome]) => nome === evento)[1](...args); await aguardar(); };
    await aguardar();
    assert.strictEqual(alarmes.has(ApagarFrasesPendente.ALARME), true, 'ao ligar, com a marca, o alarme é criado');

    await ouvinte('onAlarm')({ name: 'pm-virada-do-dia' });
    assert.deepStrictEqual(pedidos, [], 'outro alarme não pede nada');
    await ouvinte('onAlarm')({ name: ApagarFrasesPendente.ALARME });
    assert.deepStrictEqual(pedidos, ['POST /jobs/apagar-frases'], 'a volta do alarme pede o apagamento');
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
    ApagarFrasesPendente.ligar({ chrome: semAlarmes, ouvirChrome: () => assert.fail('sem `alarms` nada é ligado'), endereco: ENDERECO });
  }
  console.log('test_apagar_frases_pendente.js ok');
})().catch(erro => { console.error(erro); process.exit(1); });

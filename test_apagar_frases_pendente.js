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
    if (conexao !== 'responde') throw new TypeError('Failed to fetch');
    return { ok: true };
  };
  const pendente = ApagarFrasesPendente.criar({ chrome, PedidoAoAnki: { ...PedidoAoAnki, pedir }, endereco: ENDERECO });
  return { armazenamento, alarmes, pedidos, pendente };
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
  console.log('test_apagar_frases_pendente.js ok');
})().catch(erro => { console.error(erro); process.exit(1); });

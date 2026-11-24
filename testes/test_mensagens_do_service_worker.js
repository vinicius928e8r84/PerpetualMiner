'use strict';

const assert = require('assert');
const fs = require('fs');
const test = require('node:test');
const vm = require('vm');

const ID_DA_EXTENSAO = 'extensao-do-perpetualminer';
const DE_UMA_ABA = { id: ID_DA_EXTENSAO, tab: { id: 7 } };
const DO_PAINEL = { id: ID_DA_EXTENSAO };
const DE_OUTRA_EXTENSAO = { id: 'outra-extensao', tab: { id: 7 } };

const copiaSimples = valor => JSON.parse(JSON.stringify(valor));

function abrirOServiceWorker({ armazenamento = {}, aoMandarParaAAba = async () => ({}) } = {}) {
  const abas = { mensagens: [], consultas: 0 };
  let ouvinte = null;
  const contexto = {
    console,
    navigator: globalThis.navigator,
    fetch: async () => ({ ok: false }),
    setTimeout,
    clearTimeout,
    Date,
    chrome: {
      contextMenus: { create() {}, onClicked: { addListener() {} } },
      runtime: {
        id: ID_DA_EXTENSAO,
        onInstalled: { addListener() {} },
        onMessage: { addListener: funcao => { ouvinte = funcao; } },
        lastError: null,
      },
      storage: {
        local: {
          get(padroes, devolver) {
            const lido = {};
            for (const [chave, valor] of Object.entries(padroes || {})) {
              lido[chave] = Object.hasOwn(armazenamento, chave) ? armazenamento[chave] : valor;
            }
            devolver(lido);
          },
          set(valores, devolver) {
            Object.assign(armazenamento, valores || {});
            if (devolver) devolver();
          },
        },
      },
      tabs: {
        query(_filtro, devolver) { abas.consultas += 1; devolver([]); },
        sendMessage(idDaAba, mensagem, opcoes) {
          abas.mensagens.push({ idDaAba, mensagem, opcoes });
          return aoMandarParaAAba(idDaAba, mensagem, opcoes);
        },
      },
    },
  };
  contexto.importScripts = (...arquivos) => {
    for (const arquivo of arquivos) vm.runInContext(fs.readFileSync(arquivo, 'utf8'), contexto, { filename: arquivo });
  };
  vm.createContext(contexto);
  vm.runInContext(fs.readFileSync('background.js', 'utf8'), contexto, { filename: 'background.js' });
  return { contexto, abas, armazenamento, ouvinte: () => ouvinte };
}

async function mandar(servico, request, remetente) {
  const respostas = [];
  const retorno = servico.ouvinte()(request, remetente, resposta => respostas.push(resposta));
  for (let volta = 0; volta < 20; volta++) await new Promise(resolver => setImmediate(resolver));
  return { retorno, respostas: copiaSimples(respostas) };
}

const frasesGuardadas = servico => copiaSimples(servico.armazenamento.frases || []);

test('copiar no frame de cima: pede o clipboard ao frame 0 da mesma aba e diz se a cópia saiu', async () => {
  for (const [resposta, esperado] of [[{ ok: true }, true], [{ ok: false }, false], [{}, false], [undefined, false], [{ ok: 'sim' }, false]]) {
    const servico = abrirOServiceWorker({ aoMandarParaAAba: async () => resposta });
    const { retorno, respostas } = await mandar(servico, { type: 'COPIAR_NO_FRAME_DE_CIMA', texto: 'hello' }, DE_UMA_ABA);
    assert.strictEqual(retorno, true);
    assert.deepStrictEqual(respostas, [{ ok: esperado }]);
    assert.deepStrictEqual(copiaSimples(servico.abas.mensagens), [
      { idDaAba: 7, mensagem: { type: 'COPIAR_PARA_CLIPBOARD', texto: 'hello' }, opcoes: { frameId: 0 } },
    ]);
  }
});

test('copiar no frame de cima: a aba que não responde vira ok falso', async () => {
  const servico = abrirOServiceWorker({ aoMandarParaAAba: async () => { throw new Error('sem receptor'); } });
  const { retorno, respostas } = await mandar(servico, { type: 'COPIAR_NO_FRAME_DE_CIMA', texto: 'hello' }, DE_UMA_ABA);
  assert.strictEqual(retorno, true);
  assert.deepStrictEqual(respostas, [{ ok: false }]);
});

test('copiar no frame de cima: texto que não é texto ou só tem espaços não vai a lugar nenhum', async () => {
  for (const texto of [undefined, null, 42, ['a'], '', '   \n']) {
    const servico = abrirOServiceWorker();
    const { retorno, respostas } = await mandar(servico, { type: 'COPIAR_NO_FRAME_DE_CIMA', texto }, DE_UMA_ABA);
    assert.strictEqual(retorno, undefined, JSON.stringify(texto));
    assert.deepStrictEqual(respostas, []);
    assert.deepStrictEqual(servico.abas.mensagens, []);
  }
});

test('há vídeo em outro frame: pergunta à aba e só diz que tem quando a resposta diz true', async () => {
  for (const [resposta, esperado] of [[{ temVideo: true }, true], [{ temVideo: false }, false], [{}, false], [undefined, false], [{ temVideo: 'sim' }, false]]) {
    const servico = abrirOServiceWorker({ aoMandarParaAAba: async () => resposta });
    const { retorno, respostas } = await mandar(servico, { type: 'HA_VIDEO_EM_OUTRO_FRAME' }, DE_UMA_ABA);
    assert.strictEqual(retorno, true);
    assert.deepStrictEqual(respostas, [{ temVideo: esperado }]);
    assert.deepStrictEqual(copiaSimples(servico.abas.mensagens), [{ idDaAba: 7, mensagem: { type: 'TEM_VIDEO_NESTE_FRAME' } }]);
  }
});

test('há vídeo em outro frame: a aba que não responde vira sem vídeo', async () => {
  const servico = abrirOServiceWorker({ aoMandarParaAAba: async () => { throw new Error('sem receptor'); } });
  const { retorno, respostas } = await mandar(servico, { type: 'HA_VIDEO_EM_OUTRO_FRAME' }, DE_UMA_ABA);
  assert.strictEqual(retorno, true);
  assert.deepStrictEqual(respostas, [{ temVideo: false }]);
});

test('os dois pedidos entre frames ignoram quem não é uma aba desta extensão', async () => {
  const pedidos = [{ type: 'COPIAR_NO_FRAME_DE_CIMA', texto: 'hello' }, { type: 'HA_VIDEO_EM_OUTRO_FRAME' }];
  const remetentes = [DE_OUTRA_EXTENSAO, DO_PAINEL, { id: ID_DA_EXTENSAO, tab: {} }, { id: ID_DA_EXTENSAO, tab: { id: null } }, {}];
  for (const pedido of pedidos) {
    for (const remetente of remetentes) {
      const servico = abrirOServiceWorker();
      const { retorno, respostas } = await mandar(servico, pedido, remetente);
      assert.strictEqual(retorno, undefined, `${pedido.type} ${JSON.stringify(remetente)}`);
      assert.deepStrictEqual(respostas, []);
      assert.deepStrictEqual(servico.abas.mensagens, []);
    }
  }
});

test('a aba de id zero ainda é uma aba', async () => {
  const servico = abrirOServiceWorker({ aoMandarParaAAba: async () => ({ temVideo: true }) });
  const { retorno, respostas } = await mandar(servico, { type: 'HA_VIDEO_EM_OUTRO_FRAME' }, { id: ID_DA_EXTENSAO, tab: { id: 0 } });
  assert.strictEqual(retorno, true);
  assert.deepStrictEqual(respostas, [{ temVideo: true }]);
});

test('salvar no Histórico com Palavras escolhidas: grava a Frase com elas, sem Palavra automática', async () => {
  const servico = abrirOServiceWorker();
  const { retorno, respostas } = await mandar(servico, {
    type: 'SALVAR_HISTORICO',
    texto: 'Hello brave world',
    origem: 'web',
    contexto: { fonte: 'web', titulo: 'Pagina' },
    palavras: ['brave@1', 42],
    semNuvem: true,
  }, DE_UMA_ABA);
  assert.strictEqual(retorno, true);
  assert.strictEqual(respostas.length, 1);
  assert.strictEqual(respostas[0].ok, true);
  const { frase } = respostas[0];
  assert.deepStrictEqual(
    [frase.texto, frase.streaming, frase.idioma, frase.keywords, frase.autoKeyword, frase.contexto],
    ['Hello brave world', 'web', 'Inglês', ['brave@1', '42'], false, { fonte: 'web', titulo: 'Pagina' }],
  );
  assert.deepStrictEqual(frasesGuardadas(servico).map(guardada => guardada.texto), ['Hello brave world']);
});

test('salvar no Histórico: o Idioma pedido vale, e sem Palavra e sem leitura do Anki a Frase fica sem Palavra', async () => {
  const servico = abrirOServiceWorker();
  const { respostas } = await mandar(servico, {
    type: 'SALVAR_HISTORICO', texto: 'Привет мир', origem: 'youtube', idioma: 'Russo', palavras: [],
  }, DE_UMA_ABA);
  assert.strictEqual(respostas[0].ok, true);
  assert.strictEqual(respostas[0].frase.idioma, 'Russo');
  assert.strictEqual(respostas[0].frase.contexto, undefined);
  assert.deepStrictEqual(respostas[0].frase.keywords, undefined);
});

test('salvar no Histórico: o painel, que não é uma aba, também é atendido', async () => {
  const servico = abrirOServiceWorker();
  const { retorno, respostas } = await mandar(servico, { type: 'SALVAR_HISTORICO', texto: 'Hello again', origem: 'manual', palavras: ['again@1'] }, DO_PAINEL);
  assert.strictEqual(retorno, true);
  assert.strictEqual(respostas[0].ok, true);
  assert.deepStrictEqual(frasesGuardadas(servico).map(guardada => guardada.texto), ['Hello again']);
});

test('salvar no Histórico: o que falha na gravação volta como ok falso com o motivo', async () => {
  const servico = abrirOServiceWorker();
  servico.contexto.chrome.storage.local.get = () => { throw new Error('armazenamento caiu'); };
  const { retorno, respostas } = await mandar(servico, { type: 'SALVAR_HISTORICO', texto: 'Hello', origem: 'web', palavras: ['hello@0'] }, DE_UMA_ABA);
  assert.strictEqual(retorno, true);
  assert.deepStrictEqual(respostas, [{ ok: false, error: 'armazenamento caiu' }]);
});

test('o estado da Mineração automática: ajustes e diário de hoje', async () => {
  const servico = abrirOServiceWorker();
  const { retorno, respostas } = await mandar(servico, { type: 'AUTO_MINER_GET_STATE' }, DO_PAINEL);
  assert.strictEqual(retorno, true);
  assert.strictEqual(respostas.length, 1);
  assert.strictEqual(respostas[0].ok, true);
  assert.deepStrictEqual(respostas[0].state.settings, { en: { enabled: false, dailyLimit: 20 }, ru: { enabled: false, dailyLimit: 20 } });
  assert.deepStrictEqual(Object.keys(respostas[0].state).sort(), ['daily', 'settings']);
});

test('guardar os ajustes da Mineração automática: grava, publica o estado e responde com ele', async () => {
  const servico = abrirOServiceWorker();
  const { retorno, respostas } = await mandar(servico, { type: 'AUTO_MINER_SET_SETTINGS', settings: { en: { enabled: true, dailyLimit: 5 } } }, DO_PAINEL);
  assert.strictEqual(retorno, true);
  assert.strictEqual(respostas[0].ok, true);
  assert.deepStrictEqual(respostas[0].state.settings, { en: { enabled: true, dailyLimit: 5 }, ru: { enabled: false, dailyLimit: 20 } });
  assert.deepStrictEqual(copiaSimples(servico.armazenamento.pm_auto_miner_settings), respostas[0].state.settings);
  assert.deepStrictEqual(copiaSimples(servico.armazenamento.pm_auto_miner_state_view.settings), respostas[0].state.settings);
  assert.strictEqual(servico.abas.consultas, 1);
});

test('guardar os ajustes sem ajustes no pedido: grava os que já valiam', async () => {
  const servico = abrirOServiceWorker();
  const { respostas } = await mandar(servico, { type: 'AUTO_MINER_SET_SETTINGS' }, DO_PAINEL);
  assert.strictEqual(respostas[0].ok, true);
  assert.deepStrictEqual(respostas[0].state.settings, { en: { enabled: false, dailyLimit: 20 }, ru: { enabled: false, dailyLimit: 20 } });
});

test('uma candidata da Mineração automática desligada é pulada, com ok verdadeiro e a ação', async () => {
  const servico = abrirOServiceWorker();
  const { retorno, respostas } = await mandar(servico, {
    type: 'AUTO_MINER_CANDIDATE', texto: 'We left the farmers in the fields', origem: 'test', contexto: { fonte: 'test', titulo: 'T', detalhe: '' }, lang: 'en',
  }, DE_UMA_ABA);
  assert.strictEqual(retorno, true);
  assert.strictEqual(respostas.length, 1);
  assert.strictEqual(respostas[0].ok, true);
  assert.strictEqual(respostas[0].action, 'skip');
  assert.deepStrictEqual(frasesGuardadas(servico), []);
});

test('uma candidata que quebra a decisão volta como ok falso, ação pular e o motivo', async () => {
  const servico = abrirOServiceWorker();
  servico.contexto.chrome.storage.local.get = () => { throw new Error('leitura caiu'); };
  const { retorno, respostas } = await mandar(servico, { type: 'AUTO_MINER_CANDIDATE', texto: 'Hello there world', lang: 'en' }, DE_UMA_ABA);
  assert.strictEqual(retorno, true);
  assert.deepStrictEqual(respostas, [{ ok: false, action: 'skip', reason: 'leitura caiu' }]);
});

test('um tipo desconhecido, sem tipo ou com nome de propriedade do objeto não é atendido por ninguém', async () => {
  for (const request of [{ type: 'NAO_EXISTE' }, {}, { type: 'constructor' }, { type: 'toString' }, { type: '__proto__' }, { type: null }, { type: 'salvar_historico' }]) {
    const servico = abrirOServiceWorker();
    const { retorno, respostas } = await mandar(servico, request, DE_UMA_ABA);
    assert.strictEqual(retorno, undefined, JSON.stringify(request));
    assert.deepStrictEqual(respostas, []);
    assert.deepStrictEqual(servico.abas.mensagens, []);
    assert.deepStrictEqual(frasesGuardadas(servico), []);
  }
});

test('a mensagem de outro tipo de uma outra extensão também não é atendida', async () => {
  const servico = abrirOServiceWorker();
  const { retorno, respostas } = await mandar(servico, { type: 'NAO_EXISTE', texto: 'x' }, DE_OUTRA_EXTENSAO);
  assert.strictEqual(retorno, undefined);
  assert.deepStrictEqual(respostas, []);
});

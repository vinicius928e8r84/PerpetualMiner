'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

process.chdir(path.join(__dirname, '..'));

const copia = valor => (valor === undefined ? undefined : JSON.parse(JSON.stringify(valor)));

const ID_DA_EXTENSAO = 'extensao-do-perpetualminer';
const DE_FORA = { id: 'outra-extensao', tab: { id: 7 } };
const DA_EXTENSAO_SEM_ABA = { id: ID_DA_EXTENSAO };
const DA_ABA_7 = { id: ID_DA_EXTENSAO, tab: { id: 7 }, frameId: 3 };
const DA_ABA_ZERO = { id: ID_DA_EXTENSAO, tab: { id: 0 } };

function mundo({ aoMandarParaAAba = async () => ({ ok: true }), falharAoGravar = false } = {}) {
  const dados = {};
  const mandadas = [];
  let ouvinte = null;
  const contexto = {
    console,
    navigator: globalThis.navigator,
    fetch: async () => ({ ok: false }),
    setTimeout,
    clearTimeout,
    Date,
    chrome: {
      contextMenus: { create() {}, removeAll: devolver => devolver?.(), onClicked: { addListener() {} } },
      runtime: {
        id: ID_DA_EXTENSAO,
        onInstalled: { addListener() {} },
        onMessage: { addListener: funcao => { ouvinte = funcao; } },
        lastError: null,
      },
      storage: { local: {
        get: (pedido, devolver) => {
          const lido = Object.fromEntries(Object.entries(pedido).map(([chave, padrao]) =>
            [chave, JSON.parse(JSON.stringify(chave in dados ? dados[chave] : padrao ?? null))]));
          Promise.resolve().then(() => devolver(lido));
        },
        set: (valores, pronto) => {
          if (!falharAoGravar) for (const [chave, valor] of Object.entries(valores)) dados[chave] = copia(valor);
          Promise.resolve().then(() => {
            contexto.chrome.runtime.lastError = falharAoGravar ? { message: 'cota estourada' } : null;
            pronto?.();
            contexto.chrome.runtime.lastError = null;
          });
        },
        remove: async () => {},
      } },
      tabs: {
        query: (_pedido, devolver) => devolver([]),
        sendMessage: (aba, mensagem, opcoes) => {
          mandadas.push({ aba, mensagem, opcoes });
          return aoMandarParaAAba(aba, mensagem);
        },
      },
    },
  };
  contexto.importScripts = (...arquivos) => arquivos.forEach(arquivo =>
    vm.runInContext(fs.readFileSync(arquivo, 'utf8'), contexto, { filename: arquivo }));
  vm.createContext(contexto);
  vm.runInContext(fs.readFileSync('background.js', 'utf8'), contexto, { filename: 'background.js' });
  assert.strictEqual(typeof ouvinte, 'function', 'o service worker registra um ouvinte de mensagens');
  return { dados, mandadas, ouvinte };
}

function enviar(mundoDeTeste, request, remetente) {
  const respostas = [];
  let respondeu;
  const primeira = new Promise(resolve => { respondeu = resolve; });
  const devolveu = mundoDeTeste.ouvinte(request, remetente, resposta => { respostas.push(resposta); respondeu(); });
  const resposta = Promise.race([primeira, new Promise(resolve => setTimeout(resolve, 150))]).then(() => copia(respostas[0]));
  return { devolveu, resposta, respostas };
}

const CASOS = [];
const caso = (nome, corpo) => CASOS.push({ nome, corpo });

caso('COPIAR_NO_FRAME_DE_CIMA: da aba da extensão, pede a cópia ao frame de cima e devolve se saiu', async () => {
  const m = mundo();
  const { devolveu, resposta } = enviar(m, { type: 'COPIAR_NO_FRAME_DE_CIMA', texto: 'See you soon' }, DA_ABA_7);
  assert.strictEqual(devolveu, true);
  assert.deepStrictEqual(await resposta, { ok: true });
  assert.deepStrictEqual(copia(m.mandadas), [{ aba: 7, mensagem: { type: 'COPIAR_PARA_CLIPBOARD', texto: 'See you soon' }, opcoes: { frameId: 0 } }]);
});

caso('COPIAR_NO_FRAME_DE_CIMA: a aba de id 0 também vale', async () => {
  const m = mundo();
  const { devolveu, resposta } = enviar(m, { type: 'COPIAR_NO_FRAME_DE_CIMA', texto: 'Hello' }, DA_ABA_ZERO);
  assert.strictEqual(devolveu, true);
  assert.deepStrictEqual(await resposta, { ok: true });
  assert.strictEqual(m.mandadas[0].aba, 0);
});

caso('COPIAR_NO_FRAME_DE_CIMA: só diz ok quando o frame de cima disse ok: true', async () => {
  for (const devolvida of [{ ok: false }, { ok: 'sim' }, {}, undefined, null]) {
    const m = mundo({ aoMandarParaAAba: async () => devolvida });
    assert.deepStrictEqual(await enviar(m, { type: 'COPIAR_NO_FRAME_DE_CIMA', texto: 'Hello' }, DA_ABA_7).resposta, { ok: false });
  }
});

caso('COPIAR_NO_FRAME_DE_CIMA: o frame de cima que não responde dá ok: false', async () => {
  const m = mundo({ aoMandarParaAAba: async () => { throw new Error('sem frame'); } });
  assert.deepStrictEqual(await enviar(m, { type: 'COPIAR_NO_FRAME_DE_CIMA', texto: 'Hello' }, DA_ABA_7).resposta, { ok: false });
});

caso('COPIAR_NO_FRAME_DE_CIMA: remetente de fora, sem aba ou texto que não é texto não recebe resposta nem toca em aba', async () => {
  const pedidos = [
    [{ type: 'COPIAR_NO_FRAME_DE_CIMA', texto: 'Hello' }, DE_FORA],
    [{ type: 'COPIAR_NO_FRAME_DE_CIMA', texto: 'Hello' }, DA_EXTENSAO_SEM_ABA],
    [{ type: 'COPIAR_NO_FRAME_DE_CIMA', texto: 'Hello' }, { id: ID_DA_EXTENSAO, tab: {} }],
    [{ type: 'COPIAR_NO_FRAME_DE_CIMA', texto: '   ' }, DA_ABA_7],
    [{ type: 'COPIAR_NO_FRAME_DE_CIMA', texto: '' }, DA_ABA_7],
    [{ type: 'COPIAR_NO_FRAME_DE_CIMA', texto: 42 }, DA_ABA_7],
    [{ type: 'COPIAR_NO_FRAME_DE_CIMA' }, DA_ABA_7],
  ];
  for (const [request, remetente] of pedidos) {
    const m = mundo();
    const { devolveu, resposta } = enviar(m, request, remetente);
    assert.strictEqual(devolveu, undefined, JSON.stringify([request, remetente]));
    assert.strictEqual(await resposta, undefined);
    assert.deepStrictEqual(copia(m.mandadas), []);
  }
});

caso('HA_VIDEO_EM_OUTRO_FRAME: pergunta à aba e devolve temVideo só quando veio true', async () => {
  const m = mundo({ aoMandarParaAAba: async () => ({ temVideo: true }) });
  const { devolveu, resposta } = enviar(m, { type: 'HA_VIDEO_EM_OUTRO_FRAME' }, DA_ABA_7);
  assert.strictEqual(devolveu, true);
  assert.deepStrictEqual(await resposta, { temVideo: true });
  assert.deepStrictEqual(copia(m.mandadas), [{ aba: 7, mensagem: { type: 'TEM_VIDEO_NESTE_FRAME' } }]);
  for (const devolvida of [{ temVideo: false }, { temVideo: 1 }, {}, undefined]) {
    const outro = mundo({ aoMandarParaAAba: async () => devolvida });
    assert.deepStrictEqual(await enviar(outro, { type: 'HA_VIDEO_EM_OUTRO_FRAME' }, DA_ABA_7).resposta, { temVideo: false });
  }
});

caso('HA_VIDEO_EM_OUTRO_FRAME: a aba que não responde dá temVideo: false', async () => {
  const m = mundo({ aoMandarParaAAba: async () => { throw new Error('sem aba'); } });
  assert.deepStrictEqual(await enviar(m, { type: 'HA_VIDEO_EM_OUTRO_FRAME' }, DA_ABA_7).resposta, { temVideo: false });
});

caso('HA_VIDEO_EM_OUTRO_FRAME: remetente de fora ou sem aba não recebe resposta nem toca em aba', async () => {
  for (const remetente of [DE_FORA, DA_EXTENSAO_SEM_ABA]) {
    const m = mundo();
    const { devolveu, resposta } = enviar(m, { type: 'HA_VIDEO_EM_OUTRO_FRAME' }, remetente);
    assert.strictEqual(devolveu, undefined);
    assert.strictEqual(await resposta, undefined);
    assert.deepStrictEqual(copia(m.mandadas), []);
  }
});

caso('SALVAR_HISTORICO: grava a Frase com o texto, a origem, o Contexto e o idioma, e devolve ela', async () => {
  const m = mundo();
  const contexto = { fonte: 'netflix', titulo: 'The Bear', detalhe: '' };
  const { devolveu, resposta } = enviar(m, { type: 'SALVAR_HISTORICO', texto: 'Call me tomorrow.', origem: 'netflix', contexto, idioma: 'Inglês', semNuvem: true }, DA_ABA_7);
  assert.strictEqual(devolveu, true);
  const { ok, frase } = await resposta;
  assert.strictEqual(ok, true);
  assert.strictEqual(frase.texto, 'Call me tomorrow.');
  assert.strictEqual(frase.streaming, 'netflix');
  assert.strictEqual(frase.idioma, 'Inglês');
  assert.deepStrictEqual(frase.contexto, contexto);
  assert.ok(frase.id > 0);
  assert.strictEqual(m.dados.frases[0].id, frase.id);
  assert.deepStrictEqual(m.dados.frases.map(f => f.texto), ['Call me tomorrow.']);
});

caso('SALVAR_HISTORICO: as Palavras que vieram ficam como keywords, sem a marca de automática', async () => {
  const m = mundo();
  const { resposta } = enviar(m, { type: 'SALVAR_HISTORICO', texto: 'Call me tomorrow.', origem: 'manual', palavras: ['call', 7], semNuvem: true }, DA_ABA_7);
  const { ok, frase } = await resposta;
  assert.strictEqual(ok, true);
  assert.deepStrictEqual(frase.keywords, ['call', '7']);
  assert.strictEqual(frase.autoKeyword, false);
});

caso('SALVAR_HISTORICO: sem idioma a Frase é em Inglês, e sem Contexto não leva Contexto', async () => {
  const m = mundo();
  const { frase } = await enviar(m, { type: 'SALVAR_HISTORICO', texto: 'Hello there.', origem: 'manual', semNuvem: true }, DA_ABA_7).resposta;
  assert.strictEqual(frase.idioma, 'Inglês');
  assert.strictEqual('contexto' in frase, false);
});

caso('SALVAR_HISTORICO: não confere o remetente (hoje só o content script chega aqui)', async () => {
  const m = mundo();
  const { devolveu, resposta } = enviar(m, { type: 'SALVAR_HISTORICO', texto: 'Hello there.', origem: 'manual', semNuvem: true }, DE_FORA);
  assert.strictEqual(devolveu, true);
  assert.strictEqual((await resposta).ok, true);
});

caso('SALVAR_HISTORICO: o que falha ao gravar vira ok: false com a mensagem do erro', async () => {
  const m = mundo({ falharAoGravar: true });
  const resposta = await enviar(m, { type: 'SALVAR_HISTORICO', texto: 'Hello there.', origem: 'manual', semNuvem: true }, DA_ABA_7).resposta;
  assert.deepStrictEqual(resposta, { ok: false, error: 'cota estourada' });
});

caso('AUTO_MINER_GET_STATE: devolve os ajustes e o diário normalizados', async () => {
  const m = mundo();
  const { devolveu, resposta } = enviar(m, { type: 'AUTO_MINER_GET_STATE' }, DA_ABA_7);
  assert.strictEqual(devolveu, true);
  const { ok, state } = await resposta;
  assert.strictEqual(ok, true);
  assert.deepStrictEqual(Object.keys(state).sort(), ['daily', 'settings']);
  assert.deepStrictEqual(Object.keys(state.settings).sort(), ['en', 'ru']);
});

caso('AUTO_MINER_SET_SETTINGS: grava os ajustes, publica o estado e devolve o novo estado', async () => {
  const m = mundo();
  const { devolveu, resposta } = enviar(m, { type: 'AUTO_MINER_SET_SETTINGS', settings: { en: { enabled: true, dailyLimit: 20 } } }, DA_ABA_7);
  assert.strictEqual(devolveu, true);
  const { ok, state } = await resposta;
  assert.strictEqual(ok, true);
  assert.strictEqual(state.settings.en.enabled, true);
  assert.strictEqual(state.settings.en.dailyLimit, 20);
  const valores = Object.values(m.dados);
  assert.ok(valores.some(valor => valor?.en?.enabled === true && valor.en.dailyLimit === 20), 'os ajustes foram gravados');
  assert.ok(valores.some(valor => valor?.settings?.en?.enabled === true && valor.updatedAt > 0), 'o estado publicado foi gravado');
});

caso('AUTO_MINER_SET_SETTINGS: sem settings usa o que já havia', async () => {
  const m = mundo();
  const { ok, state } = await enviar(m, { type: 'AUTO_MINER_SET_SETTINGS' }, DA_ABA_7).resposta;
  assert.strictEqual(ok, true);
  assert.strictEqual(state.settings.en.enabled, false);
});

caso('AUTO_MINER_CANDIDATE: devolve ok: true com a decisão da Mineração automática e o estado', async () => {
  const m = mundo();
  const { devolveu, resposta } = enviar(m, { type: 'AUTO_MINER_CANDIDATE', texto: 'Call me tomorrow, Ted.', lang: 'en', contexto: null }, DA_ABA_7);
  assert.strictEqual(devolveu, true);
  const decisao = await resposta;
  assert.strictEqual(decisao.ok, true);
  assert.strictEqual(decisao.action, 'skip');
  assert.strictEqual(decisao.reason, 'disabled');
  assert.strictEqual(decisao.state.settings.en.enabled, false);
});

caso('AUTO_MINER_CANDIDATE: texto vazio devolve ok: true, skip e empty, sem estado', async () => {
  const m = mundo();
  assert.deepStrictEqual(await enviar(m, { type: 'AUTO_MINER_CANDIDATE', texto: '   ' }, DA_ABA_7).resposta, { ok: true, action: 'skip', reason: 'empty' });
});

caso('AUTO_MINER_CANDIDATE: o que falha vira ok: false, action: skip e o motivo', async () => {
  const m = mundo({ falharAoGravar: true });
  const resposta = await enviar(m, { type: 'AUTO_MINER_CANDIDATE', texto: 'Call me tomorrow, Ted.', lang: 'en' }, DA_ABA_7).resposta;
  assert.deepStrictEqual(resposta, { ok: false, action: 'skip', reason: 'cota estourada' });
});

caso('AUTO_MINER_GET_STATE e AUTO_MINER_SET_SETTINGS: o que falha vira ok: false com o erro', async () => {
  const m = mundo({ falharAoGravar: true });
  const ajustes = await enviar(m, { type: 'AUTO_MINER_SET_SETTINGS', settings: { en: { enabled: true } } }, DA_ABA_7).resposta;
  assert.deepStrictEqual(ajustes, { ok: false, error: 'cota estourada' });
});

caso('um tipo desconhecido, ou sem tipo, não recebe resposta', async () => {
  for (const request of [{ type: 'NAO_EXISTE' }, {}, { type: 'constructor' }, { type: 'toString' }, { type: '__proto__' }]) {
    const m = mundo();
    const { devolveu, resposta } = enviar(m, request, DA_ABA_7);
    assert.strictEqual(devolveu, undefined, JSON.stringify(request));
    assert.strictEqual(await resposta, undefined);
  }
});

(async () => {
  for (const { nome, corpo } of CASOS) {
    try {
      await corpo();
    } catch (erro) {
      console.error(`falhou: ${nome}`);
      throw erro;
    }
  }
  console.log(`ouvinte de mensagens: ${CASOS.length} provas passaram`);
  process.exit(0);
})().catch(erro => { console.error(erro); process.exit(1); });

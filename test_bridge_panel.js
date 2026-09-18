'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function createElementStub() {
  return {
    innerHTML: '',
    textContent: '',
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {},
    remove() {},
    appendChild() {},
    setAttribute() {},
    style: {},
  };
}

function loadPanel({ confirmResult = true } = {}) {
  const storage = { frases: [] };
  const elements = new Map();
  const getElement = (id) => {
    if (!elements.has(id)) elements.set(id, createElementStub());
    return elements.get(id);
  };
  const documentStub = {
    addEventListener() {},
    getElementById: getElement,
    querySelectorAll() { return []; },
    createElement() { return createElementStub(); },
    body: createElementStub(),
  };
  const chromeStub = {
    storage: {
      local: {
        get(defaults, callback) {
          const result = {};
          for (const [key, value] of Object.entries(defaults || {})) {
            result[key] = Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : value;
          }
          callback(result);
        },
        set(values, callback) {
          Object.assign(storage, values || {});
          if (callback) callback();
        },
      },
      sync: {
        set() {},
        get(_keys, callback) { callback({}); },
        remove(_keys, callback) { if (callback) callback(); },
      },
      onChanged: { addListener() {} },
    },
    identity: {
      getRedirectURL() { return 'https://example.invalid/'; },
      launchWebAuthFlow() {},
    },
  };

  const context = {
    console,
    chrome: chromeStub,
    document: documentStub,
    window: {},
    navigator: { clipboard: { writeText: async () => {} } },
    URL,
    Blob,
    Date,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    structuredClone: global.structuredClone,
    confirm() { context.__confirmCalls += 1; return confirmResult; },
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    __elements: elements,
    __storage: storage,
    __confirmCalls: 0,
  };
  vm.createContext(context);
  // O painel.html carrega a base compartilhada antes do painel.js.
  for (const arquivo of ['lib/voz/catalogo.js', 'lib/voz/texto.js', 'veio/componentes.js', 'lib/idioma.js', 'painel-shell.js']) {
    vm.runInContext(fs.readFileSync(arquivo, 'utf8'), context, { filename: arquivo });
  }
  const source = `${fs.readFileSync('painel.js', 'utf8')}
globalThis.__setPanelState = (state) => {
  if (Object.prototype.hasOwnProperty.call(state, 'todasFrases')) todasFrases = state.todasFrases;
  if (Object.prototype.hasOwnProperty.call(state, 'bridgeActiveJobIds')) bridgeActiveJobIds = state.bridgeActiveJobIds;
};
globalThis.__getPanelState = () => ({ todasFrases, bridgeActiveJobIds, keywords });
globalThis.__setPanelHooks = (hooks) => {
  if (hooks.removerFrasesFirestore) removerFrasesFirestore = hooks.removerFrasesFirestore;
  if (hooks.aplicarFiltro) aplicarFiltro = hooks.aplicarFiltro;
  if (hooks.atualizarContadorSelecao) atualizarContadorSelecao = hooks.atualizarContadorSelecao;
  if (hooks.mostrarToast) mostrarToast = hooks.mostrarToast;
};`;
  vm.runInContext(source, context, { filename: 'painel.js' });
  return context;
}

function testContinueButtonVisibility() {
  const context = loadPanel();
  context.renderizarBridgeAnalyticsJobs([
    { jobId: 'failed-job', status: 'failed', createdAt: '2026-06-19T10:00:00', lang: 'en' },
    { jobId: 'partial-job', status: 'partial', createdAt: '2026-06-19T10:00:00', lang: 'en' },
    { jobId: 'done-job', status: 'completed', createdAt: '2026-06-19T10:00:00', lang: 'en' },
    { jobId: 'running-job', status: 'running', createdAt: '2026-06-19T10:00:00', lang: 'en' },
  ]);

  const html = context.__elements.get('bridge-analytics-jobs-main').innerHTML;
  assert.ok(html.includes('data-retry-job="failed-job"'), 'failed job should show Continuar');
  assert.ok(html.includes('data-retry-job="partial-job"'), 'partial job should show Continuar');
  assert.ok(!html.includes('data-retry-job="done-job"'), 'completed job should not show Continuar');
  assert.ok(!html.includes('data-retry-job="running-job"'), 'running job should not show Continuar');

  context.renderizarBridgeJobs([
    { jobId: 'failed-job', status: 'failed', lang: 'en', state: { status: 'failed', stage: 'failed' } },
    { jobId: 'partial-job', status: 'partial', lang: 'en', state: { status: 'partial', stage: 'partial' } },
    { jobId: 'done-job', status: 'completed', lang: 'en', state: { status: 'completed', stage: 'completed' } },
    { jobId: 'running-job', status: 'running', lang: 'en', state: { status: 'running', stage: 'send_to_anki' } },
  ]);

  const modalHtml = context.__elements.get('bridge-progress-list').innerHTML;
  assert.ok(modalHtml.includes('data-retry-job="failed-job"'), 'failed modal job should show Continuar');
  assert.ok(modalHtml.includes('data-retry-job="partial-job"'), 'partial modal job should show Continuar');
  assert.ok(!modalHtml.includes('data-retry-job="done-job"'), 'completed modal job should not show Continuar');
  assert.ok(!modalHtml.includes('data-retry-job="running-job"'), 'running modal job should not show Continuar');
}

async function testCleanupDeletesOnlySuccessfulPhraseIds() {
  const context = loadPanel({ confirmResult: true });
  context.__setPanelState({
    todasFrases: [
      { id: 1, texto: 'sent', status: 'new', keywords: ['sent'] },
      { id: 2, texto: 'kept', status: 'new', keywords: ['kept'] },
      { id: 3, texto: 'sent too', status: 'new', keywords: ['sent', 'too'] },
      { id: 4, texto: 'failed', status: 'new', keywords: ['failed'] },
    ],
    bridgeActiveJobIds: ['job-1'],
  });
  const state = context.__getPanelState();
  state.keywords[1] = ['sent'];
  state.keywords[2] = ['kept'];
  state.keywords[3] = ['sent', 'too'];
  state.keywords[4] = ['failed'];
  context.__setPanelHooks({
    removerFrasesFirestore: async (ids) => { context.__deletedIds = ids.map(Number); },
    aplicarFiltro: () => {},
    atualizarContadorSelecao: () => {},
    mostrarToast: () => {},
  });

  await context.reconciliarExportacoesBridge([
    {
      jobId: 'job-1',
      status: 'completed',
      state: { status: 'partial', successfulPhraseIds: [1, 3, 4], failedPhraseIds: [4] },
    },
  ]);

  const finalState = context.__getPanelState();
  assert.deepStrictEqual(Array.from(finalState.todasFrases, f => f.id), [2, 4]);
  assert.deepStrictEqual(Array.from(context.__deletedIds), [1, 3]);
  assert.strictEqual(finalState.keywords[1], undefined);
  assert.strictEqual(finalState.keywords[3], undefined);
  assert.deepStrictEqual(Array.from(finalState.keywords[4]), ['failed']);
  assert.strictEqual(context.__confirmCalls, 1);
}

async function run() {
  testContinueButtonVisibility();
  await testCleanupDeletesOnlySuccessfulPhraseIds();
}

run().then(
  () => console.log('bridge panel tests passed'),
  error => {
    console.error(error);
    process.exitCode = 1;
  },
);

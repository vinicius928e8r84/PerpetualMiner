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
    append() {},
    replaceChildren() {},
    setAttribute() {},
    style: {},
  };
}

function loadPanel() {
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
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    __elements: elements,
    __storage: storage,
  };
  vm.createContext(context);
  // O painel.html carrega a base compartilhada antes do painel.js.
  for (const arquivo of ['lib/voz/catalogo.js', 'lib/voz/texto.js', 'veio/componentes.js', 'lib/idioma.js', 'lib/atalhos.js', 'painel-shell.js', 'painel-conta.js', 'painel-atalhos.js', 'painel-chave.js', 'painel-perigo.js', 'painel-envio.js']) {
    vm.runInContext(fs.readFileSync(arquivo, 'utf8'), context, { filename: arquivo });
  }
  const source = fs.readFileSync('painel.js', 'utf8');
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

}

async function run() {
  // O modal de progresso e o apagar do fim do envio saíram daqui: estão no seam
  // novo, e2e/tests/painel-envio.spec.js (Continuar envio, Apagar as N enviadas).
  testContinueButtonVisibility();
}

run().then(
  () => console.log('bridge panel tests passed'),
  error => {
    console.error(error);
    process.exitCode = 1;
  },
);

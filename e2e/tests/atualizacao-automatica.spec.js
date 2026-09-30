'use strict';

// A extensão carregada de uma pasta se recarrega sozinha quando um arquivo da
// pasta muda (é o que atualiza o Chrome/Opera depois de um `git pull`).
//
// Cada teste roda numa cópia da extensão em pasta temporária, para poder mudar
// um arquivo sem tocar no repositório. O alarme de 1 minuto é disparado antes da
// hora pelo próprio nome (o relógio não dá para o teste dirigir).
//
// O recarregamento em si não dá para fazer de verdade aqui: numa extensão que o
// Chromium do Playwright carrega pela linha de comando, `chrome.runtime.reload()`
// a descarrega e ela não volta. Então o teste troca essa única chamada por um
// contador, a fronteira com o navegador, e afirma quantas vezes ela foi pedida.

const { test, expect, chromium } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const RAIZ_DA_EXTENSAO = path.resolve(__dirname, '..', '..');
const ALARME = 'pm-auto-recarregar';
const NAO_VAI_PARA_A_COPIA = new Set(['.git', '.claude', 'e2e', 'docs', 'preview', 'bridge', 'engine', 'test-results', 'node_modules', 'dist']);

async function abrirCopia(use) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-copia-'));
  const extensao = path.join(pasta, 'extensao');
  fs.cpSync(RAIZ_DA_EXTENSAO, extensao, {
    recursive: true,
    filter: origem => !NAO_VAI_PARA_A_COPIA.has(path.basename(origem)) || origem === RAIZ_DA_EXTENSAO,
  });
  const context = await chromium.launchPersistentContext(path.join(pasta, 'perfil'), {
    channel: 'chromium',
    headless: !process.env.HEADED,
    args: [`--disable-extensions-except=${extensao}`, `--load-extension=${extensao}`, '--no-proxy-server'],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    await use({ context, worker, extensao });
  } finally {
    await context.close();
    fs.rmSync(pasta, { recursive: true, force: true });
  }
}

async function esperarPelaPrimeiraLeitura(worker) {
  await expect.poll(() => worker.evaluate(
    () => chrome.storage.session.get('pm_auto_recarregar_hash').then(r => Boolean(r.pm_auto_recarregar_hash))),
  { timeout: 10_000 }).toBe(true);
}

const dispararAlarme = worker => worker.evaluate(
  nome => chrome.alarms.create(nome, { when: Date.now() + 100 }), ALARME);

const contarRecargas = worker => worker.evaluate(() => globalThis.recargas);
const trocarRecargaPorContador = worker => worker.evaluate(() => {
  globalThis.recargas = 0;
  chrome.runtime.reload = () => { globalThis.recargas += 1; };
});

test('recarrega a extensão quando um arquivo da pasta muda', async () => {
  await abrirCopia(async ({ worker, extensao }) => {
    await esperarPelaPrimeiraLeitura(worker);
    await trocarRecargaPorContador(worker);

    fs.appendFileSync(path.join(extensao, 'popup.css'), '\n/* mudou */\n');
    await dispararAlarme(worker);

    await expect.poll(() => contarRecargas(worker), { timeout: 15_000 }).toBe(1);
  });
});

test('recarrega quando um script importado pelo service worker muda', async () => {
  await abrirCopia(async ({ worker, extensao }) => {
    await esperarPelaPrimeiraLeitura(worker);
    await trocarRecargaPorContador(worker);

    fs.appendFileSync(path.join(extensao, 'lib', 'idioma.js'), '\n// mudou\n');
    await dispararAlarme(worker);

    await expect.poll(() => contarRecargas(worker), { timeout: 15_000 }).toBe(1);
  });
});

test('não recarrega enquanto nada muda', async () => {
  await abrirCopia(async ({ worker }) => {
    await esperarPelaPrimeiraLeitura(worker);
    await trocarRecargaPorContador(worker);

    await dispararAlarme(worker);
    await new Promise(resolver => setTimeout(resolver, 3000));

    expect(await contarRecargas(worker)).toBe(0);
  });
});

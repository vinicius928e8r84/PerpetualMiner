'use strict';

// A extensão carregada de uma pasta se recarrega sozinha quando um arquivo da
// pasta muda (é o que atualiza o Chrome/Opera depois de um `git pull`).
//
// Cada teste carrega uma cópia da extensão numa pasta temporária (a opção
// `pastaDaExtensao` da fixture), para poder mudar um arquivo sem tocar no
// repositório. O alarme de 1 minuto é disparado antes da hora pelo próprio nome
// (o relógio não dá para o teste dirigir).
//
// O recarregamento em si não dá para fazer de verdade aqui: numa extensão que o
// Chromium do Playwright carrega pela linha de comando, `chrome.runtime.reload()`
// a descarrega e ela não volta. Então o teste troca essa única chamada por um
// contador, a fronteira com o navegador, e afirma quantas vezes ela foi pedida.

const { test: base, expect } = require('../fixtures');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { arquivosDoPacote } = require('../../scripts/arquivos-do-pacote');

const RAIZ_DA_EXTENSAO = path.resolve(__dirname, '..', '..');
const ALARME = 'pm-auto-recarregar';

const test = base.extend({
  pastaDaExtensao: async ({}, use) => {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-copia-'));
    for (const arquivo of arquivosDoPacote(RAIZ_DA_EXTENSAO)) {
      fs.mkdirSync(path.dirname(path.join(pasta, arquivo)), { recursive: true });
      fs.copyFileSync(path.join(RAIZ_DA_EXTENSAO, arquivo), path.join(pasta, arquivo));
    }
    await use(pasta);
    fs.rmSync(pasta, { recursive: true, force: true });
  },
});

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

test('recarrega a extensão quando um arquivo da pasta muda', async ({ extensao, pastaDaExtensao }) => {
  const worker = extensao.serviceWorker;
  await esperarPelaPrimeiraLeitura(worker);
  await trocarRecargaPorContador(worker);

  fs.appendFileSync(path.join(pastaDaExtensao, 'popup.css'), '\n/* mudou */\n');
  await dispararAlarme(worker);

  await expect.poll(() => contarRecargas(worker), { timeout: 15_000 }).toBe(1);
});

test('recarrega quando um script importado pelo service worker muda', async ({ extensao, pastaDaExtensao }) => {
  const worker = extensao.serviceWorker;
  await esperarPelaPrimeiraLeitura(worker);
  await trocarRecargaPorContador(worker);

  fs.appendFileSync(path.join(pastaDaExtensao, 'lib', 'idioma.js'), '\n// mudou\n');
  await dispararAlarme(worker);

  await expect.poll(() => contarRecargas(worker), { timeout: 15_000 }).toBe(1);
});

test('recarrega quando um ícone da extensão muda', async ({ extensao, pastaDaExtensao }) => {
  const worker = extensao.serviceWorker;
  await esperarPelaPrimeiraLeitura(worker);
  await trocarRecargaPorContador(worker);

  fs.appendFileSync(path.join(pastaDaExtensao, 'veio', 'icones', 'icone-16.png'), Buffer.from([0]));
  await dispararAlarme(worker);

  await expect.poll(() => contarRecargas(worker), { timeout: 15_000 }).toBe(1);
});

test('não recarrega enquanto nada muda', async ({ extensao }) => {
  const worker = extensao.serviceWorker;
  await esperarPelaPrimeiraLeitura(worker);
  await trocarRecargaPorContador(worker);

  await dispararAlarme(worker);
  await new Promise(resolver => setTimeout(resolver, 3000));

  expect(await contarRecargas(worker)).toBe(0);
});

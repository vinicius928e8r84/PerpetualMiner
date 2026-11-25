'use strict';

const { expect } = require('@playwright/test');

const CICLO_MS = 16_000;
const ASSENTAR_MS = 300;
const POST_QUE_SO_LE = new Set(['/ia/estado', '/ia/chatgpt/estado', '/ia/modelo/estado', '/abrir-com-o-computador/estado', '/anki/decks', '/custos/teto']);

const muda = r => r.metodo !== 'GET' && !POST_QUE_SO_LE.has(r.caminho);

const ESPERA_DA_RESPOSTA_MS = 6_000;
const TENTATIVAS_DO_CICLO = 4;

async function umCiclo(page, esperar = '/health') {
  for (let tentativa = 0; tentativa < TENTATIVAS_DO_CICLO; tentativa++) {
    const lida = page.waitForResponse(r => new URL(r.url()).pathname.endsWith(esperar), { timeout: ESPERA_DA_RESPOSTA_MS });
    lida.catch(() => {});
    await page.clock.runFor(CICLO_MS);
    try {
      await (await lida).finished();
      return;
    } catch (erro) {
      if (tentativa === TENTATIVAS_DO_CICLO - 1) throw erro;
    }
  }
}

async function assentar(telas, { esperar = '/health' } = {}) {
  let anterior = null;
  for (let n = 0; n < 4; n++) {
    for (const tela of telas) await umCiclo(tela.page, esperar);
    for (const tela of telas) await tela.page.waitForTimeout(ASSENTAR_MS);
    const agora = JSON.stringify(await Promise.all(telas.map(t => t.extensao.lerStorage())));
    if (agora === anterior) return;
    anterior = agora;
  }
}

async function emRepouso(page, { ciclos, fakes, extensao, tambem = [], esperar = '/health' }) {
  const telas = [{ page, extensao }, ...tambem];
  const guardado = async () => Promise.all(telas.map(t => t.extensao.lerStorage()));
  const antes = { storage: await guardado(), conexao: fakes.anki.requisicoes.length, nuvem: fakes.google.requisicoes.length };

  for (let n = 0; n < ciclos; n++) {
    for (const tela of telas) await umCiclo(tela.page, esperar);
  }
  for (const tela of telas) await tela.page.waitForTimeout(ASSENTAR_MS);

  const escritasNaConexao = fakes.anki.requisicoes.slice(antes.conexao).filter(muda).map(r => `${r.metodo} ${r.caminho}`);
  const patchesNaNuvem = fakes.google.requisicoes.slice(antes.nuvem).filter(r => r.metodo === 'PATCH').map(r => `${r.metodo} ${r.url}`);
  expect(escritasNaConexao, `pedidos que mudam algo na Conexão em ${ciclos} ciclos de repouso`).toEqual([]);
  expect(patchesNaNuvem, `escritas no Firestore em ${ciclos} ciclos de repouso`).toEqual([]);
  expect(await guardado(), `chrome.storage.local em ${ciclos} ciclos de repouso`).toEqual(antes.storage);
}

module.exports = { emRepouso, assentar };

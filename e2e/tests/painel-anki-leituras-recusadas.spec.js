'use strict';

const { test, expect } = require('../fixtures');

const AGORA = new Date('2026-09-18T12:00:00');

const custos = page => page.locator('#anki-custos');
const baralhos = page => page.locator('.shell-aba[data-aba="baralhos"]');
const vocabulario = page => page.locator('.shell-aba[data-aba="vocabulario"]');

async function abrirAnki(page, extensao, hash) {
  await extensao.gravarStorage({ pm_anki_ja_conectou: true });
  await page.clock.setFixedTime(AGORA);
  await page.goto(extensao.url(`painel.html${hash}`));
}

async function causaEmDetalhes(aviso) {
  await aviso.getByText('Detalhes', { exact: true }).click();
  return aviso.locator('pre');
}

// Exceção de teste: sem-estado-guardado — a leitura recusada não grava nada; o que se confere é a causa em Detalhes.
test('os custos que a Conexão recusa: a causa em Detalhes é o pedido e o status', async ({ page, extensao, fakes }) => {
  fakes.anki.responder('POST', '/analytics/jobs', () => ({ status: 500, json: { error: 'internal_error' } }));
  await abrirAnki(page, extensao, '#anki/custos');

  const aviso = custos(page).getByRole('alert');
  await expect(aviso).toContainText('Não deu para carregar os custos. Confira se a Conexão com o Anki está ligada.');
  await expect(await causaEmDetalhes(aviso)).toHaveText('POST /analytics/jobs {"lang":"all","from":"2026-09-01","to":"2026-09-18"} · HTTP 500');
});

// Exceção de teste: sem-estado-guardado — a leitura recusada não grava nada; o que se confere é a causa em Detalhes.
test('os baralhos com o Anki sem coleção: a causa em Detalhes é o pedido, o status, o erro e o motivo', async ({ page, extensao, fakes }) => {
  fakes.anki.responder('POST', '/anki/stats/decks', () => ({ status: 503, json: { error: 'anki_stats_unavailable', detail: 'collection_not_open' } }));
  await abrirAnki(page, extensao, '#anki/baralhos');

  const aviso = baralhos(page).getByRole('alert').filter({ hasText: 'Não deu para ler os baralhos do Anki.' });
  await expect(await causaEmDetalhes(aviso)).toHaveText('POST /anki/stats/decks · HTTP 503 · anki_stats_unavailable · collection_not_open');
});

// Exceção de teste: sem-estado-guardado — a leitura recusada não grava nada; o que se confere é a causa em Detalhes.
test('o vocabulário com o Anki ocupado: a causa em Detalhes é o pedido, o status, o erro e o motivo', async ({ page, extensao, fakes }) => {
  fakes.anki.responder('POST', '/anki/vocabulary', () => ({ status: 503, json: { error: 'anki_vocabulary_unavailable', detail: 'anki_busy' } }));
  await abrirAnki(page, extensao, '#anki/vocabulario');

  const aviso = vocabulario(page).getByRole('alert').filter({ hasText: 'Não deu para carregar o vocabulário.' });
  await expect(await causaEmDetalhes(aviso)).toHaveText('POST /anki/vocabulary · HTTP 503 · anki_vocabulary_unavailable · anki_busy');
});

// Exceção de teste: sem-estado-guardado — sem a leitura do teto nada é guardado nem mostrado.
test('a Conexão que não tem a rota do teto: Custos abre sem o card do teto e sem aviso', async ({ page, extensao, fakes }) => {
  fakes.anki.responder('POST', '/custos/teto', () => ({ status: 404, json: { error: 'not_found' } }));
  const lido = page.waitForResponse(resposta => resposta.url().endsWith('/custos/teto') && resposta.status() === 404);
  await abrirAnki(page, extensao, '#anki/custos');

  await lido;
  await expect(custos(page).getByText('Somando os custos…')).toBeHidden();
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
  await expect(page.locator('#anki-custos-teto')).toHaveCount(0);
  await expect(page.locator('#painel-teto-aviso')).toHaveCount(0);
});

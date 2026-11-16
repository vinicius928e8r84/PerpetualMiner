'use strict';

const { test, expect } = require('../fixtures');
const { montarRelogio } = require('../relogio-parado');

const ATRASO_MS = 1_700;
const AGORA = new Date('2026-09-18T12:00:00');
const DESTAQUE_MS = 1_400;

const sobAtraso = page => ({
  clock: new Proxy(page.clock, {
    get: (relogio, comando) => async (...argumentos) => {
      const resposta = await relogio[comando](...argumentos);
      if (comando === 'install') await new Promise(resolve => setTimeout(resolve, ATRASO_MS));
      return resposta;
    },
  }),
});

async function armarODestaque(page, paginas) {
  await page.goto(paginas.url('sem-video.html'));
  await page.evaluate(ms => {
    window.destaqueDisparou = false;
    setTimeout(() => { window.destaqueDisparou = true; }, ms);
  }, DESTAQUE_MS);
  return () => page.evaluate(() => window.destaqueDisparou);
}

test('a preparação antiga, que pausa um segundo à frente, recusa o alvo no passado com 1.700 ms de atraso (e426f7c)', async ({ page }) => {
  const antiga = sobAtraso(page);
  const agora = new Date();
  await expect(montarRelogio(antiga, { desde: agora, ate: new Date(agora.getTime() + 1_000) }))
    .rejects.toThrow(/fast-forward to the past/i);
});

test('a preparação antiga, só com install, deixa o timer de 1,4 s disparar antes da assertion (edc5a109)', async ({ page, paginas }) => {
  await montarRelogio(page, { desde: AGORA });
  const disparou = await armarODestaque(page, paginas);
  await new Promise(resolve => setTimeout(resolve, ATRASO_MS));
  expect(await disparou()).toBe(true);
});

test('com 1.700 ms de atraso antes da pausa, a fixture para o relógio no instante pedido', async ({ page, relogioParado }) => {
  const relogio = await relogioParado({ page: sobAtraso(page), em: AGORA });

  await page.goto('about:blank');
  expect(await page.evaluate(() => Date.now())).toBe(AGORA.getTime());
  expect(relogio.instante).toEqual(AGORA);
});

test('com 1.700 ms de atraso antes da pausa, a fixture segura o timer de 1,4 s até o avanço explícito', async ({ page, paginas, relogioParado }) => {
  const relogio = await relogioParado({ page: sobAtraso(page), em: AGORA });
  const disparou = await armarODestaque(page, paginas);

  await new Promise(resolve => setTimeout(resolve, ATRASO_MS));
  expect(await disparou()).toBe(false);
  await relogio.avancar(DESTAQUE_MS - 1);
  expect(await disparou()).toBe(false);
  await relogio.avancar(1);
  expect(await disparou()).toBe(true);
  expect(await page.evaluate(() => Date.now())).toBe(AGORA.getTime() + DESTAQUE_MS);
});

test('a margem da fixture é maior que o prazo do teste, inclusive com test.slow()', async ({ page, relogioParado }) => {
  test.slow();
  const prazo = test.info().timeout;
  const relogio = await relogioParado({ page, em: AGORA });

  await page.goto('about:blank');
  expect(relogio.margem).toBeGreaterThan(prazo);
  expect(await page.evaluate(() => Date.now())).toBe(AGORA.getTime());
});

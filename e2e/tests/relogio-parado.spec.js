'use strict';

// A prova da fixture `relogioParado` (#209): com 1.700 ms de atraso antes da pausa, as preparações antigas
// falham e a fixture passa. O atraso é o do #183 (1.701 ms entre os comandos): uma página que embrulha o
// `install` e o demora, como um runner sob carga demoraria o comando seguinte.

const { test, expect } = require('../fixtures');
const { montarRelogio } = require('../relogio-parado');

const ATRASO_MS = 1_700;
const AGORA = new Date('2026-09-18T12:00:00');
// O destaque de 1,4 s do card Conta & sync (edc5a109): o timer que corria antes da assertion.
const DESTAQUE_MS = 1_400;

/** A página como ela fica sob carga: o `install` volta só ATRASO_MS depois, e o comando seguinte chega tarde. */
const sobAtraso = page => ({
  clock: new Proxy(page.clock, {
    get: (relogio, comando) => async (...argumentos) => {
      const resposta = await relogio[comando](...argumentos);
      if (comando === 'install') await new Promise(resolve => setTimeout(resolve, ATRASO_MS));
      return resposta;
    },
  }),
});

/** Marca, na página, o timer de 1,4 s do destaque; devolve se ele já disparou. */
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
  // A página nasceu `margem` antes do instante parado: o instante é o pedido, e o prazo cabe inteiro antes dele.
  expect(relogio.margem).toBeGreaterThan(prazo);
  expect(await page.evaluate(() => Date.now())).toBe(AGORA.getTime());
});

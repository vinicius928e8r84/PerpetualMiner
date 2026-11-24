'use strict';

const { test, expect } = require('../fixtures');
const { estadoFinalEm } = require('../estado-final');
const {
  PRIMEIRA, SEGUNDA, MUITAS, muitasFrases, idsDas,
  minerarNaPopup, semearContaComFrases, abrirPainelSincronizado, selecionarTodasAsFrases,
} = require('../apoio-de-apagar-frases');

const ATE_A_NUVEM_ESVAZIAR = { timeout: 20_000 };

test('com a conta conectada, a frase apagada no painel sai da nuvem e fica no tombstone', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-painel' });
  const [apagada] = await minerarNaPopup(page, extensao, [PRIMEIRA, SEGUNDA]);
  await expect.poll(() => fakes.google.frasesDe('uid-painel').length).toBe(2);

  await abrirPainelSincronizado(page, extensao);
  await page.locator('#frases-lista .veio-frase', { hasText: PRIMEIRA }).getByRole('button', { name: 'Apagar frase' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apagar frase' }).click();
  await expect(page.getByText(PRIMEIRA)).toHaveCount(0);

  await expect.poll(() => fakes.google.frasesDe('uid-painel').map(f => f.texto)).toEqual([SEGUNDA]);
  await expect.poll(() => fakes.google.apagadasDe('uid-painel')).toEqual([String(apagada.frase.id)]);
});

test('com a conta conectada, "Apagar tudo" no painel apaga todas as frases da nuvem', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-tudo' });
  const mineradas = await minerarNaPopup(page, extensao, [PRIMEIRA, SEGUNDA]);
  await expect.poll(() => fakes.google.frasesDe('uid-tudo').length).toBe(2);

  await abrirPainelSincronizado(page, extensao, '#configuracoes/perigo');
  await page.getByRole('button', { name: 'Apagar todas as 2 frases' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apagar 2 frases' }).click();
  await expect(page.locator('#shell-total')).toHaveText('0');

  await expect.poll(() => fakes.google.frasesDe('uid-tudo')).toEqual([]);
  expect(fakes.google.apagadasDe('uid-tudo').sort()).toEqual(mineradas.map(m => String(m.frase.id)).sort());
});

// A máscara do tombstone vai na URL (`updateMask.fieldPaths`, 46 bytes por frase) e o Firestore recusa a URL acima de
// 16 KB: com mais de ~350 frases o tombstone não era gravado, e o "Apagar tudo" parava nele sem apagar nada da nuvem.
test('com a conta conectada, "Apagar tudo" com 400 frases apaga todas da nuvem e deixa o tombstone de cada uma', async ({ page, extensao, fakes }) => {
  const frases = muitasFrases();
  await semearContaComFrases(extensao, fakes, 'uid-muitas', frases);

  await abrirPainelSincronizado(page, extensao, '#configuracoes/perigo');
  await page.getByRole('button', { name: `Apagar todas as ${MUITAS} frases` }).click();
  await page.getByRole('dialog').getByRole('button', { name: `Apagar ${MUITAS} frases` }).click();
  await expect(page.locator('#shell-total')).toHaveText('0');

  await expect.poll(() => fakes.google.frasesDe('uid-muitas').length, ATE_A_NUVEM_ESVAZIAR).toBe(0);
  expect(fakes.google.apagadasDe('uid-muitas').sort()).toEqual(idsDas(frases));
  await expect.poll(async () => (await extensao.lerStorage(['pm_apagar_tudo', 'pm_deleted_ids']))).toEqual({ pm_deleted_ids: [] });
  await expect(page.locator('#shell-chip')).toContainText('Sincronizado');
});

test('com a conta conectada, apagar 400 frases selecionadas deixa o tombstone de todas na nuvem', async ({ page, extensao, fakes }) => {
  const frases = muitasFrases();
  await semearContaComFrases(extensao, fakes, 'uid-selecao', frases);

  await abrirPainelSincronizado(page, extensao);
  await selecionarTodasAsFrases(page, MUITAS);
  await page.locator('#btn-delete-selected').click();
  await page.getByRole('dialog').getByRole('button', { name: `Apagar ${MUITAS} frases` }).click();
  await expect(page.locator('#shell-total')).toHaveText('0');

  await expect.poll(() => fakes.google.frasesDe('uid-selecao').length, ATE_A_NUVEM_ESVAZIAR).toBe(0);
  await expect.poll(() => fakes.google.apagadasDe('uid-selecao').sort()).toEqual(idsDas(frases));
});

test('com a conta conectada e a Conexão sem responder, apagar a seleção inteira tira todas as frases do navegador e da nuvem', async ({ page, extensao, fakes }) => {
  const frases = muitasFrases(12);
  await semearContaComFrases(extensao, fakes, 'uid-sem-conexao', frases);
  fakes.anki.desligar();

  await abrirPainelSincronizado(page, extensao);
  await selecionarTodasAsFrases(page, 12);
  await page.locator('#btn-delete-selected').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apagar 12 frases' }).click();
  await expect(page.locator('#shell-total')).toHaveText('0');

  await expect.poll(() => fakes.google.frasesDe('uid-sem-conexao')).toEqual([]);
  await expect.poll(() => fakes.google.apagadasDe('uid-sem-conexao').sort()).toEqual(idsDas(frases));
  expect(await extensao.frases()).toEqual([]);
});

// O `chrome.storage.sync` aceita 512 itens, e cada frase apagada é um (`pm_del_{id}`): uma gravação que passava disso
// era recusada inteira, em silêncio, e nenhum tombstone ficava. Agora ficam os das frases mais novas que cabem.
test('apagar 520 frases de uma vez deixa no sync do Chrome o tombstone das 500 mais novas', async ({ page, extensao }) => {
  const frases = muitasFrases(520);
  await extensao.gravarStorage({ frases });
  await page.goto(extensao.url('painel.html'));
  await selecionarTodasAsFrases(page, 520);
  await page.locator('#btn-delete-selected').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apagar 520 frases' }).click();
  await expect(page.locator('#shell-total')).toHaveText('0');

  const noSync = async () => Object.keys(await extensao.serviceWorker.evaluate(() => chrome.storage.sync.get(null))).sort();
  await estadoFinalEm('os tombstones no sync do Chrome', noSync, frases.slice(20).map(f => `pm_del_${f.id}`).sort());
});

'use strict';

// O painel gravava o tombstone com o caminho de campo `ids.{id}` sem crases,
// que o Firestore recusa: apagar uma frase não deixava tombstone na nuvem, e
// "Apagar tudo" esperava essa gravação e nunca chegava ao DELETE.

const { test, expect } = require('../fixtures');
const { estadoFinalEm } = require('../estado-final');

const PRIMEIRA = 'The ferry left before the fog had lifted.';
const SEGUNDA = 'Her notebook was full of borrowed recipes.';

async function minerar(page, textos) {
  return page.evaluate(lista => Promise.all(lista.map(texto =>
    chrome.runtime.sendMessage({
      type: 'SALVAR_HISTORICO',
      texto,
      origem: 'manual',
      idioma: 'Inglês',
      contexto: { fonte: 'manual', titulo: 'Manual Input', detalhe: '' },
    }),
  )), textos);
}

async function abrirPainelSincronizado(page, extensao, endereco = '') {
  await page.goto(extensao.url(`painel.html${endereco}`));
  await expect(page.locator('#shell-chip')).toContainText('Sincronizado');
}

test('com a conta conectada, a frase apagada no painel sai da nuvem e fica no tombstone', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-painel' });
  await page.goto(extensao.url('popup.html'));
  const [apagada] = await minerar(page, [PRIMEIRA, SEGUNDA]);
  await expect.poll(() => fakes.google.frasesDe('uid-painel').length).toBe(2);

  await abrirPainelSincronizado(page, extensao);
  await page.locator('#frases-lista .veio-frase', { hasText: PRIMEIRA }).getByRole('button', { name: 'Apagar frase' }).click();
  // Apagar 1 frase pede confirmação (PAI-12, #30).
  await page.getByRole('dialog').getByRole('button', { name: 'Apagar frase' }).click();
  await expect(page.getByText(PRIMEIRA)).toHaveCount(0);

  await expect.poll(() => fakes.google.frasesDe('uid-painel').map(f => f.texto)).toEqual([SEGUNDA]);
  await expect.poll(() => fakes.google.apagadasDe('uid-painel')).toEqual([String(apagada.frase.id)]);
});

test('com a conta conectada, "Apagar tudo" no painel apaga todas as frases da nuvem', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-tudo' });
  await page.goto(extensao.url('popup.html'));
  const mineradas = await minerar(page, [PRIMEIRA, SEGUNDA]);
  await expect.poll(() => fakes.google.frasesDe('uid-tudo').length).toBe(2);

  // “Apagar tudo” mora em Configurações › Zona de perigo.
  await abrirPainelSincronizado(page, extensao, '#configuracoes/perigo');
  await page.getByRole('button', { name: 'Apagar todas as 2 frases' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apagar 2 frases' }).click();
  await expect(page.locator('#shell-total')).toHaveText('0');

  await expect.poll(() => fakes.google.frasesDe('uid-tudo')).toEqual([]);
  expect(fakes.google.apagadasDe('uid-tudo').sort()).toEqual(mineradas.map(m => String(m.frase.id)).sort());
});

// A máscara do tombstone vai na URL (`updateMask.fieldPaths`, 46 bytes por frase) e o Firestore recusa a URL acima de
// 16 KB: com mais de ~350 frases o tombstone não era gravado, e o "Apagar tudo" parava nele sem apagar nada da nuvem.
const MUITAS = 400;
const muitasFrases = () => Array.from({ length: MUITAS }, (_, i) => ({
  id: 1_700_000_000_000 + i, texto: `The lighthouse keeper counted wave number ${i + 1}.`,
  data: new Date().toLocaleDateString('pt-BR'), streaming: 'manual', idioma: 'Inglês',
}));
const idsDas = frases => frases.map(f => String(f.id)).sort();
// A nuvem recebe um DELETE por frase: são 400 pedidos até ela ficar vazia.
const ATE_A_NUVEM_ESVAZIAR = { timeout: 20_000 };

test('com a conta conectada, "Apagar tudo" com 400 frases apaga todas da nuvem e deixa o tombstone de cada uma', async ({ page, extensao, fakes }) => {
  const frases = muitasFrases();
  await extensao.semearSessao({ uid: 'uid-muitas' });
  await extensao.gravarStorage({ frases });
  fakes.google.gravarFrases('uid-muitas', frases);

  await abrirPainelSincronizado(page, extensao, '#configuracoes/perigo');
  await page.getByRole('button', { name: `Apagar todas as ${MUITAS} frases` }).click();
  await page.getByRole('dialog').getByRole('button', { name: `Apagar ${MUITAS} frases` }).click();
  await expect(page.locator('#shell-total')).toHaveText('0');

  await expect.poll(() => fakes.google.frasesDe('uid-muitas').length, ATE_A_NUVEM_ESVAZIAR).toBe(0);
  expect(fakes.google.apagadasDe('uid-muitas').sort()).toEqual(idsDas(frases));
  // A nuvem confirmou: o Apagar tudo não fica pendente, e a conta volta a dizer que está em dia.
  await expect.poll(async () => (await extensao.lerStorage(['pm_apagar_tudo', 'pm_deleted_ids']))).toEqual({ pm_deleted_ids: [] });
  await expect(page.locator('#shell-chip')).toContainText('Sincronizado');
});

test('com a conta conectada, apagar 400 frases selecionadas deixa o tombstone de todas na nuvem', async ({ page, extensao, fakes }) => {
  const frases = muitasFrases();
  await extensao.semearSessao({ uid: 'uid-selecao' });
  await extensao.gravarStorage({ frases });
  fakes.google.gravarFrases('uid-selecao', frases);

  await abrirPainelSincronizado(page, extensao);
  await page.getByRole('checkbox', { name: 'Selecionar página' }).check();
  await page.getByRole('button', { name: `Selecionar todas as ${MUITAS} frases` }).click();
  await page.locator('#btn-delete-selected').click();
  await page.getByRole('dialog').getByRole('button', { name: `Apagar ${MUITAS} frases` }).click();
  await expect(page.locator('#shell-total')).toHaveText('0');

  await expect.poll(() => fakes.google.frasesDe('uid-selecao').length, ATE_A_NUVEM_ESVAZIAR).toBe(0);
  await expect.poll(() => fakes.google.apagadasDe('uid-selecao').sort()).toEqual(idsDas(frases));
});

// O `chrome.storage.sync` aceita 512 itens, e cada frase apagada é um (`pm_del_{id}`): uma gravação que passava disso
// era recusada inteira, em silêncio, e nenhum tombstone ficava. Agora ficam os das frases mais novas que cabem.
test('apagar 520 frases de uma vez deixa no sync do Chrome o tombstone das 500 mais novas', async ({ page, extensao }) => {
  const frases = Array.from({ length: 520 }, (_, i) => ({
    id: 1_700_000_000_000 + i, texto: `The lighthouse keeper counted wave number ${i + 1}.`,
    data: new Date().toLocaleDateString('pt-BR'), streaming: 'manual', idioma: 'Inglês',
  }));
  await extensao.gravarStorage({ frases });
  await page.goto(extensao.url('painel.html'));
  await page.getByRole('checkbox', { name: 'Selecionar página' }).check();
  await page.getByRole('button', { name: 'Selecionar todas as 520 frases' }).click();
  await page.locator('#btn-delete-selected').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apagar 520 frases' }).click();
  await expect(page.locator('#shell-total')).toHaveText('0');

  const noSync = async () => Object.keys(await extensao.serviceWorker.evaluate(() => chrome.storage.sync.get(null))).sort();
  await estadoFinalEm('os tombstones no sync do Chrome', noSync, frases.slice(20).map(f => `pm_del_${f.id}`).sort());
});

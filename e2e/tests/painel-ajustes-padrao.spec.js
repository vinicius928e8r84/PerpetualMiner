'use strict';

// O Baralho padrão de uma pessoa nova é o que a Conexão cria (#366), e quem já gravou
// outro Baralho (o dono, com CIMV e RUSSIAN) não muda. O resto dos Ajustes de envio
// está em painel-ajustes.spec.js.

const { test, expect } = require('../fixtures');

const CHAVE = 'ankiBridgePresets';
const AGORA = new Date('2026-09-18T12:00:00');

async function abrirAjustes(page, extensao, gravado = {}) {
  await extensao.gravarStorage({ pm_anki_ja_conectou: true, ...gravado });
  await page.clock.setFixedTime(AGORA);
  await page.goto(extensao.url('painel.html#anki/ajustes'));
  await expect(page.getByRole('form', { name: /^Ajustes de envio · / })).toBeVisible();
}

const resumo = (page, idioma) => page.locator('#ajustes-cards .ajustes-card', { has: page.getByRole('button', { name: idioma, exact: true }) }).locator('.cfg-resumo');
const baralho = page => page.getByRole('textbox', { name: 'Baralho' });

test('sem nada gravado, o Baralho é o que a Conexão cria: PerpetualMiner::Inglês e PerpetualMiner::Russo', async ({ page, extensao }) => {
  await abrirAjustes(page, extensao);

  await expect(baralho(page)).toHaveValue('PerpetualMiner::Inglês');
  await expect(resumo(page, 'Inglês')).toHaveText('PerpetualMiner › Inglês · foto real');
  await expect(resumo(page, 'Russo')).toHaveText('PerpetualMiner › Russo · foto real');
});

test('quem já gravou CIMV e RUSSIAN os mantém', async ({ page, extensao }) => {
  const gravados = { en: { deckName: 'CIMV' }, ru: { deckName: 'RUSSIAN' } };
  await abrirAjustes(page, extensao, { [CHAVE]: gravados });

  await expect(baralho(page)).toHaveValue('CIMV');
  await expect(resumo(page, 'Inglês')).toHaveText('CIMV · foto real');
  await expect(resumo(page, 'Russo')).toHaveText('RUSSIAN · foto real');
  expect((await extensao.lerStorage(CHAVE))[CHAVE]).toEqual(gravados);
});

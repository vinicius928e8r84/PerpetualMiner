'use strict';

// Conexão com o Anki · Ajustes de envio por idioma (#35, docs/design/painel/anki/,
// variante C). Os azulejos Inglês · Russo mostram o baralho e a fonte de imagem
// gravados; o formulário é do idioma escolhido (Baralho, em branco volta ao
// padrão; Imagens, com a nota de custo; o sotaque do áudio no Avançado) e só
// grava em Salvar ajustes. Continua editável com a Conexão desligada.
//
// Fecha dois bugs de #9: o envio gravava os ajustes em silêncio e uma aba
// desatualizada sobrescrevia os ajustes mais novos; e, do lado do front, os
// nomes de Baralho padrão divergentes.
//
// A Conexão com o Anki é falsificada na fronteira HTTP (e2e/fakes/anki.js); os
// testes afirmam o que a pessoa vê e o que fica gravado (`ankiBridgePresets`).

const { test, expect } = require('../fixtures');

const AGORA = new Date('2026-09-18T12:00:00');
const HOJE = '18/09/2026';
const CHAVE = 'ankiBridgePresets';

const azulejos = page => page.getByRole('group', { name: 'Idioma dos ajustes' });
const azulejo = (page, idioma) => azulejos(page).getByRole('button', { name: new RegExp(`^[A-Z]{2} ${idioma}`) });
const formulario = page => page.getByRole('form', { name: /^Ajustes de envio · / });
const baralho = page => formulario(page).getByRole('textbox', { name: 'Baralho' });
const imagens = page => formulario(page).getByRole('combobox', { name: 'Imagens' });
const salvar = page => page.getByRole('button', { name: 'Salvar ajustes' });
const avancado = page => page.locator('#ajustes-avancado');
const toasts = page => page.locator('.veio-toast');
const NOTA_DESLIGADA = 'Os ajustes continuam editáveis com a conexão desligada. Valem a partir do próximo envio.';

async function abrirAjustes(page, extensao, { gravado = {} } = {}) {
  await extensao.gravarStorage({ pm_anki_ja_conectou: true, ...gravado });
  await page.clock.setFixedTime(AGORA);
  await page.goto(extensao.url('painel.html#anki/ajustes'));
  await expect(baralho(page)).toBeVisible();
}

async function ajustesGravados(extensao) {
  return (await extensao.lerStorage(CHAVE))[CHAVE];
}

const AJUSTES = {
  en: { deckName: 'Inglês::Mineradas', imageSource: '1', ttsWordTld: 'com', ttsPhraseTld: 'co.uk' },
  ru: { deckName: 'Русский', imageSource: '2', ttsWordTld: 'ru', ttsPhraseTld: 'ru' },
};

// ─── O formulário ────────────────────────────────────────────────────────────

test('sem nada gravado: os azulejos e o formulário mostram o Baralho padrão e a foto real, com a nota de custo', async ({ page, extensao }) => {
  await abrirAjustes(page, extensao);

  await expect(azulejo(page, 'Inglês')).toHaveAttribute('aria-pressed', 'true');
  await expect(azulejo(page, 'Inglês')).toContainText('CIMV');
  await expect(azulejo(page, 'Inglês')).toContainText('· foto real');
  await expect(azulejo(page, 'Russo')).toHaveAttribute('aria-pressed', 'false');
  await expect(azulejo(page, 'Russo')).toContainText('RUSSIAN');

  await expect(formulario(page)).toHaveAccessibleName('Ajustes de envio · Inglês');
  await expect(formulario(page)).toContainText('Baralho e imagens usados em cada envio em inglês.');
  await expect(baralho(page)).toHaveValue('CIMV');
  await expect(baralho(page)).toHaveAccessibleDescription('Em branco, volta para “CIMV”.');
  await expect(imagens(page)).toHaveValue('1');
  await expect(imagens(page).locator('option:checked')).toHaveText('Foto real (Google)');
  await expect(imagens(page)).toHaveAccessibleDescription('Quando não acha uma foto boa, gera uma por IA, e aí tem custo.');
  // Nada fica gravado só por abrir.
  expect(await ajustesGravados(extensao)).toBeUndefined();
});

test('o azulejo do Russo troca o formulário para o russo, com o que está gravado', async ({ page, extensao }) => {
  await abrirAjustes(page, extensao, { gravado: { [CHAVE]: AJUSTES } });

  await expect(azulejo(page, 'Inglês')).toContainText('Inglês › Mineradas');
  await expect(azulejo(page, 'Russo')).toContainText('· gerada por IA');
  await azulejo(page, 'Russo').click();

  await expect(azulejo(page, 'Russo')).toHaveAttribute('aria-pressed', 'true');
  await expect(formulario(page)).toHaveAccessibleName('Ajustes de envio · Russo');
  await expect(formulario(page)).toContainText('Baralho e imagens usados em cada envio em russo.');
  await expect(baralho(page)).toHaveValue('Русский');
  await expect(baralho(page)).toHaveAccessibleDescription('Em branco, volta para “RUSSIAN”.');
  await expect(imagens(page)).toHaveValue('2');
  await expect(imagens(page)).toHaveAccessibleDescription('Toda imagem é gerada por IA e entra nos custos.');
});

test('mexer no formulário não grava nada; Salvar ajustes grava só o idioma escolhido, com o toast BRG-07', async ({ page, extensao }) => {
  await abrirAjustes(page, extensao, { gravado: { [CHAVE]: AJUSTES } });

  await baralho(page).fill('Mineração');
  await imagens(page).selectOption({ label: 'Gerada por IA' });
  await expect(imagens(page)).toHaveAccessibleDescription('Toda imagem é gerada por IA e entra nos custos.');
  // O azulejo mostra o que está gravado, não o rascunho.
  await expect(azulejo(page, 'Inglês')).toContainText('· foto real');
  let gravado = await ajustesGravados(extensao);
  expect(gravado.en).toMatchObject(AJUSTES.en);

  await salvar(page).click();

  await expect(toasts(page)).toHaveText('Ajustes de envio salvos');
  await expect(azulejo(page, 'Inglês')).toContainText('Mineração');
  await expect(azulejo(page, 'Inglês')).toContainText('· gerada por IA');
  gravado = await ajustesGravados(extensao);
  expect(gravado.en).toMatchObject({ deckName: 'Mineração', imageSource: '2', ttsWordTld: 'com', ttsPhraseTld: 'co.uk' });
  expect(gravado.ru).toMatchObject(AJUSTES.ru);
});

test('Baralho em branco volta ao padrão ao salvar', async ({ page, extensao }) => {
  await abrirAjustes(page, extensao, { gravado: { [CHAVE]: AJUSTES } });

  await baralho(page).fill('   ');
  await salvar(page).click();

  await expect(toasts(page)).toHaveText('Ajustes de envio salvos');
  await expect(baralho(page)).toHaveValue('CIMV');
  await expect(azulejo(page, 'Inglês')).toContainText('CIMV');
  expect((await ajustesGravados(extensao)).en.deckName).toBe('CIMV');
});

test('Enter no Baralho salva como o botão', async ({ page, extensao }) => {
  await abrirAjustes(page, extensao);

  await baralho(page).fill('Filmes');
  await baralho(page).press('Enter');

  await expect(toasts(page)).toHaveText('Ajustes de envio salvos');
  expect((await ajustesGravados(extensao)).en.deckName).toBe('Filmes');
});

test('o rascunho de um idioma sobrevive à troca de azulejo, e Salvar grava só o idioma na tela', async ({ page, extensao }) => {
  await abrirAjustes(page, extensao, { gravado: { [CHAVE]: AJUSTES } });

  await baralho(page).fill('Rascunho EN');
  await azulejo(page, 'Russo').click();
  await baralho(page).fill('Русский 2');
  await salvar(page).click();
  await expect(toasts(page)).toHaveText('Ajustes de envio salvos');

  await azulejo(page, 'Inglês').click();
  await expect(baralho(page)).toHaveValue('Rascunho EN');
  const gravado = await ajustesGravados(extensao);
  expect(gravado.ru.deckName).toBe('Русский 2');
  expect(gravado.en.deckName).toBe('Inglês::Mineradas');
});

test('o sotaque do áudio fica no Avançado, recolhido, e é salvo com o resto', async ({ page, extensao }) => {
  await abrirAjustes(page, extensao);

  const palavra = page.getByRole('textbox', { name: 'Sotaque da palavra' });
  await expect(palavra).toBeHidden();
  await expect(avancado(page)).toContainText('Avançado');
  await expect(avancado(page)).toContainText('sotaque do áudio');
  await avancado(page).locator('summary').click();

  await expect(avancado(page)).toContainText('Sotaque do áudio: o domínio do Google usado na voz.');
  await expect(palavra).toHaveValue('com');
  await expect(page.getByRole('textbox', { name: 'Sotaque da frase' })).toHaveValue('co.uk');
  await palavra.fill('com.au');
  await page.getByRole('textbox', { name: 'Sotaque da frase' }).fill('');
  await salvar(page).click();

  await expect(toasts(page)).toHaveText('Ajustes de envio salvos');
  // Em branco, o sotaque também volta ao padrão.
  expect((await ajustesGravados(extensao)).en).toMatchObject({ ttsWordTld: 'com.au', ttsPhraseTld: 'co.uk' });
});

test('com a Conexão desligada, os ajustes continuam editáveis, com a nota BRG-33, e salvam', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await abrirAjustes(page, extensao);

  await expect(page.getByText(NOTA_DESLIGADA)).toBeVisible();
  await expect(baralho(page)).toBeEditable();
  await baralho(page).fill('Offline');
  await salvar(page).click();

  await expect(toasts(page)).toHaveText('Ajustes de envio salvos');
  expect((await ajustesGravados(extensao)).en.deckName).toBe('Offline');

  fakes.anki.ligar();
  await page.getByRole('button', { name: 'Tentar de novo' }).first().click();
  await expect(page.getByText(NOTA_DESLIGADA)).toBeHidden();
});

// ─── Bugs de #9 ──────────────────────────────────────────────────────────────

test('bug #9: enviar ao Anki sem tocar nos ajustes não grava ajustes, nem manda PUT à Conexão', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({
    frases: [{ id: 1_700_000_000_001, texto: 'Better late than never.', data: HOJE, streaming: 'netflix', idioma: 'Inglês' }],
  });
  await page.clock.setFixedTime(AGORA);
  await page.goto(extensao.url('painel.html#frases'));

  await page.locator('#frases-lista .veio-frase').getByRole('checkbox', { name: 'Selecionar frase' }).check();
  await page.locator('#frases-barra').getByRole('button', { name: 'Enviar ao Anki', exact: true }).click();
  await expect.poll(() => fakes.anki.envios.length).toBe(1);

  expect(fakes.anki.envios[0].corpo).toMatchObject({ deckName: 'CIMV', imageSource: '1', tts: { wordTld: 'com', phraseTld: 'co.uk' } });
  expect(await ajustesGravados(extensao)).toBeUndefined();
  expect(fakes.anki.requisicoes.filter(r => r.metodo === 'PUT')).toEqual([]);
});

test('bug #9: a aba desatualizada não sobrescreve os ajustes que outra aba salvou, e avisa', async ({ page, context, extensao }) => {
  await abrirAjustes(page, extensao, { gravado: { [CHAVE]: AJUSTES } });
  await baralho(page).fill('Da primeira aba');

  const outra = await context.newPage();
  await outra.goto(extensao.url('painel.html#anki/ajustes'));
  await baralho(outra).fill('Da segunda aba');
  await salvar(outra).click();
  await expect(toasts(outra)).toHaveText('Ajustes de envio salvos');

  await salvar(page).click();

  const aviso = page.getByRole('alert').filter({ hasText: 'Os ajustes de envio mudaram em outra aba do painel.' });
  await expect(aviso).toBeVisible();
  await expect(toasts(page)).toHaveCount(0);
  expect((await ajustesGravados(extensao)).en.deckName).toBe('Da segunda aba');
  // O rascunho fica na tela até a pessoa escolher trazer o que foi salvo.
  await expect(baralho(page)).toHaveValue('Da primeira aba');

  await aviso.getByRole('button', { name: 'Mostrar os ajustes novos' }).click();
  await expect(baralho(page)).toHaveValue('Da segunda aba');
  await expect(aviso).toBeHidden();
  await expect(baralho(page)).toBeFocused();

  // Agora em dia, esta aba salva de novo.
  await baralho(page).fill('De novo da primeira');
  await salvar(page).click();
  await expect(toasts(page)).toHaveText('Ajustes de envio salvos');
  expect((await ajustesGravados(extensao)).en.deckName).toBe('De novo da primeira');
});

test('a aba sem rascunho acompanha o que outra aba salvou, nos azulejos e no formulário', async ({ page, context, extensao }) => {
  await abrirAjustes(page, extensao, { gravado: { [CHAVE]: AJUSTES } });

  const outra = await context.newPage();
  await outra.goto(extensao.url('painel.html#anki/ajustes'));
  await azulejo(outra, 'Russo').click();
  await baralho(outra).fill('Русский новый');
  await salvar(outra).click();
  await expect(toasts(outra)).toHaveText('Ajustes de envio salvos');

  await expect(azulejo(page, 'Russo')).toContainText('Русский новый');
  await azulejo(page, 'Russo').click();
  await expect(baralho(page)).toHaveValue('Русский новый');
  // O que a outra aba não mexeu continua como estava.
  expect((await ajustesGravados(extensao)).en).toMatchObject(AJUSTES.en);
});

// ─── Um Baralho padrão só ────────────────────────────────────────────────────

test('o Baralho padrão é o mesmo em Ajustes, em Baralhos e termos e no envio', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({
    frases: [{ id: 1_700_000_000_001, texto: 'Better late than never.', data: HOJE, streaming: 'netflix', idioma: 'Inglês' }],
  });
  await abrirAjustes(page, extensao);
  await expect(baralho(page)).toHaveValue('CIMV');

  // Baralhos e termos pede os números dos mesmos baralhos.
  await page.goto(extensao.url('painel.html#anki/baralhos'));
  await expect.poll(() => fakes.anki.requisicoes.filter(r => r.caminho === '/anki/stats/decks').length).toBeGreaterThan(0);
  const busca = new URLSearchParams(fakes.anki.requisicoes.find(r => r.caminho === '/anki/stats/decks').busca);
  expect(busca.getAll('deck')).toEqual(['CIMV', 'RUSSIAN']);

  // E o envio vai para ele.
  await page.goto(extensao.url('painel.html#frases'));
  await page.locator('#frases-lista .veio-frase').getByRole('checkbox', { name: 'Selecionar frase' }).check();
  await page.locator('#frases-barra').getByRole('button', { name: 'Enviar ao Anki', exact: true }).click();
  await expect.poll(() => fakes.anki.envios.length).toBe(1);
  expect(fakes.anki.envios[0].corpo.deckName).toBe('CIMV');
});

test('o envio usa os ajustes salvos por outra aba, não os que esta aba leu ao abrir', async ({ page, context, extensao, fakes }) => {
  await extensao.gravarStorage({
    frases: [{ id: 1_700_000_000_001, texto: 'Better late than never.', data: HOJE, streaming: 'netflix', idioma: 'Inglês' }],
  });
  await page.clock.setFixedTime(AGORA);
  await page.goto(extensao.url('painel.html#frases'));
  await expect(page.locator('#frases-lista .veio-frase')).toHaveCount(1);

  const outra = await context.newPage();
  await outra.goto(extensao.url('painel.html#anki/ajustes'));
  await baralho(outra).fill('Salvo na outra aba');
  await imagens(outra).selectOption({ label: 'Gerada por IA' });
  await salvar(outra).click();
  await expect(toasts(outra)).toHaveText('Ajustes de envio salvos');

  await page.bringToFront();
  await page.locator('#frases-lista .veio-frase').getByRole('checkbox', { name: 'Selecionar frase' }).check();
  await page.locator('#frases-barra').getByRole('button', { name: 'Enviar ao Anki', exact: true }).click();
  await expect.poll(() => fakes.anki.envios.length).toBe(1);
  expect(fakes.anki.envios[0].corpo).toMatchObject({ deckName: 'Salvo na outra aba', imageSource: '2' });
});

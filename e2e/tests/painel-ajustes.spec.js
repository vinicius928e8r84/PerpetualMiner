'use strict';

// Conexão com o Anki · Ajustes de envio por idioma (#35, docs/design/painel/anki/prototipo-ajustes-envio.html,
// variante A · Cartões). Um card por idioma, recolhível como os de Configurações: fechado, diz o
// baralho e a fonte de imagem gravados; aberto, traz o formulário do idioma (Baralho, Imagens, com a
// nota de custo; o sotaque do áudio no Avançado) e só grava em Salvar ajustes. O Baralho é uma
// escolha entre os baralhos que o Anki tem; sem a lista, um campo de texto. Continua editável com a
// Conexão desligada.
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

const cards = page => page.locator('#ajustes-cards');
const cabeca = (page, idioma) => cards(page).getByRole('button', { name: idioma, exact: true });
const resumo = (page, idioma) => cards(page).locator('.ajustes-card', { has: page.getByRole('button', { name: idioma, exact: true }) }).locator('.cfg-resumo');
const formulario = (page, idioma) => page.getByRole('form', { name: idioma ? `Ajustes de envio · ${idioma}` : /^Ajustes de envio · / });
const baralho = (page, idioma) => formulario(page, idioma).getByRole('textbox', { name: 'Baralho' });
const escolhaDeBaralho = (page, idioma) => formulario(page, idioma).getByRole('combobox', { name: 'Baralho' });
const imagens = (page, opcao, idioma) => formulario(page, idioma).getByRole('radio', { name: opcao });
// O radio do controle segmentado é invisível: a pessoa clica no rótulo.
const escolherImagens = (page, opcao, idioma) => formulario(page, idioma).locator('label', { hasText: opcao }).click();
const salvar = (page, idioma) => formulario(page, idioma).getByRole('button', { name: 'Salvar ajustes' });
const situacao = (page, idioma) => formulario(page, idioma).getByRole('status');
const avancado = (page, idioma) => formulario(page, idioma).locator('details');
const toasts = page => page.locator('.veio-toast');
const NOTA_DESLIGADA = 'Os ajustes continuam editáveis com a conexão desligada. Valem a partir do próximo envio.';

async function abrirAjustes(page, extensao, { gravado = {} } = {}) {
  await extensao.gravarStorage({ pm_anki_ja_conectou: true, ...gravado });
  await page.clock.setFixedTime(AGORA);
  await page.goto(extensao.url('painel.html#anki/ajustes'));
  await expect(formulario(page)).toBeVisible();
}

async function ajustesGravados(extensao) {
  return (await extensao.lerStorage(CHAVE))[CHAVE];
}

const AJUSTES = {
  en: { deckName: 'Inglês::Mineradas', imageSource: '1', ttsWordTld: 'com', ttsPhraseTld: 'co.uk' },
  ru: { deckName: 'Русский', imageSource: '2', ttsWordTld: 'ru', ttsPhraseTld: 'ru' },
};

// ─── Os cards e o formulário ─────────────────────────────────────────────────

test('sem nada gravado: os cards dizem o Baralho padrão e a foto real; o do Inglês abre com a nota de custo', async ({ page, extensao }) => {
  await abrirAjustes(page, extensao);

  await expect(resumo(page, 'Inglês')).toHaveText('CIMV · foto real');
  await expect(resumo(page, 'Russo')).toHaveText('RUSSIAN · foto real');
  await expect(cabeca(page, 'Inglês')).toHaveAttribute('aria-expanded', 'true');
  await expect(cabeca(page, 'Russo')).toHaveAttribute('aria-expanded', 'false');

  await expect(formulario(page)).toHaveAccessibleName('Ajustes de envio · Inglês');
  await expect(cards(page)).toContainText('Baralho e imagens usados em cada envio em inglês.');
  await expect(baralho(page)).toHaveValue('CIMV');
  await expect(baralho(page)).toHaveAccessibleDescription('Em branco, volta para “CIMV”.');
  await expect(imagens(page, 'Foto real (Google)')).toBeChecked();
  await expect(formulario(page)).toContainText('Quando não acha uma foto boa, gera uma por IA, e aí tem custo.');
  await expect(situacao(page)).toHaveText('Salvo');
  // Nada fica gravado só por abrir.
  expect(await ajustesGravados(extensao)).toBeUndefined();
});

test('o card do Russo abre no lugar do Inglês, com o que está gravado', async ({ page, extensao }) => {
  await abrirAjustes(page, extensao, { gravado: { [CHAVE]: AJUSTES } });

  await expect(resumo(page, 'Inglês')).toHaveText('Inglês › Mineradas · foto real');
  await expect(resumo(page, 'Russo')).toHaveText('Русский · gerada por IA');
  await cabeca(page, 'Russo').click();

  await expect(cabeca(page, 'Russo')).toHaveAttribute('aria-expanded', 'true');
  await expect(cabeca(page, 'Inglês')).toHaveAttribute('aria-expanded', 'false');
  await expect(formulario(page)).toHaveCount(1);
  await expect(formulario(page)).toHaveAccessibleName('Ajustes de envio · Russo');
  await expect(baralho(page)).toHaveValue('Русский');
  await expect(baralho(page)).toHaveAccessibleDescription('Em branco, volta para “RUSSIAN”.');
  await expect(imagens(page, 'Gerada por IA')).toBeChecked();
  await expect(formulario(page)).toContainText('Toda imagem é gerada por IA e entra nos custos.');
});

test('mexer no formulário não grava nada; Salvar ajustes grava só o idioma aberto, com o toast BRG-07', async ({ page, extensao }) => {
  await abrirAjustes(page, extensao, { gravado: { [CHAVE]: AJUSTES } });
  await expect(situacao(page)).toHaveText('Salvo');
  await expect(salvar(page)).toHaveClass(/veio-botao--secundario/);

  await baralho(page).fill('Mineração');
  await escolherImagens(page, 'Gerada por IA');
  await expect(formulario(page)).toContainText('Toda imagem é gerada por IA e entra nos custos.');
  await expect(situacao(page)).toHaveText('Alterações não salvas');
  await expect(salvar(page)).toHaveClass(/veio-botao--primario/);
  // O card fechado mostra o que está gravado, não o rascunho.
  await expect(resumo(page, 'Inglês')).toHaveText('Inglês › Mineradas · foto real');
  let gravado = await ajustesGravados(extensao);
  expect(gravado.en).toMatchObject(AJUSTES.en);

  await salvar(page).click();

  await expect(toasts(page)).toHaveText('Ajustes de envio salvos');
  await expect(situacao(page)).toHaveText('Salvo');
  await cabeca(page, 'Inglês').click();
  await expect(resumo(page, 'Inglês')).toHaveText('Mineração · gerada por IA');
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
  await expect(resumo(page, 'Inglês')).toHaveText('CIMV · foto real');
  expect((await ajustesGravados(extensao)).en.deckName).toBe('CIMV');
});

test('Enter no Baralho salva como o botão', async ({ page, extensao }) => {
  await abrirAjustes(page, extensao);

  await baralho(page).fill('Filmes');
  await baralho(page).press('Enter');

  await expect(toasts(page)).toHaveText('Ajustes de envio salvos');
  expect((await ajustesGravados(extensao)).en.deckName).toBe('Filmes');
});

test('o rascunho de um idioma sobrevive a abrir e fechar os cards, e Salvar grava só o idioma aberto', async ({ page, extensao }) => {
  await abrirAjustes(page, extensao, { gravado: { [CHAVE]: AJUSTES } });

  await baralho(page).fill('Rascunho EN');
  await cabeca(page, 'Russo').click();
  await baralho(page).fill('Русский 2');
  await salvar(page).click();
  await expect(toasts(page)).toHaveText('Ajustes de envio salvos');

  await cabeca(page, 'Inglês').click();
  await expect(baralho(page)).toHaveValue('Rascunho EN');
  await expect(situacao(page)).toHaveText('Alterações não salvas');
  const gravado = await ajustesGravados(extensao);
  expect(gravado.ru.deckName).toBe('Русский 2');
  expect(gravado.en.deckName).toBe('Inglês::Mineradas');
});

test('o card abre e fecha com o teclado, pelo botão com o nome do idioma', async ({ page, extensao }) => {
  await abrirAjustes(page, extensao);

  await cabeca(page, 'Inglês').focus();
  await page.keyboard.press('Enter');
  await expect(cabeca(page, 'Inglês')).toHaveAttribute('aria-expanded', 'false');
  await expect(formulario(page)).toHaveCount(0);
  await expect(cabeca(page, 'Inglês')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(cabeca(page, 'Inglês')).toHaveAttribute('aria-expanded', 'true');
  await expect(baralho(page)).toBeVisible();
});

// ─── O sotaque ───────────────────────────────────────────────────────────────

test('o sotaque do áudio fica no Avançado, recolhido, escolhido pelo nome do lugar, e é salvo com o resto', async ({ page, extensao }) => {
  await abrirAjustes(page, extensao);

  const palavra = formulario(page).getByRole('combobox', { name: 'Sotaque da palavra' });
  const frase = formulario(page).getByRole('combobox', { name: 'Sotaque da frase' });
  await expect(palavra).toBeHidden();
  await expect(avancado(page)).toContainText('Avançado');
  await expect(avancado(page)).toContainText('sotaque do áudio');
  await avancado(page).locator('summary').click();

  await expect(avancado(page)).toContainText('Escolha o sotaque da voz que fala a palavra e a frase.');
  await expect(avancado(page).getByText('Inglês', { exact: true })).toBeVisible();
  // O gravado aparece pelo nome do lugar, sem o domínio do Google.
  await expect(palavra.locator('option:checked')).toHaveText('Estados Unidos');
  await expect(frase.locator('option:checked')).toHaveText('Reino Unido');
  await expect(avancado(page)).not.toContainText('co.uk');
  await palavra.selectOption({ label: 'Austrália' });
  await frase.selectOption({ label: 'Índia' });
  await salvar(page).click();

  await expect(toasts(page)).toHaveText('Ajustes de envio salvos');
  expect((await ajustesGravados(extensao)).en).toMatchObject({ ttsWordTld: 'com.au', ttsPhraseTld: 'co.in' });
});

test('um sotaque gravado fora da lista continua escolhido e não se perde ao salvar', async ({ page, extensao }) => {
  await abrirAjustes(page, extensao, {
    gravado: { [CHAVE]: { ...AJUSTES, en: { ...AJUSTES.en, ttsWordTld: 'com.ng' } } },
  });
  await avancado(page).locator('summary').click();

  const palavra = formulario(page).getByRole('combobox', { name: 'Sotaque da palavra' });
  await expect(palavra.locator('option:checked')).toHaveText('com.ng');
  await baralho(page).fill('Outro baralho');
  await salvar(page).click();

  await expect(toasts(page)).toHaveText('Ajustes de envio salvos');
  expect((await ajustesGravados(extensao)).en).toMatchObject({ deckName: 'Outro baralho', ttsWordTld: 'com.ng' });
});

// ─── Os baralhos do Anki ─────────────────────────────────────────────────────

test('com a Conexão ligada, o Baralho é uma escolha entre os baralhos do Anki, com o nome legível', async ({ page, extensao, fakes }) => {
  fakes.anki.definirBaralhosDoAnki(['CIMV', 'English Mining', 'Inglês::Mineradas', 'RUSSIAN']);
  await extensao.gravarStorage({ pm_anki_ja_conectou: true, [CHAVE]: AJUSTES });
  await page.clock.setFixedTime(AGORA);
  await page.goto(extensao.url('painel.html#anki/ajustes'));

  await expect(escolhaDeBaralho(page)).toBeVisible();
  await expect(baralho(page)).toHaveCount(0);
  await expect(escolhaDeBaralho(page).locator('option')).toHaveText(['CIMV', 'English Mining', 'Inglês › Mineradas', 'RUSSIAN']);
  await expect(escolhaDeBaralho(page).locator('option:checked')).toHaveText('Inglês › Mineradas');

  await escolhaDeBaralho(page).selectOption({ label: 'English Mining' });
  await expect(situacao(page)).toHaveText('Alterações não salvas');
  expect((await ajustesGravados(extensao)).en.deckName).toBe('Inglês::Mineradas');
  await salvar(page).click();

  await expect(toasts(page)).toHaveText('Ajustes de envio salvos');
  await expect(escolhaDeBaralho(page).locator('option:checked')).toHaveText('English Mining');
  expect((await ajustesGravados(extensao)).en.deckName).toBe('English Mining');
});

test('um baralho gravado que o Anki não tem continua na lista, dizendo que não está no Anki', async ({ page, extensao, fakes }) => {
  fakes.anki.definirBaralhosDoAnki(['English Mining']);
  await extensao.gravarStorage({ pm_anki_ja_conectou: true, [CHAVE]: AJUSTES });
  await page.clock.setFixedTime(AGORA);
  await page.goto(extensao.url('painel.html#anki/ajustes'));

  await expect(escolhaDeBaralho(page).locator('option:checked')).toHaveText('Inglês › Mineradas · não está no Anki');
  // O padrão também fica ao alcance, para voltar a ele.
  await expect(escolhaDeBaralho(page).locator('option', { hasText: 'CIMV · não está no Anki' })).toHaveCount(1);
});

test('sem a lista do Anki, o Baralho é um campo de texto, e um nome com nível vazio é recusado no campo', async ({ page, extensao }) => {
  await abrirAjustes(page, extensao, { gravado: { [CHAVE]: AJUSTES } });
  await expect(escolhaDeBaralho(page)).toHaveCount(0);

  await baralho(page).fill('Inglês::');
  await salvar(page).click();

  await expect(baralho(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(baralho(page)).toHaveAccessibleDescription('Tem um nível vazio. Exemplo: Inglês::Mineradas');
  await expect(baralho(page)).toBeFocused();
  await expect(toasts(page)).toHaveCount(0);
  expect((await ajustesGravados(extensao)).en.deckName).toBe('Inglês::Mineradas');

  await baralho(page).fill('Inglês::Filmes');
  await expect(baralho(page)).not.toHaveAttribute('aria-invalid', 'true');
  await salvar(page).click();
  await expect(toasts(page)).toHaveText('Ajustes de envio salvos');
  expect((await ajustesGravados(extensao)).en.deckName).toBe('Inglês::Filmes');
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

  const aviso = page.getByRole('alert').filter({ hasText: 'Mudou em outra aba. Nada foi salvo aqui.' });
  await expect(aviso).toBeVisible();
  await expect(toasts(page)).toHaveCount(0);
  expect((await ajustesGravados(extensao)).en.deckName).toBe('Da segunda aba');
  // O rascunho fica na tela até a pessoa escolher trazer o que foi salvo.
  await expect(baralho(page)).toHaveValue('Da primeira aba');

  await aviso.getByRole('button', { name: 'Ver os novos' }).click();
  await expect(baralho(page)).toHaveValue('Da segunda aba');
  await expect(aviso).toBeHidden();
  await expect(baralho(page)).toBeFocused();

  // Agora em dia, esta aba salva de novo.
  await baralho(page).fill('De novo da primeira');
  await salvar(page).click();
  await expect(toasts(page)).toHaveText('Ajustes de envio salvos');
  expect((await ajustesGravados(extensao)).en.deckName).toBe('De novo da primeira');
});

test('a aba sem rascunho acompanha o que outra aba salvou, nos cards e no formulário', async ({ page, context, extensao }) => {
  await abrirAjustes(page, extensao, { gravado: { [CHAVE]: AJUSTES } });

  const outra = await context.newPage();
  await outra.goto(extensao.url('painel.html#anki/ajustes'));
  await cabeca(outra, 'Russo').click();
  await baralho(outra).fill('Русский новый');
  await salvar(outra).click();
  await expect(toasts(outra)).toHaveText('Ajustes de envio salvos');

  await expect(resumo(page, 'Russo')).toContainText('Русский новый');
  await cabeca(page, 'Russo').click();
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
  await escolherImagens(outra, 'Gerada por IA');
  await salvar(outra).click();
  await expect(toasts(outra)).toHaveText('Ajustes de envio salvos');

  await page.bringToFront();
  await page.locator('#frases-lista .veio-frase').getByRole('checkbox', { name: 'Selecionar frase' }).check();
  await page.locator('#frases-barra').getByRole('button', { name: 'Enviar ao Anki', exact: true }).click();
  await expect.poll(() => fakes.anki.envios.length).toBe(1);
  expect(fakes.anki.envios[0].corpo).toMatchObject({ deckName: 'Salvo na outra aba', imageSource: '2' });
});

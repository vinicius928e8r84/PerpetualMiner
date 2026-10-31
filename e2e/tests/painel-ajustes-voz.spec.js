'use strict';

// Conexão com o Anki · a voz e o sotaque do áudio, no Avançado dos Ajustes de envio (#174, #107): os dois sotaques da voz do
// Google (a padrão), a voz de reserva (uma lista aberta a outros provedores, que começa pela OpenAI, pela chave) e um Ouvir ao
// lado de cada seletor. A voz do próprio Anki (`{{tts}}`) não entra.
//
// A Conexão é falsificada na fronteira HTTP (e2e/fakes/anki.js, o contrato `exemplos-da-voz.json`); o teste confere o que a pessoa vê,
// o que atravessou o HTTP, o que o Chromium tocou e o que ficou gravado (`ankiBridgePresets`).

const { test, expect } = require('../fixtures');
const { MP3_DE_MENTIRA } = require('../fakes/voz');
const { estadoFinal } = require('../estado-final');

const CHAVE = 'ankiBridgePresets';
const AJUSTES = {
  en: { deckName: 'Inglês', imageSource: '1', ttsWordTld: 'com', ttsPhraseTld: 'co.uk' },
  ru: { deckName: 'Русский', imageSource: '1', ttsWordTld: 'ru', ttsPhraseTld: 'ru' },
};

const formulario = page => page.getByRole('form', { name: /^Ajustes de envio · / });
const avancado = page => formulario(page).locator('details');
const sotaqueDaPalavra = page => formulario(page).getByRole('combobox', { name: 'Sotaque da palavra' });
const reserva = page => formulario(page).getByRole('combobox', { name: 'Voz de reserva' });
const ouvir = (page, campo) => formulario(page).getByRole('button', { name: `Ouvir · ${campo}` });
const salvar = page => formulario(page).getByRole('button', { name: 'Salvar ajustes' });
const pedidosDeOuvir = fakes => fakes.anki.requisicoes.filter(r => r.caminho === '/voz/ouvir').map(r => r.dados);

// O Chromium toca de verdade; o teste só anota o que foi posto para tocar (a fonte de cada `play()`).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.tocados = [];
    const tocar = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      window.tocados.push(this.src);
      return tocar.call(this);
    };
  });
});

async function abrirOAvancado(page, extensao, { gravado = {} } = {}) {
  await extensao.gravarStorage({ pm_anki_ja_conectou: true, ...gravado });
  await page.goto(extensao.url('painel.html#anki/ajustes'));
  await expect(formulario(page)).toBeVisible();
  await avancado(page).locator('summary').click();
}

const tocados = page => page.evaluate(() => window.tocados);
const gravado = async extensao => (await extensao.lerStorage(CHAVE))[CHAVE];

// Exceção de teste: sem-estado-guardado — só mostra os seletores e o Ouvir; nada é gravado.
test('o Avançado se chama voz e sotaque do áudio e traz os dois sotaques do Google e a voz de reserva, cada um com o Ouvir', async ({ page, extensao }) => {
  await extensao.gravarStorage({ pm_anki_ja_conectou: true });
  await page.goto(extensao.url('painel.html#anki/ajustes'));
  await expect(avancado(page).locator('summary')).toHaveText('Avançado · voz e sotaque do áudio');
  await avancado(page).locator('summary').click();

  await expect(sotaqueDaPalavra(page)).toBeVisible();
  await expect(formulario(page).getByRole('combobox', { name: 'Sotaque da frase' })).toBeVisible();
  await expect(reserva(page)).toBeVisible();
  for (const campo of ['Sotaque da palavra', 'Sotaque da frase', 'Voz de reserva']) await expect(ouvir(page, campo)).toBeVisible();
  await expect(formulario(page).getByRole('button', { name: /^Ouvir/ })).toHaveCount(3);
});

// Exceção de teste: sem-estado-guardado — só mostra a lista da reserva e a nota; nada é gravado.
test('a voz de reserva padrão é a OpenAI pela chave, e a lista não tem a voz do Anki', async ({ page, extensao }) => {
  await abrirOAvancado(page, extensao);

  await expect(reserva(page).locator('option:checked')).toHaveText('OpenAI, pela chave');
  await expect(reserva(page).locator('option')).toHaveText(['OpenAI, pela chave', 'Sem reserva']);
  await expect(avancado(page)).toContainText('Fala quando o Google falha. Usa a chave da OpenAI: cerca de US$ 0,001 por cartão.');
});

test('Ouvir o sotaque da palavra toca a voz do Google no sotaque que está na tela, sem gravar nada', async ({ page, extensao, fakes }) => {
  await abrirOAvancado(page, extensao);
  await sotaqueDaPalavra(page).selectOption({ label: 'Austrália' });

  await ouvir(page, 'Sotaque da palavra').click();

  await expect.poll(() => tocados(page)).toEqual([`data:audio/mpeg;base64,${MP3_DE_MENTIRA}`]);
  expect(pedidosDeOuvir(fakes)).toEqual([{ lang: 'en', provedor: 'google', sotaque: 'com.au' }]);
  // Ouvir não grava nada: os ajustes seguem sem nada guardado.
  await estadoFinal(extensao, { [CHAVE]: null });
});

test('Ouvir o sotaque da frase pede o sotaque da frase', async ({ page, extensao, fakes }) => {
  await abrirOAvancado(page, extensao);

  await ouvir(page, 'Sotaque da frase').click();

  await expect.poll(() => pedidosDeOuvir(fakes)).toEqual([{ lang: 'en', provedor: 'google', sotaque: 'co.uk' }]);
  await estadoFinal(extensao, { [CHAVE]: null });
});

test('no russo o Ouvir fala em russo, com o sotaque gravado', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ pm_anki_ja_conectou: true, [CHAVE]: AJUSTES });
  await page.goto(extensao.url('painel.html#anki/ajustes'));
  await page.getByRole('button', { name: 'Russo', exact: true }).click();
  await avancado(page).locator('summary').click();

  await ouvir(page, 'Sotaque da frase').click();

  await expect.poll(() => pedidosDeOuvir(fakes)).toEqual([{ lang: 'ru', provedor: 'google', sotaque: 'ru' }]);
  await expect.poll(() => tocados(page)).toHaveLength(1);
  await estadoFinal(extensao, { [CHAVE]: AJUSTES });
});

test('Ouvir a voz de reserva toca a voz da OpenAI pela chave da Conexão', async ({ page, extensao, fakes }) => {
  fakes.anki.guardarChaveNaConexao('9f3a');
  await abrirOAvancado(page, extensao);

  await ouvir(page, 'Voz de reserva').click();

  await expect.poll(() => tocados(page)).toEqual([`data:audio/mpeg;base64,${MP3_DE_MENTIRA}`]);
  expect(pedidosDeOuvir(fakes)).toEqual([{ lang: 'en', provedor: 'openai' }]);
  await estadoFinal(extensao, { [CHAVE]: null });
});

test('sem a chave na Conexão, Ouvir a voz de reserva diz que falta a chave e nada toca', async ({ page, extensao }) => {
  await abrirOAvancado(page, extensao);

  await ouvir(page, 'Voz de reserva').click();

  await expect(avancado(page)).toContainText('A voz da OpenAI usa a chave. Ponha-a no card da IA dos cartões.');
  expect(await tocados(page)).toEqual([]);
  await estadoFinal(extensao, { [CHAVE]: null });
});

test('com o Google recusando o pedido, Ouvir diz que não deu para tocar e nada toca', async ({ page, extensao, fakes }) => {
  fakes.anki.voz.definir('recusada');
  await abrirOAvancado(page, extensao);

  await ouvir(page, 'Sotaque da palavra').click();

  await expect(avancado(page)).toContainText('Não deu para tocar esta voz. Tente de novo.');
  expect(await tocados(page)).toEqual([]);
  // O erro some quando a voz volta e a pessoa tenta de novo.
  fakes.anki.voz.definir('aceita');
  await ouvir(page, 'Sotaque da palavra').click();
  // O Ouvir volta a ficar ativo quando o pedido e o toque terminam: só então o que a tela diz é a resposta, não o meio do caminho.
  await expect(ouvir(page, 'Sotaque da palavra')).toBeEnabled();
  await expect(avancado(page)).not.toContainText('Não deu para tocar esta voz.');
  await expect.poll(() => tocados(page)).toHaveLength(1);
  await estadoFinal(extensao, { [CHAVE]: null });
});

test('com a Conexão desligada, Ouvir diz que ela está desligada', async ({ page, extensao, fakes }) => {
  await abrirOAvancado(page, extensao);
  fakes.anki.desligar();

  await ouvir(page, 'Sotaque da palavra').click();

  await expect(avancado(page)).toContainText('A Conexão com o Anki está desligada. Ligue-a neste computador para ouvir.');
  expect(await tocados(page)).toEqual([]);
  await estadoFinal(extensao, { [CHAVE]: null });
});

test('Sem reserva fica gravado, volta ao reabrir, avisa o que acontece e desliga o Ouvir da reserva', async ({ page, extensao }) => {
  await abrirOAvancado(page, extensao);

  await reserva(page).selectOption({ label: 'Sem reserva' });
  await expect(avancado(page)).toContainText('Se o Google falhar, o cartão não entra no Anki.');
  await expect(ouvir(page, 'Voz de reserva')).toBeDisabled();
  await estadoFinal(extensao, { [CHAVE]: null }); // escolher não grava: só Salvar ajustes grava
  await salvar(page).click();

  await expect(page.locator('.veio-toast')).toHaveText('Ajustes de envio salvos');
  expect((await gravado(extensao)).en).toMatchObject({ ttsReserva: 'nenhuma', ttsWordTld: 'com', ttsPhraseTld: 'co.uk' });
  await page.reload();
  await avancado(page).locator('summary').click();
  await expect(reserva(page).locator('option:checked')).toHaveText('Sem reserva');
  await estadoFinal(extensao, { [CHAVE]: { en: { ttsReserva: 'nenhuma' } } });
});

test('uma reserva gravada que a extensão não conhece volta a ser a padrão, sem apagar o resto', async ({ page, extensao }) => {
  await abrirOAvancado(page, extensao, { gravado: { [CHAVE]: { ...AJUSTES, en: { ...AJUSTES.en, ttsReserva: 'outro-provedor' } } } });

  await expect(reserva(page).locator('option:checked')).toHaveText('OpenAI, pela chave');
  await expect(sotaqueDaPalavra(page).locator('option:checked')).toHaveText('Estados Unidos');
  // Abrir não regrava: o valor desconhecido segue guardado como estava.
  await estadoFinal(extensao, { [CHAVE]: { en: { ttsReserva: 'outro-provedor' } } });
});

test('o Envio leva a lista de reserva só quando a pessoa a mudou: sem ela, a Conexão usa a OpenAI', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({
    frases: [{ id: 1_700_000_000_001, texto: 'Better late than never.', data: '18/09/2026', streaming: 'netflix', idioma: 'Inglês' }],
    [CHAVE]: AJUSTES,
  });
  await page.goto(extensao.url('painel.html#frases'));
  await page.locator('#frases-lista .veio-frase').getByRole('checkbox', { name: 'Selecionar frase' }).check();
  await page.locator('#frases-barra').getByRole('button', { name: 'Enviar ao Anki', exact: true }).click();
  await expect.poll(() => fakes.anki.envios.length).toBe(1);
  expect(fakes.anki.envios[0].corpo.tts).toEqual({ wordTld: 'com', phraseTld: 'co.uk' });
});

test('com Sem reserva gravada, o Envio leva a lista vazia', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({
    frases: [{ id: 1_700_000_000_001, texto: 'Better late than never.', data: '18/09/2026', streaming: 'netflix', idioma: 'Inglês' }],
    [CHAVE]: { ...AJUSTES, en: { ...AJUSTES.en, ttsReserva: 'nenhuma' } },
  });
  await page.goto(extensao.url('painel.html#frases'));
  await page.locator('#frases-lista .veio-frase').getByRole('checkbox', { name: 'Selecionar frase' }).check();
  await page.locator('#frases-barra').getByRole('button', { name: 'Enviar ao Anki', exact: true }).click();
  await expect.poll(() => fakes.anki.envios.length).toBe(1);
  expect(fakes.anki.envios[0].corpo.tts).toEqual({ wordTld: 'com', phraseTld: 'co.uk', reserva: [] });
});

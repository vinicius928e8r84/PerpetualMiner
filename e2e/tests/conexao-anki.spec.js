'use strict';

// O ciclo de vida da Conexão com o Anki (lib/conexao-anki.js), visto de quem o
// acompanha: o ponto do painel, a faixa F1, a nota do popup e o fato gravado
// “já respondeu neste computador” (`pm_anki_ja_conectou`).
//
// Três situações (Conectando, Ligada, Desligada) e uma porta que aceita e não
// responde, que conta como desligada em 3 s. Os testes afirmam o que a pessoa
// vê e o que fica gravado, nunca funções internas.

const { test, expect } = require('../fixtures');

const pontoDaConexao = page => page.locator('.shell-ponto');
const faixaF1 = page => page.getByText('A conexão com o Anki está desligada. Ligue-a neste computador e tente de novo.');
const notaDoPopup = page => page.getByText(/Nada é minerado com a Conexão com o Anki desligada/);

const lerJaConectou = async extensao => (await extensao.lerStorage('pm_anki_ja_conectou')).pm_anki_ja_conectou ?? false;
const inicioDoHealth = page => page.waitForRequest('http://127.0.0.1:8766/health', { timeout: 2500 }).then(() => Date.now());
const ateTresSegundos = inicio => Math.max(1, 3200 - (Date.now() - inicio));

test('painel: uma porta que aceita e não responde conta como desligada em 3 s, e antes disso é Conectando', async ({ page, extensao, fakes }) => {
  fakes.anki.silenciar();
  await extensao.gravarStorage({ pm_anki_ja_conectou: true });
  const inicio = inicioDoHealth(page);
  await page.goto(extensao.url('painel.html#anki/custos'));
  const instante = await inicio;

  await expect(pontoDaConexao(page)).toHaveAttribute('data-estado', 'conectando');
  await page.waitForTimeout(Math.max(0, 1500 - (Date.now() - instante)));
  await expect(pontoDaConexao(page)).toHaveAttribute('data-estado', 'conectando');

  await expect(pontoDaConexao(page)).toHaveAttribute('data-estado', 'desligada', { timeout: ateTresSegundos(instante) });
  await expect(faixaF1(page)).toBeVisible();
  expect(await lerJaConectou(extensao)).toBe(true);
});

test('painel: a porta muda é detectada mesmo se a leitura do fato não termina', async ({ page, extensao, fakes }) => {
  fakes.anki.silenciar();
  await page.addInitScript(() => {
    const ler = chrome.storage.local.get.bind(chrome.storage.local);
    chrome.storage.local.get = (...args) => {
      if (args[0] && typeof args[0] === 'object' && 'pm_anki_ja_conectou' in args[0]) return new Promise(() => {});
      return ler(...args);
    };
  });
  const inicio = inicioDoHealth(page);
  await page.goto(extensao.url('painel.html#anki/custos'));
  const instante = await inicio;
  await expect(pontoDaConexao(page)).toHaveAttribute('data-estado', 'desligada', { timeout: ateTresSegundos(instante) });
  await expect(faixaF1(page)).toBeVisible();
});

test('painel: falha na leitura do fato não impede conferir a Conexão', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await page.addInitScript(() => {
    const ler = chrome.storage.local.get.bind(chrome.storage.local);
    chrome.storage.local.get = (...args) => {
      if (args[0] && typeof args[0] === 'object' && 'pm_anki_ja_conectou' in args[0]) return Promise.reject(new Error('storage unavailable'));
      return ler(...args);
    };
  });
  await page.goto(extensao.url('painel.html#anki/custos'));
  await expect(pontoDaConexao(page)).toHaveAttribute('data-estado', 'desligada');
  await expect(faixaF1(page)).toBeVisible();
});

test('painel: com a porta muda, o Tentar de novo volta a Conectando e termina desligada em 3 s; falando de novo, liga', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await extensao.gravarStorage({ pm_anki_ja_conectou: true });
  await page.goto(extensao.url('painel.html#anki/custos'));
  await expect(pontoDaConexao(page)).toHaveAttribute('data-estado', 'desligada');

  fakes.anki.ligar();
  fakes.anki.silenciar();
  await page.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(pontoDaConexao(page)).toHaveAttribute('data-estado', 'conectando');
  await expect(pontoDaConexao(page)).toHaveAttribute('data-estado', 'desligada', { timeout: 4000 });

  fakes.anki.voltarAFalar();
  await page.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(pontoDaConexao(page)).toHaveAttribute('data-estado', 'ligada');
  await expect(faixaF1(page)).toBeHidden();
});

test('painel: a primeira resposta ligada grava “já respondeu neste computador”; desligada, nunca respondeu', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await extensao.gravarStorage({ pm_anki_ja_conectou: false });
  expect(await lerJaConectou(extensao)).toBe(false);
  await page.goto(extensao.url('painel.html#frases'));
  await expect(pontoDaConexao(page)).toHaveAttribute('data-estado', 'desligada');
  expect(await lerJaConectou(extensao)).toBe(false);

  fakes.anki.ligar();
  await page.getByRole('link', { name: 'Conexão com o Anki', exact: true }).click();
  await page.getByRole('button', { name: 'Tentar de novo' }).first().click();
  await expect(pontoDaConexao(page)).toHaveAttribute('data-estado', 'ligada');
  await expect.poll(() => lerJaConectou(extensao)).toBe(true);
});

test('popup: uma porta muda conta como desligada em 3 s e a nota aparece', async ({ page, extensao, fakes }) => {
  fakes.anki.silenciar();
  await page.goto(extensao.url('popup.html'));
  await expect(page.locator('.popup-azulejo')).toHaveCount(2);
  await expect(notaDoPopup(page)).toBeHidden();
  await expect(notaDoPopup(page)).toBeVisible({ timeout: 4000 });
});

test('popup: quem confere grava o fato; o painel aberto depois já sabe que a Conexão respondeu', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await extensao.gravarStorage({ pm_anki_ja_conectou: false });
  expect(await lerJaConectou(extensao)).toBe(false);
  fakes.anki.ligar();
  await page.goto(extensao.url('popup.html'));
  await expect.poll(() => lerJaConectou(extensao)).toBe(true);

  // Com a Conexão desligada agora, o painel mostra as abas (não o card da primeira vez).
  fakes.anki.desligar();
  await page.goto(extensao.url('painel.html#anki/custos'));
  await expect(pontoDaConexao(page)).toHaveAttribute('data-estado', 'desligada');
  await expect(faixaF1(page)).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Custos' })).toBeChecked();
});

test('painel aberto percebe quando o popup grava a primeira resposta, sem mostrar Pronto', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await extensao.gravarStorage({ pm_anki_ja_conectou: false });
  expect(await lerJaConectou(extensao)).toBe(false);
  await page.goto(extensao.url('painel.html#anki/custos'));
  await expect(pontoDaConexao(page)).toHaveAttribute('data-estado', 'desligada');
  await expect(page.locator('#anki-primeira-vez')).toBeVisible();

  fakes.anki.ligar();
  const popup = await page.context().newPage();
  await popup.goto(extensao.url('popup.html'));
  await expect.poll(() => lerJaConectou(extensao)).toBe(true);
  fakes.anki.desligar();

  await expect(pontoDaConexao(page)).toHaveAttribute('data-estado', 'desligada');
  await expect(page.locator('#anki-primeira-vez')).toBeHidden();
  await expect(page.getByRole('radiogroup', { name: 'Seções da Conexão com o Anki' })).toBeVisible();
  await expect(page.getByText('Pronto', { exact: true })).toBeHidden();
});

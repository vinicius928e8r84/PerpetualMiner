'use strict';

// O ciclo de vida da Conexão com o Anki (lib/conexao-anki.js), visto de quem o
// acompanha: o ponto do painel, a faixa F1, a nota do popup e o fato gravado
// “já respondeu neste computador” (`pm_anki_ja_conectou`). No popup, o que muda com
// a Conexão é o “— esperando o Anki” do idioma ligado que nunca foi lido (BRG-37).
//
// Três situações (Conectando, Ligada, Desligada) e uma porta que aceita e não
// responde, que conta como desligada em 3 s. Os testes afirmam o que a pessoa
// vê e o que fica gravado, nunca funções internas.

const { test, expect } = require('../fixtures');
const path = require('path');

// Quando solicitado, guarda a tela real do painel e do popup como evidência da
// transição, sem fazer dos pixels um requisito frágil da suíte regular.
const fotografar = async (page, nome) => {
  if (process.env.PM_EVIDENCE_DIR) {
    await page.screenshot({ path: path.join(process.env.PM_EVIDENCE_DIR, nome), fullPage: true });
  }
};

const pontoDaConexao = page => page.locator('.shell-ponto');
const faixaF1 = page => page.getByText('A conexão com o Anki está desligada. Ligue-a neste computador e tente de novo.');
const esperaDoPopup = page => page.locator('.popup-azulejo__espera:visible');

/** O inglês ligado e nenhuma leitura do vocabulário: o popup, com a Conexão desligada, espera o Anki. */
const ligarOIngles = extensao => extensao.gravarStorage({
  pm_auto_miner_settings: { en: { enabled: true, dailyLimit: 20 }, ru: { enabled: false, dailyLimit: 20 } },
});

const lerJaConectou = async extensao => (await extensao.lerStorage('pm_anki_ja_conectou')).pm_anki_ja_conectou ?? false;
// A inicialização do Chromium pode demorar: os 3 s são medidos só a partir do
// pedido HTTP, não da navegação, então o pedido tem folga para chegar.
const inicioDoHealth = page => page.waitForRequest('http://127.0.0.1:8766/health', { timeout: 10000 }).then(() => Date.now());
// Os 3 s do limite mais a folga que a tela leva para mostrar a mudança. Num runner de 2 núcleos a
// padrão (200 ms) pode não bastar para o teste da leitura travada, que passa uma maior.
const ateTresSegundos = (inicio, folga = 200) => Math.max(1, 3000 + folga - (Date.now() - inicio));

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
  await fotografar(page, 'painel-porta-muda-desligada.png');
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
  // A inicialização do Chromium pode demorar; os 3 s são medidos só a partir
  // do pedido HTTP, não a partir da navegação.
  const inicio = inicioDoHealth(page);
  await page.goto(extensao.url('painel.html#anki/custos'));
  const instante = await inicio;
  await expect(pontoDaConexao(page)).toHaveAttribute('data-estado', 'desligada', { timeout: ateTresSegundos(instante, 1000) });
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
  await fotografar(page, 'painel-tentando-conectar.png');
  await expect(pontoDaConexao(page)).toHaveAttribute('data-estado', 'desligada', { timeout: 4000 });

  fakes.anki.voltarAFalar();
  await page.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(pontoDaConexao(page)).toHaveAttribute('data-estado', 'ligada');
  await expect(faixaF1(page)).toBeHidden();
  await fotografar(page, 'painel-conexao-ligada.png');
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

test('popup: uma porta muda conta como desligada em 3 s e o azulejo passa a esperar o Anki', async ({ page, extensao, fakes }) => {
  await ligarOIngles(extensao);
  fakes.anki.silenciar();
  await page.goto(extensao.url('popup.html'));
  await expect(page.locator('.popup-azulejo')).toHaveCount(2);
  await expect(esperaDoPopup(page)).toBeHidden();
  await expect(esperaDoPopup(page)).toBeVisible({ timeout: 4000 });
});

test('popup: confere só ao abrir, não a cada 15 s; ao reabrir percebe que a Conexão caiu', async ({ page, extensao, fakes }) => {
  test.setTimeout(45_000); // É preciso atravessar o intervalo de 15 s do painel.
  await ligarOIngles(extensao);
  await page.setViewportSize({ width: 340, height: 600 });
  const numeroDeConferencias = () => fakes.anki.requisicoes.filter(r => r.caminho === '/health').length;
  const antes = numeroDeConferencias();
  const resposta = page.waitForResponse('http://127.0.0.1:8766/health');
  await page.goto(extensao.url('popup.html'));
  await resposta;
  await expect(esperaDoPopup(page)).toBeHidden();
  expect(numeroDeConferencias()).toBe(antes + 1);

  fakes.anki.desligar();
  await page.waitForTimeout(16_000);
  expect(numeroDeConferencias()).toBe(antes + 1);
  await expect(esperaDoPopup(page)).toBeHidden();

  await page.reload();
  await expect(esperaDoPopup(page)).toBeVisible();
  expect(numeroDeConferencias()).toBe(antes + 2);
  await fotografar(page, 'popup-desligada-ao-reabrir.png');
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
  await fotografar(page, 'painel-primeira-conexao.png');

  fakes.anki.ligar();
  const popup = await page.context().newPage();
  await popup.setViewportSize({ width: 340, height: 600 });
  await popup.goto(extensao.url('popup.html'));
  await expect.poll(() => lerJaConectou(extensao)).toBe(true);
  await fotografar(popup, 'popup-conexao-respondendo.png');
  fakes.anki.desligar();

  await expect(pontoDaConexao(page)).toHaveAttribute('data-estado', 'desligada');
  await expect(page.locator('#anki-primeira-vez')).toBeHidden();
  await expect(page.getByRole('radiogroup', { name: 'Seções da Conexão com o Anki' })).toBeVisible();
  await expect(page.getByText('Pronto', { exact: true })).toBeHidden();
  await fotografar(page, 'painel-popup-respondeu-sem-pronto.png');
});

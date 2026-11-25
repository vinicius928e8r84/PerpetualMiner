'use strict';

const { test, expect } = require('../fixtures');
const path = require('path');
const { deixarALeituraSemResposta, recusarALeitura } = require('../apoio-da-leitura-do-fato');

const fotografar = async (page, nome) => {
  if (process.env.PM_EVIDENCE_DIR) {
    await page.screenshot({ path: path.join(process.env.PM_EVIDENCE_DIR, nome), fullPage: true });
  }
};

const pontoDaConexao = page => page.locator('.shell-ponto');
const faixaF1 = page => page.getByText('A Conexão com o Anki está desligada. Ligue-a neste computador e tente de novo.');
const esperaDoPopup = page => page.locator('.popup-azulejo__espera:visible');

const ligarOIngles = extensao => extensao.gravarStorage({
  pm_auto_miner_settings: { en: { enabled: true, dailyLimit: 20 }, ru: { enabled: false, dailyLimit: 20 } },
});

const lerJaConectou = async extensao => (await extensao.lerStorage('pm_anki_ja_conectou')).pm_anki_ja_conectou ?? false;
const inicioDoHealth = page => page.waitForRequest('http://127.0.0.1:8766/health', { timeout: 10000 }).then(() => Date.now());

const LIMITE_DA_RESPOSTA_MS = 3000;
const FOLGA_DA_TELA_MS = 1000;
const PRAZO_PARA_DESLIGAR_MS = LIMITE_DA_RESPOSTA_MS + FOLGA_DA_TELA_MS;
const METADE_DO_LIMITE_MS = LIMITE_DA_RESPOSTA_MS / 2;
const INTERVALO_DA_CONFERENCIA_MS = 15_000;
const prazoAteDesligar = inicio => Math.max(1, PRAZO_PARA_DESLIGAR_MS - (Date.now() - inicio));

const anotarOsEstadosDoPonto = page => page.addInitScript(() => {
  window.__estadosDoPonto = [];
  const anotar = () => {
    const ponto = document.querySelector('.shell-ponto');
    const estado = ponto?.dataset.estado;
    if (estado && estado !== window.__estadosDoPonto.at(-1)?.estado) window.__estadosDoPonto.push({ estado, em: performance.now() });
  };
  new MutationObserver(anotar).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-estado'] });
});
const estadosDoPonto = page => page.evaluate(() => window.__estadosDoPonto);

test('painel: uma porta que aceita e não responde conta como desligada em 3 s, e antes disso é Conectando', async ({ page, extensao, fakes }) => {
  fakes.anki.silenciar();
  await extensao.gravarStorage({ pm_anki_ja_conectou: true });
  await anotarOsEstadosDoPonto(page);
  await page.goto(extensao.url('painel.html#anki/custos'));

  await expect(pontoDaConexao(page)).toHaveAttribute('data-estado', 'conectando');
  await expect(pontoDaConexao(page)).toHaveAttribute('data-estado', 'desligada', { timeout: PRAZO_PARA_DESLIGAR_MS });
  await expect(faixaF1(page)).toBeVisible();
  const [conectando, desligada, ...outros] = await estadosDoPonto(page);
  expect([conectando.estado, desligada.estado, outros]).toEqual(['conectando', 'desligada', []]);
  expect(desligada.em - conectando.em).toBeGreaterThanOrEqual(METADE_DO_LIMITE_MS);
  expect(await lerJaConectou(extensao)).toBe(true);
  await fotografar(page, 'painel-porta-muda-desligada.png');
});

test('painel: a porta muda é detectada mesmo se a leitura do fato não termina', async ({ page, extensao, fakes }) => {
  fakes.anki.silenciar();
  await deixarALeituraSemResposta(page, 'pm_anki_ja_conectou');
  const inicio = inicioDoHealth(page);
  await page.goto(extensao.url('painel.html#anki/custos'));
  const instante = await inicio;
  await expect(pontoDaConexao(page)).toHaveAttribute('data-estado', 'desligada', { timeout: prazoAteDesligar(instante) });
  await expect(faixaF1(page)).toBeVisible();
});

test('painel: falha na leitura do fato não impede conferir a Conexão', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await recusarALeitura(page, 'pm_anki_ja_conectou', 'storage unavailable');
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
  await expect(pontoDaConexao(page)).toHaveAttribute('data-estado', 'desligada', { timeout: PRAZO_PARA_DESLIGAR_MS });

  fakes.anki.voltarAFalar();
  await page.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(pontoDaConexao(page)).toHaveAttribute('data-estado', 'ligada');
  await expect(faixaF1(page)).toBeHidden();
  await fotografar(page, 'painel-conexao-ligada.png');
  expect(await lerJaConectou(extensao)).toBe(true);
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
  await page.goto(extensao.url('popup/popup.html'));
  await expect(page.locator('.popup-azulejo')).toHaveCount(2);
  await expect(esperaDoPopup(page)).toBeHidden();
  await expect(esperaDoPopup(page)).toBeVisible({ timeout: PRAZO_PARA_DESLIGAR_MS });
});

test('popup: confere só ao abrir, não a cada 15 s; ao reabrir percebe que a Conexão caiu', async ({ page, extensao, fakes, relogioParado }) => {
  const relogio = await relogioParado();
  await ligarOIngles(extensao);
  await page.setViewportSize({ width: 340, height: 600 });
  const numeroDeConferencias = () => fakes.anki.requisicoes.filter(r => r.caminho === '/health').length;
  const antes = numeroDeConferencias();
  const resposta = page.waitForResponse('http://127.0.0.1:8766/health');
  await page.goto(extensao.url('popup/popup.html'));
  await resposta;
  await expect(esperaDoPopup(page)).toBeHidden();
  expect(numeroDeConferencias()).toBe(antes + 1);

  fakes.anki.desligar();
  const conferenciasQueSairam = [];
  const anotar = pedido => { if (pedido.url() === 'http://127.0.0.1:8766/health') conferenciasQueSairam.push(pedido); };
  page.on('request', anotar);
  await relogio.avancar(2 * INTERVALO_DA_CONFERENCIA_MS);
  await extensao.lerStorage('pm_anki_ja_conectou');
  page.off('request', anotar);
  expect(conferenciasQueSairam).toHaveLength(0);
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
  await page.goto(extensao.url('popup/popup.html'));
  await expect.poll(() => lerJaConectou(extensao)).toBe(true);

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
  await popup.goto(extensao.url('popup/popup.html'));
  await expect.poll(() => lerJaConectou(extensao)).toBe(true);
  await fotografar(popup, 'popup-conexao-respondendo.png');
  fakes.anki.desligar();

  await expect(pontoDaConexao(page)).toHaveAttribute('data-estado', 'desligada');
  await expect(page.locator('#anki-primeira-vez')).toBeHidden();
  await expect(page.getByRole('radiogroup', { name: 'Seções da Conexão com o Anki' })).toBeVisible();
  await expect(page.getByText('Pronto', { exact: true })).toBeHidden();
  await fotografar(page, 'painel-popup-respondeu-sem-pronto.png');
});

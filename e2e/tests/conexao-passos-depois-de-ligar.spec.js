'use strict';

const { test, expect } = require('../fixtures');
const { estadoFinal } = require('../estado-final');
const contrato = require('../../complemento/contrato/exemplos.json');

const AGORA = new Date('2026-09-18T12:00:00');

const pronto = page => page.getByRole('region', { name: 'Conexão com o Anki: ligada' });
const card = page => page.getByRole('region', { name: 'Ainda não houve conexão neste computador' });
const status = page => page.locator('#apv-status');
const tentarDaF1 = page => page.locator('#shell-tentar-de-novo');
const saude = contrato.exemplos.find(e => e.pedido.caminho === '/health' && e.daExtensao
  && e.resposta.status === 200 && e.contexto.perfil === 'Usuário 1').resposta.json;
const ACHEI = `Achei o Anki · ${saude.perfil} · versão ${saude.versao}`;

test('no Pronto, uma nova tentativa de conexão mostra Conectando, e não “Achei o Anki”, até a resposta chegar', async ({ page, extensao, fakes, relogioParado }) => {
  await extensao.gravarStorage({ pm_abridor: { agoraNao: true } });
  fakes.anki.desligar();
  await relogioParado({ em: AGORA });
  await page.goto(extensao.url('painel.html#anki/custos'));
  await expect(card(page)).toBeVisible();
  fakes.anki.ligar();
  await tentarDaF1(page).click();
  await expect(pronto(page)).toBeVisible();
  await expect(status(page)).toHaveText(ACHEI);

  let liberar;
  const segurada = new Promise(resolver => { liberar = resolver; });
  fakes.anki.responder('GET', '/health', async () => { await segurada; return fakes.anki.respostaDoContrato('GET', '/health'); });
  await tentarDaF1(page).evaluate(botao => botao.click());

  await expect(status(page)).toHaveText('Conectando ao Anki…');
  await expect(pronto(page)).toBeVisible();
  liberar();
  await expect(status(page)).toHaveText(ACHEI);
  await estadoFinal(extensao, { pm_anki_ja_conectou: true, pm_abridor: { agoraNao: true } });
});

test('a tela que já viu a Conexão ligada continua no Reiniciar o Anki quando ela cai, mesmo que o computador esqueça que conectou', async ({ page, extensao, fakes, relogioParado }) => {
  await extensao.gravarStorage({ pm_abridor: { agoraNao: true } });
  const relogio = await relogioParado({ em: AGORA });
  await page.goto(extensao.url('painel.html#boas-vindas/anki'));
  await expect(page.locator('#bv4-status')).toHaveText(/^Achei o Anki/);
  fakes.anki.desligar();
  await relogio.avancar(15_000);
  await expect(page.locator('#bv4-status')).toHaveText('Conexão com o Anki: desligada');
  await expect(page.locator('#bv4-passo-titulo')).toHaveText('Reiniciar o Anki');
  await page.evaluate(() => {
    window.esqueceu = new Promise(resolver => chrome.storage.onChanged.addListener(function ouvir(mudancas) {
      if (!('pm_anki_ja_conectou' in mudancas)) return;
      chrome.storage.onChanged.removeListener(ouvir);
      resolver();
    }));
  });

  await extensao.gravarStorage({ pm_anki_ja_conectou: false });
  await page.evaluate(() => window.esqueceu);

  await expect(page.locator('#bv4-passo-titulo')).toHaveText('Reiniciar o Anki');
  await estadoFinal(extensao, { pm_anki_ja_conectou: false });
});

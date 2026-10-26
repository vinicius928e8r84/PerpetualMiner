'use strict';

// O que as specs do Envio ao Anki (painel-envio*.spec.js) repetem: as Frases do cenário, abrir o painel e achar o progresso e o resumo.

const { expect } = require('@playwright/test');

const AGORA = new Date('2026-09-18T12:00:00');
const HOJE = '18/09/2026';

function frase(id, texto, extras = {}) {
  return { id, texto, data: HOJE, streaming: 'netflix', idioma: 'Inglês', ...extras };
}

const INGLESAS = [
  frase(1_700_000_000_005, 'She hit the sack early.', { keywords: ['sack@3'] }),
  frase(1_700_000_000_004, 'It costs an arm and a leg.'),
  frase(1_700_000_000_003, 'Better late than never.'),
];
const RUSSA = frase(1_700_000_000_002, 'Я улыбаюсь каждое утро.', { idioma: 'Russo' });
const [SACK, ARM, LATE] = INGLESAS;

async function abrirPainel(page, extensao, endereco = '#frases') {
  await page.clock.setFixedTime(AGORA);
  await page.goto(extensao.url(`painel.html${endereco}`));
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

const cartao = (page, texto) => page.locator('#frases-lista .veio-frase').filter({ hasText: texto });
const marcar = (page, texto) => cartao(page, texto).getByRole('checkbox', { name: 'Selecionar frase' });
const enviarAoAnki = page => page.locator('#frases-barra').getByRole('button', { name: 'Enviar ao Anki', exact: true });
const progresso = page => page.getByRole('dialog', { name: 'Enviando ao Anki…' });
const resumo = page => page.getByRole('dialog', { name: /^Envio concluído/ });
const envio = (page, nome) => progresso(page).getByRole('group', { name: nome });
/** O bloco de um idioma no resumo: “+N cartões”, o baralho, o que já estava e o que não entrou. */
const baralho = (page, idioma) => resumo(page).getByRole('group', { name: idioma });
const toasts = page => page.locator('.veio-toast');

async function marcarEEnviar(page, textos) {
  for (const texto of textos) await marcar(page, texto).check();
  await enviarAoAnki(page).click();
}

/** Espera o painel criar os Envios na Conexão falsa. */
async function enviosCriados(fakes, n) {
  await expect.poll(() => fakes.anki.envios.length).toBe(n);
  return fakes.anki.envios;
}

// O “Tentar de novo” da faixa F1 mora na área da Conexão, fora da tela em Frases;
// o clique por evaluate faz o shell conferir a Conexão agora, sem esperar 15 s.
async function pedirConferenciaDaConexao(page) {
  await page.locator('#shell-tentar-de-novo').evaluate(el => el.click());
}

/** De quanto em quanto tempo o painel lê os Envios na Conexão (`INTERVALO` em painel-envio.js). */
const INTERVALO_DO_ENVIO = 2_000;

/**
 * Para um teste que afirma que algo NÃO aconteceu: espera a resposta que o teste soltou (`resposta`, de `page.waitForResponse`),
 * uma volta inteira do acompanhamento (o `/jobs/list` a cada 2 s) e a resposta de cada pedido da tela nessa volta.
 */
async function umaVoltaDoEnvio(page, { resposta } = {}) {
  const pedidos = [];
  const anotar = pedido => pedidos.push(pedido);
  page.on('request', anotar);
  try {
    if (resposta) await (await resposta).finished();
    await page.waitForTimeout(INTERVALO_DO_ENVIO + 500);
  } finally {
    page.off('request', anotar);
  }
  await Promise.all(pedidos.map(async pedido => (await pedido.response())?.finished()));
  await page.evaluate(async () => {
    await chrome.storage.local.get(null);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}

module.exports = { pedirConferenciaDaConexao, umaVoltaDoEnvio, AGORA, HOJE, frase, INGLESAS, RUSSA, SACK, ARM, LATE, abrirPainel, cartao, marcar, enviarAoAnki, progresso, resumo, envio, baralho, toasts, marcarEEnviar, enviosCriados };

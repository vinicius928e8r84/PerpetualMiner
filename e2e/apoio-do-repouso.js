'use strict';

const { expect } = require('@playwright/test');

const CHAVE_A = 'sk-fake-repouso-primeira-aaaa';
const CHAVE_B = 'sk-fake-repouso-segunda-bbbb';
const CICLOS = 4;

const cardDaIA = page => page.locator('#cfg-ia');
const cardDaConta = page => page.locator('#cfg-conta');

async function abrirComRelogio(relogioParado, page, extensao, secao) {
  await relogioParado({ page });
  await page.goto(extensao.url(`painel.html#configuracoes/${secao}`));
  await expect(page.locator('#shell-chip')).toContainText('Sincronizado agora', { timeout: 15_000 });
}

async function semearDonoA(extensao, fakes) {
  await extensao.semearSessao({ uid: 'A' });
  fakes.google.gravarChaveDaOpenAI('A', { chave: CHAVE_A, em: 100 });
}

async function abrirOSegundoPerfil(relogioParado, segundoPerfil, secao) {
  await segundoPerfil.extensao.semearSessao({ uid: 'B', displayName: 'Pessoa B' });
  const page = await segundoPerfil.context.newPage();
  await abrirComRelogio(relogioParado, page, segundoPerfil.extensao, secao);
  return { page, extensao: segundoPerfil.extensao };
}

module.exports = { CHAVE_A, CHAVE_B, CICLOS, cardDaIA, cardDaConta, abrirComRelogio, semearDonoA, abrirOSegundoPerfil };

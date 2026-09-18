'use strict';

// Referência visual de Configurações · resumo primeiro + Conta & sync (#26).
//
// O dono revisa estas telas lado a lado com o protótipo travado
// (docs/design/painel/configuracoes/prototipo-configuracoes.html?variant=C).
// Depois de aprovadas, elas são a referência: uma mudança visual faz o teste
// falhar até alguém olhar e atualizar:
//
//   cd e2e && npx playwright test configuracoes-visual --update-snapshots
//
// O relógio fica parado, para “Sincronizado agora” sair sempre igual.

const { test, expect } = require('../fixtures');

const AGORA = new Date('2026-09-18T12:00:00');

async function abrirConfiguracoes(page, extensao, endereco, largura = 1280) {
  await page.clock.setFixedTime(AGORA);
  await page.setViewportSize({ width: largura, height: 800 });
  await page.goto(extensao.url(`painel.html${endereco}`));
  await expect(page.getByRole('navigation', { name: 'Navegação do painel' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

const estadoDoChip = page => page.locator('#shell-chip-estado');

test('Configurações com os cards fechados', async ({ page, extensao }) => {
  await extensao.semearSessao({ uid: 'uid-visual', displayName: 'Ana Souza' });
  await abrirConfiguracoes(page, extensao, '#configuracoes');
  await expect(estadoDoChip(page)).toHaveText('Sincronizado agora');
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');

  await expect(page).toHaveScreenshot('configuracoes-fechados.png');
});

test('Conta & sync aberto, sincronizado', async ({ page, extensao }) => {
  await extensao.semearSessao({ uid: 'uid-visual', displayName: 'Ana Souza' });
  await abrirConfiguracoes(page, extensao, '#configuracoes/conta');
  await expect(estadoDoChip(page)).toHaveText('Sincronizado agora');
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');

  await expect(page).toHaveScreenshot('conta-sincronizado.png', { animations: 'disabled' });
});

test('Conta & sync aberto, sem sincronizar', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-visual', displayName: 'Ana Souza' });
  fakes.google.ficarForaDoAr();
  await abrirConfiguracoes(page, extensao, '#configuracoes/conta');
  await expect(estadoDoChip(page)).toHaveText('Sem sincronizar');
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');

  await expect(page).toHaveScreenshot('conta-sem-sincronizar.png', { animations: 'disabled' });
});

test('Conta & sync aberto, sem conta e com o login que falhou', async ({ page, extensao, fakes }) => {
  fakes.google.proximoLogin('falhar');
  await abrirConfiguracoes(page, extensao, '#configuracoes/conta');
  await page.locator('#cfg-conta').getByRole('button', { name: 'Entrar com Google' }).click();
  await expect(page.locator('#cfg-conta').getByRole('alert')).toBeVisible();
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');

  await expect(page).toHaveScreenshot('conta-login-falhou.png', { animations: 'disabled' });
});

test('janela estreita: sem resumo na linha e sem recuo no conteúdo', async ({ page, extensao }) => {
  await extensao.semearSessao({ uid: 'uid-visual', displayName: 'Ana Souza' });
  await abrirConfiguracoes(page, extensao, '#configuracoes/conta', 700);
  await expect(page.locator('#cfg-conta').getByText('Sincronizado agora', { exact: true })).toBeVisible();
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');

  await expect(page).toHaveScreenshot('conta-estreita.png', { animations: 'disabled' });
});

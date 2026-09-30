'use strict';

// Referência visual da Boas-vindas (#42): a abertura, os passos 1 e 2 (com e
// sem atalho de legenda, e o gravador gravando), um passo opcional ainda sem
// controle (#43), Tudo pronto com cada situação do resumo e a janela estreita,
// nos dois temas.
//
// O dono revisa estas telas lado a lado com o protótipo travado
// (docs/design/painel/boas-vindas/prototipo-onboarding.html?variant=C). Depois
// de aprovadas, elas são a referência: uma mudança visual faz o teste falhar
// até alguém olhar e atualizar:
//
//   cd e2e && npx playwright test boas-vindas-visual --update-snapshots
//
// A Conexão com o Anki fica desligada, para o passo 4 sair igual (“falta”)
// sem depender de quando o shell conferiu a /health.

const { test, expect } = require('../fixtures');

const UMA_FRASE = [{ id: 1, texto: 'Old news', data: '01/09/2026', streaming: 'web', idioma: 'Inglês' }];
const SELECAO_EM_ALT_Q = { type: 'keyboard', code: 'KeyQ', button: null, altKey: true, ctrlKey: false, shiftKey: false, label: 'Alt+Q' };

test.beforeEach(({ fakes }) => fakes.anki.desligar());

async function abrir(page, extensao, passo = '', { largura = 1100, tema } = {}) {
  if (tema) await extensao.gravarStorage({ pm_tema: tema });
  await page.setViewportSize({ width: largura, height: 760 });
  await page.goto(extensao.url(`painel.html#boas-vindas${passo && `/${passo}`}`));
  await expect(page.locator('.bv-card h2')).toBeVisible();
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'desligada');
  await page.evaluate(() => document.fonts.ready);
}

const foto = (page, nome) => expect(page).toHaveScreenshot(nome, { fullPage: true, animations: 'disabled', caret: 'hide' });

test('a abertura', async ({ page, extensao }) => {
  await abrir(page, extensao);
  await foto(page, 'abertura.png');
});

test('passo 1, com o atalho de legenda de fábrica', async ({ page, extensao }) => {
  await abrir(page, extensao, 'minerar');
  await foto(page, 'passo-1.png');
});

test('passo 1 sem atalho de legenda: “Sem atalho” e Definir atalho', async ({ page, extensao }) => {
  await extensao.gravarStorage({ pm_atalho_legenda: null });
  await abrir(page, extensao, 'minerar');
  await foto(page, 'passo-1-sem-atalho.png');
});

test('passo 1 com a mineração rápida que falhou (POP-06)', async ({ page, extensao }) => {
  await abrir(page, extensao, 'minerar');
  await extensao.serviceWorker.evaluate(() => {
    chrome.storage.local.set = () => { throw new Error('QUOTA_BYTES quota exceeded'); };
  });
  await page.getByRole('textbox', { name: 'Cole ou escreva uma frase' }).fill('Break a leg');
  await page.getByRole('button', { name: 'Minerar', exact: true }).click();
  await expect(page.locator('.bv-card').getByRole('alert')).not.toBeEmpty();
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await foto(page, 'passo-1-falhou.png');
});

test('passo 2, gravando Minerar seleção', async ({ page, extensao }) => {
  await abrir(page, extensao, 'atalho');
  await page.locator('.bv-card').getByRole('group', { name: 'Minerar seleção' })
    .getByRole('button', { name: 'Gravar atalho' }).click();
  await foto(page, 'passo-2-gravando.png');
});

test('um passo opcional, com Agora não', async ({ page, extensao }) => {
  await abrir(page, extensao, 'conta');
  await foto(page, 'passo-3.png');
});

test('Tudo pronto com feito, agora não e falta', async ({ page, extensao }) => {
  await extensao.gravarStorage({
    frases: UMA_FRASE,
    pm_atalho: SELECAO_EM_ALT_Q,
    pm_boas_vindas: { agoraNao: ['conta'], concluida: false },
  });
  await abrir(page, extensao, 'pronto');
  await foto(page, 'pronto.png');
});

test('a janela estreita empilha a lista sobre o card', async ({ page, extensao }) => {
  await abrir(page, extensao, 'minerar', { largura: 520 });
  await foto(page, 'estreita.png');
});

test('o tema claro', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: UMA_FRASE });
  await abrir(page, extensao, 'minerar', { tema: 'claro' });
  await foto(page, 'claro.png');
});

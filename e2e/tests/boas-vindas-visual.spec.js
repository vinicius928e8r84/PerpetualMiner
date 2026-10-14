'use strict';

const path = require('path');
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

async function foto(page, nome) {
  const opcoes = { fullPage: true, animations: 'disabled', caret: 'hide' };
  await expect(page).toHaveScreenshot(nome, opcoes);
  // Quando pedido na validação local, guarde também a tela renderizada desta execução.
  if (process.env.TEST_EVIDENCE_DIR) {
    await page.screenshot({ ...opcoes, path: path.join(process.env.TEST_EVIDENCE_DIR, nome) });
  }
}

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

test('passo 3 sem conta: o Entrar com Google de Configurações, com Agora não', async ({ page, extensao }) => {
  await abrir(page, extensao, 'conta');
  await foto(page, 'passo-3.png');
});

test('passo 3 com a conta: o nome e Sair da conta', async ({ page, extensao }) => {
  await extensao.semearSessao();
  await abrir(page, extensao, 'conta');
  await expect(page.locator('.bv-card')).toContainText('Pessoa de Teste');
  await foto(page, 'passo-3-com-conta.png');
});

test('passo 4 com a Conexão desligada: Ter o Anki, com a pergunta e as duas respostas', async ({ page, extensao }) => {
  await abrir(page, extensao, 'anki');
  await expect(page.locator('#bv4-passo-titulo')).toHaveText('Ter o Anki');
  await foto(page, 'passo-4-ter-o-anki.png');
});

test('passo 4, pôr a Conexão no Anki: a animação do aviso, o arquivo e o Detalhes', async ({ page, extensao }) => {
  await abrir(page, extensao, 'anki');
  await page.locator('.bv-card').getByRole('button', { name: 'Pôr a Conexão no Anki' }).click();
  // `foto` já tira a animação do caminho (`animations: 'disabled'`): o primeiro quadro é o que se vê.
  await foto(page, 'passo-4-desligada.png');
});

test.fixme('passo 4, dois minutos sem resposta: reiniciar o Anki com o checklist e Baixar de novo', async ({ page, extensao }) => {
  // O relógio da página é do teste: os 2 minutos passam quando ele anda.
  await page.clock.install({ time: new Date('2026-09-18T12:00:00') });
  await abrir(page, extensao, 'anki');
  await page.locator('.bv-card').getByRole('button', { name: 'Reiniciar o Anki' }).click();
  await page.clock.runFor(120_000);
  await expect(page.locator('.bv-card').getByText('A Conexão com o Anki ainda não respondeu. Confira:')).toBeVisible();
  await foto(page, 'passo-4-sem-resposta.png');
});

test.fixme('passo 4 com a Conexão ligada: Achei o Anki, com o perfil e a versão', async ({ page, extensao, fakes }) => {
  fakes.anki.ligar();
  await page.setViewportSize({ width: 1100, height: 760 });
  await page.goto(extensao.url('painel.html#boas-vindas/anki'));
  await expect(page.locator('.bv-card').getByRole('status')).toHaveText(/^Achei o Anki · Usuário 1 · versão /);
  await page.evaluate(() => document.fonts.ready);
  await foto(page, 'passo-4-ligada.png');
});

test.fixme('passo 4, Abrir o Anki sozinho: Permitir abrir o Anki e Agora não', async ({ page, extensao, fakes }) => {
  await abrir(page, extensao, 'anki');
  fakes.anki.ligar();
  await page.locator('.bv-card').getByRole('button', { name: 'Reiniciar o Anki' }).click();
  await page.locator('#bv4-tentar').click();
  await expect(page.locator('#bv4-passo-titulo')).toHaveText('Abrir o Anki sozinho');
  await foto(page, 'passo-4-abridor.png');
});

test.fixme('passo 4, Abrir o Anki sozinho depois de Agora não', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ pm_abridor: { agoraNao: true } });
  await abrir(page, extensao, 'anki');
  fakes.anki.ligar();
  await page.locator('.bv-card').getByRole('button', { name: 'Reiniciar o Anki' }).click();
  await page.locator('#bv4-tentar').click();
  await page.locator('.bv-card').getByRole('button', { name: /^Abrir o Anki sozinho/ }).click();
  await expect(page.locator('#bv4-abridor-status')).toHaveText(/^Sem essa permissão/);
  await foto(page, 'passo-4-abridor-agora-nao.png');
});

const AGUARDA_O_DONO = 'a referência visual do passo da IA espera a aprovação do dono (regra 10)';

test('passo 5 sem chave: o card IA dos cartões, com as duas entradas lado a lado', async ({ page, extensao }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrir(page, extensao, 'ia');
  await expect(page.locator('.bv-card').getByRole('region', { name: 'Chave da OpenAI' })).toBeVisible();
  await foto(page, 'passo-5-ia.png');
});

test('passo 5 com a chave conferida: a máscara e Trocar chave', async ({ page, extensao }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await extensao.gravarStorage({ pm_chave_openai: { ultimos4: '9f3a' } });
  await abrir(page, extensao, 'ia');
  await expect(page.locator('.bv-card').getByText('Chave conferida', { exact: true })).toBeVisible();
  await foto(page, 'passo-5-ia-conferida.png');
});

test('passo 6 com a Conexão desligada: os switches, o limite e a nota ONB-10', async ({ page, extensao }) => {
  await extensao.gravarStorage({ pm_auto_miner_settings: { en: { enabled: true, dailyLimit: 20 }, ru: { enabled: false, dailyLimit: 15 } } });
  await abrir(page, extensao, 'automatica');
  await expect(page.locator('.bv-card').getByRole('switch', { name: 'Mineração automática em inglês' })).toBeChecked();
  await foto(page, 'passo-6.png');
});

test('passo 7 sem chave: o campo e onde conseguir a chave', async ({ page, extensao }) => {
  await abrir(page, extensao, 'chave');
  await page.locator('.bv-card summary').filter({ visible: true }).click();
  await foto(page, 'passo-7.png');
});

test('passo 7 com a chave salva', async ({ page, extensao }) => {
  await extensao.gravarStorage({ geminiApiKey: 'AIzaSyExemplo1234' });
  await abrir(page, extensao, 'chave');
  await foto(page, 'passo-7-salva.png');
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

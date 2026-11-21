'use strict';

const { test, expect } = require('../fixtures');

const HOJE = new Date().toLocaleDateString('pt-BR');

function frasesDeExemplo(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: 1_700_000_000_000 + (n - i),
    texto: `Sentence number ${n - i} about the harbour.`,
    data: HOJE,
    streaming: 'netflix',
    idioma: 'Inglês',
  }));
}

async function abrirPainel(page, extensao, endereco = '#configuracoes') {
  await page.goto(extensao.url(`painel.html${endereco}`));
  await expect(page.getByRole('navigation', { name: 'Navegação do painel' })).toBeVisible();
}

const card = (page, secao) => page.locator(`#cfg-${secao}`);
const cabecaDoCard = (page, nome) => page.getByRole('button', { name: nome, exact: true });
const resumo = (page, secao) => card(page, secao).locator('.cfg-resumo');
const conta = page => card(page, 'conta');
const chip = page => page.locator('#shell-chip');

async function abrirConta(page) {
  const cabeca = cabecaDoCard(page, 'Conta & sync');
  if (await cabeca.getAttribute('aria-expanded') !== 'true') await cabeca.click();
  await expect(cabeca).toHaveAttribute('aria-expanded', 'true');
}

test('#configuracoes mostra os 7 cards fechados em linha, na ordem, com o resumo da conta', async ({ page, extensao }) => {
  await abrirPainel(page, extensao);

  const cabecas = page.locator('.shell-cards').getByRole('button', { expanded: false });
  await expect(cabecas).toHaveCount(7);
  for (const [i, nome] of ['Conta & sync', 'Atalhos', 'IA dos cartões', 'Chave do Gemini', 'Conexão com o Anki', 'Aparência', 'Zona de perigo'].entries()) {
    await expect(cabecas.nth(i)).toHaveAccessibleName(nome);
  }
  await expect(resumo(page, 'conta')).toHaveText('Sem conta · só neste computador');
  await expect(conta(page).getByRole('button', { name: 'Entrar com Google' })).toBeHidden();
});

// Exceção de teste: sem-estado-guardado — abrir e fechar os cards de Configurações não grava nada.
test('clicar na linha abre o card no lugar, e vários ficam abertos ao mesmo tempo', async ({ page, extensao }) => {
  await abrirPainel(page, extensao);
  const descricao = conta(page).getByText('Com a conta, suas frases ficam iguais em qualquer computador em que você entrar.');
  await expect(descricao).toBeHidden();

  await resumo(page, 'conta').click();
  await expect(cabecaDoCard(page, 'Conta & sync')).toHaveAttribute('aria-expanded', 'true');
  await expect(descricao).toBeVisible();
  await expect(resumo(page, 'conta')).toBeHidden();
  await expect(conta(page).getByRole('button', { name: 'Entrar com Google' })).toBeVisible();

  await cabecaDoCard(page, 'Zona de perigo').click();
  await expect(cabecaDoCard(page, 'Zona de perigo')).toHaveAttribute('aria-expanded', 'true');
  await expect(cabecaDoCard(page, 'Conta & sync')).toHaveAttribute('aria-expanded', 'true');

  await cabecaDoCard(page, 'Conta & sync').click();
  await expect(cabecaDoCard(page, 'Conta & sync')).toHaveAttribute('aria-expanded', 'false');
  await expect(descricao).toBeHidden();
  await expect(resumo(page, 'conta')).toBeVisible();
});

test('#configuracoes/conta abre o card, rola até ele e pisca a borda', async ({ page, extensao }) => {
  await page.setViewportSize({ width: 1280, height: 400 });
  await abrirPainel(page, extensao, '#configuracoes/perigo');
  await expect(cabecaDoCard(page, 'Zona de perigo')).toHaveAttribute('aria-expanded', 'true');
  await expect(cabecaDoCard(page, 'Conta & sync')).toHaveAttribute('aria-expanded', 'false');

  await page.evaluate(() => { location.hash = '#configuracoes/conta'; });
  await expect(cabecaDoCard(page, 'Conta & sync')).toHaveAttribute('aria-expanded', 'true');
  await expect(conta(page)).toBeInViewport();
  expect(await conta(page).evaluate(el => getComputedStyle(el).animationName)).toBe('shell-destaque');
});

// Exceção de teste: sem-estado-guardado — o chip só leva ao card Conta & sync; nada é gravado.
test('o chip de conta leva ao card Conta & sync aberto', async ({ page, extensao }) => {
  await abrirPainel(page, extensao, '#frases');
  await chip(page).click();
  await expect(page).toHaveURL(/#configuracoes\/conta$/);
  await expect(cabecaDoCard(page, 'Conta & sync')).toHaveAttribute('aria-expanded', 'true');
  await expect(conta(page).getByRole('button', { name: 'Entrar com Google' })).toBeVisible();
});

const CHAVE_DO_GEMINI = 'AIzaSyD4kQ7wL2mXe9pRtB8nVfH0cJ3kQ9';
const SELECAO_NO_BOTAO_VOLTAR = {
  type: 'mouse', button: 3, code: null, altKey: true, ctrlKey: false, shiftKey: false, label: 'Alt+Mouse Back',
};


// Exceção de teste: sem-estado-guardado — o que fica guardado foi semeado antes; abrir a Zona de perigo não grava nada.
test('as linhas fechadas resumem os atalhos, a chave mascarada e o total de frases gravados', async ({ page, extensao }) => {
  await extensao.gravarStorage({
    frases: frasesDeExemplo(1245),
    geminiApiKey: CHAVE_DO_GEMINI,
    pm_atalho: SELECAO_NO_BOTAO_VOLTAR,
  });
  await abrirPainel(page, extensao);

  await expect(resumo(page, 'perigo')).toHaveText('1.245 frases');
  await expect(resumo(page, 'atalhos').locator('> span')).toHaveText(['Legenda Alt+S', 'Seleção Alt+Botão voltar']);
  await expect(resumo(page, 'atalhos').locator('kbd')).toHaveText(['Alt+S', 'Alt+Botão voltar']);
  await expect(resumo(page, 'chave')).toHaveText('AIza••••••••3kQ9');
  await expect(page.getByText(CHAVE_DO_GEMINI)).toHaveCount(0);

  await cabecaDoCard(page, 'Zona de perigo').click();
  await expect(resumo(page, 'perigo')).toBeHidden();
  await expect(card(page, 'perigo').getByRole('button', { name: 'Apagar todas as 1.245 frases' })).toBeVisible();
});

test('sem nada gravado: “Sem atalho” tracejado, “Sem chave” em danger e “Nenhuma frase”; os resumos acompanham o que muda', async ({ page, extensao }) => {
  await abrirPainel(page, extensao);

  await expect(resumo(page, 'perigo')).toHaveText('Nenhuma frase');
  await expect(resumo(page, 'atalhos').locator('> span')).toHaveText(['Legenda Alt+S', 'Seleção Sem atalho']);
  await expect(resumo(page, 'atalhos').locator('kbd').last()).toHaveClass(/veio-kbd--sem-atalho/);
  await expect(resumo(page, 'chave')).toHaveText('Sem chave');
  const corDoPerigo = await page.evaluate(() => {
    const amostra = document.createElement('span');
    amostra.style.color = 'var(--veio-danger)';
    document.body.append(amostra);
    return getComputedStyle(amostra).color;
  });
  expect(await resumo(page, 'chave').locator('.cfg-status').evaluate(el => getComputedStyle(el).color)).toBe(corDoPerigo);

  await extensao.gravarStorage({
    frases: frasesDeExemplo(1),
    geminiApiKey: CHAVE_DO_GEMINI,
    pm_atalho: { type: 'keyboard', button: null, code: 'KeyK', altKey: false, ctrlKey: true, shiftKey: true, label: 'Ctrl+Shift+K' },
  });
  await expect(resumo(page, 'atalhos').locator('> span')).toHaveText(['Legenda Alt+S', 'Seleção Ctrl+Shift+K']);
  await expect(resumo(page, 'chave')).toHaveText('AIza••••••••3kQ9');
  await page.reload();
  await expect(resumo(page, 'perigo')).toHaveText('1 frase');
});

test('abaixo de ~560 px de conteúdo, nenhuma linha fechada mostra resumo', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: frasesDeExemplo(3), geminiApiKey: CHAVE_DO_GEMINI, pm_atalho: SELECAO_NO_BOTAO_VOLTAR });
  await page.setViewportSize({ width: 1280, height: 800 });
  await abrirPainel(page, extensao);
  for (const secao of ['conta', 'atalhos', 'chave', 'perigo']) await expect(resumo(page, secao)).toBeVisible();
  await expect(resumo(page, 'perigo')).toHaveText('3 frases');

  await page.setViewportSize({ width: 700, height: 800 });
  for (const secao of ['conta', 'atalhos', 'chave', 'perigo']) await expect(resumo(page, secao)).toBeHidden();
});

// Exceção de teste: sem-estado-guardado — trocar o tamanho da janela e fechar o card não gravam nada.
test('abaixo de ~560 px de conteúdo, o resumo da linha fechada some e o conteúdo perde o recuo', async ({ page, extensao }) => {
  await extensao.semearSessao({ displayName: 'Ana Souza' });
  await page.setViewportSize({ width: 1280, height: 800 });
  await abrirPainel(page, extensao);
  await expect(resumo(page, 'conta')).toBeVisible();
  await abrirConta(page);
  const recuo = () => conta(page).locator('.cfg-corpo').evaluate(el => parseFloat(getComputedStyle(el).paddingLeft));
  expect(await recuo()).toBe(62);

  await page.setViewportSize({ width: 700, height: 800 });
  await expect.poll(recuo).toBe(16);
  await cabecaDoCard(page, 'Conta & sync').click();
  await expect(resumo(page, 'conta')).toBeHidden();
});

// Exceção de teste: sem-estado-guardado — abrir e fechar o card pelo teclado não grava nada.
test('a linha do card abre e fecha pelo teclado, com o foco visível', async ({ page, extensao }) => {
  await abrirPainel(page, extensao);
  const cabeca = cabecaDoCard(page, 'Conta & sync');
  await cabeca.focus();
  expect(await cabeca.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');

  await page.keyboard.press('Enter');
  await expect(cabeca).toHaveAttribute('aria-expanded', 'true');
  await expect(cabeca).toHaveAttribute('aria-controls', /.+/);
  await page.keyboard.press('Space');
  await expect(cabeca).toHaveAttribute('aria-expanded', 'false');
});

test('com movimento reduzido, #configuracoes/conta mostra a borda ouro parada, e ela sai depois do flash', async ({ page, extensao, relogioParado }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const relogio = await relogioParado({ em: new Date('2026-09-18T12:00:00') });
  await abrirPainel(page, extensao, '#configuracoes/conta');

  const ouro = await page.evaluate(() => {
    const amostra = document.createElement('i');
    amostra.style.color = 'var(--veio-accent)';
    document.body.append(amostra);
    const cor = getComputedStyle(amostra).color;
    amostra.remove();
    return cor;
  });
  const borda = () => conta(page).evaluate(el => getComputedStyle(el).borderTopColor);
  expect(await borda()).toBe(ouro);
  expect(await conta(page).evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  await relogio.avancar(1500);
  await expect.poll(borda, { timeout: 3000 }).not.toBe(ouro);
});

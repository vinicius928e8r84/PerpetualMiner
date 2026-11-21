'use strict';

const { test, expect } = require('../fixtures');

const CHAVE = 'chave-de-teste';
const FRASES = ['The ferry left without a single passenger.', 'Rain drummed on the tin roof all night.'];
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function abrirAPagina(page, extensao, { chave = CHAVE } = {}) {
  if (chave) await extensao.gravarStorage({ geminiApiKey: chave });
  await page.goto(extensao.url('bookreader/bookreader.html'));
  await expect(page.getByRole('heading', { name: 'Minerar de uma foto' })).toBeVisible();
}

test('a chave do Gemini vai no cabeçalho do pedido e a URL não leva a chave nem parâmetro nenhum', async ({ page, extensao, fakes }) => {
  fakes.gemini.responderFrases(FRASES);
  await extensao.gravarStorage({ geminiApiKey: CHAVE });
  await page.goto(extensao.url('bookreader/bookreader.html'));
  await page.locator('#foto-arquivo').setInputFiles([{ name: 'pagina.png', mimeType: 'image/png', buffer: PNG_1X1 }]);
  await page.getByRole('button', { name: 'Ler marcações' }).click();
  await expect(page.getByText('2 frases encontradas')).toBeVisible();

  expect(fakes.gemini.chamadas).toHaveLength(1);
  const { chave, url } = fakes.gemini.chamadas[0];
  expect(chave).toBe(CHAVE);
  expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent');

  await page.locator('#foto-minerar').click();
  await expect(page.locator('.veio-toast')).toHaveText('2 frases mineradas');
  const gravadas = (await extensao.frases()).filter(f => f.streaming === 'livro');
  expect(gravadas.map(f => f.texto).sort()).toEqual([...FRASES].sort());
  expect((await extensao.lerStorage('geminiApiKey')).geminiApiKey).toBe(CHAVE);
});

// Exceção de teste: sem-estado-guardado — sem chave, o Abrir Configurações só abre o painel na chave; nada é gravado.
test('sem chave, o cartão FOT-05 no lugar do campo de chave, e “Abrir Configurações” abre #configuracoes/chave com o campo focado', async ({ page, context, extensao }) => {
  await abrirAPagina(page, extensao, { chave: null });

  await expect(page.getByText('Falta a chave do Gemini')).toBeVisible();
  await expect(page.getByText('Para ler fotos, adicione sua chave do Gemini em Configurações.')).toBeVisible();
  await expect(page.getByText('Adicione a chave do Gemini para começar', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Escolher' })).toHaveCount(0);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);

  const [painel] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('button', { name: 'Abrir Configurações' }).click(),
  ]);

  await expect(painel).toHaveURL(/painel\.html#configuracoes\/chave$/);
  await expect(painel.locator('#cfg-chave-campo')).toBeFocused();
});

// Exceção de teste: sem-estado-guardado — o Abrir Configurações só leva a aba do painel à chave; nada é gravado.
test('sem chave e com o painel aberto, “Abrir Configurações” leva aquela aba à chave', async ({ page, context, extensao }) => {
  const painel = await context.newPage();
  await painel.goto(extensao.url('painel.html#frases'));
  await abrirAPagina(page, extensao, { chave: null });
  const abasAntes = context.pages().length;

  await page.getByRole('button', { name: 'Abrir Configurações' }).click();

  await expect(painel).toHaveURL(/painel\.html#configuracoes\/chave$/);
  await expect(painel.locator('#cfg-chave-campo')).toBeFocused();
  expect(context.pages()).toHaveLength(abasAntes);
});

// Exceção de teste: sem-estado-guardado — o Abrir Configurações só põe o foco no campo da chave; nada é gravado.
test('com o painel já em #configuracoes/chave, “Abrir Configurações” põe o foco no campo de novo', async ({ page, context, extensao }) => {
  const painel = await context.newPage();
  await painel.goto(extensao.url('painel.html#configuracoes/chave'));
  await expect(painel.locator('#cfg-chave-campo')).toBeFocused();
  await painel.locator('#cfg-chave-campo').blur();
  await abrirAPagina(page, extensao, { chave: null });
  await page.bringToFront();

  await page.getByRole('button', { name: 'Abrir Configurações' }).click();

  await expect(painel.locator('#cfg-chave-campo')).toBeFocused();
});

test('a chave salva no painel libera a página sem recarregar', async ({ page, extensao }) => {
  await abrirAPagina(page, extensao, { chave: null });
  await expect(page.getByText('Falta a chave do Gemini')).toBeVisible();

  await extensao.gravarStorage({ geminiApiKey: CHAVE });

  await expect(page.getByText('Falta a chave do Gemini')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Escolher' })).toBeVisible();
  await expect(page.getByText('Tire uma foto da página com os trechos marcados e escolha quais frases minerar. As frases aparecem aqui, agrupadas por foto.', { exact: true })).toBeVisible();
});

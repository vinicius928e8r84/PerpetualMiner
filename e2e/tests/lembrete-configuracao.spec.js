'use strict';

// Passo 8 do redesign: o lembrete “Configuração pela metade” (#44; item 9 da
// lista fechada, docs/design/painel/boas-vindas/, variante C).
//
// Enquanto a Boas-vindas não chega a Tudo pronto (Abrir painel) e o lembrete não
// foi ocultado, o popup mostra o cartão ONB-14 com o anel de progresso e Frases
// a faixa ONB-15. A conta é a mesma da Boas-vindas: um passo conta quando está
// feito pelo estado real ou quando a pessoa disse “Agora não” a ele.
// Continuar configuração abre #boas-vindas no primeiro passo que falta; Ocultar
// (só em Frases) esconde o lembrete de vez, nos dois lugares.
//
// Os testes afirmam o que a pessoa vê e o que fica gravado.

const { test, expect } = require('../fixtures');

test.use({ lembreteDaConfiguracao: true });

const HOJE = new Date().toLocaleDateString('pt-BR');
const UMA_FRASE = [{ id: 1, texto: 'Keep me posted.', data: HOJE, streaming: 'netflix', idioma: 'Inglês' }];
const CTRL_SHIFT_L = { type: 'keyboard', code: 'KeyL', altKey: false, ctrlKey: true, shiftKey: true, label: 'Ctrl+Shift+L' };

const cartaoDoPopup = page => page.getByRole('button', { name: /Configuração pela metade/ });
const faixa = page => page.getByRole('complementary', { name: /A configuração ficou pela metade/ });
const tituloDaBoasVindas = page => page.locator('.bv-card').getByRole('heading', { level: 2 });

async function abrirFrases(page, extensao) {
  await page.goto(extensao.url('painel.html#frases'));
  await expect(page.getByRole('heading', { name: 'Frases mineradas' })).toBeVisible();
}

async function abrirPopup(page, extensao) {
  await page.goto(extensao.url('popup.html'));
  await expect(page.getByRole('button', { name: 'Abrir painel' })).toBeVisible();
}

test('a instalação deixa a configuração começada, sem nenhum passo', async ({ extensao }) => {
  expect((await extensao.lerStorage('pm_boas_vindas')).pm_boas_vindas)
    .toEqual({ agoraNao: [], concluida: false });
});

test('2 de 6 passos feitos: o popup e Frases dizem “2 de 6”, e a conta segue o que muda', async ({ page, context, extensao, fakes }) => {
  fakes.anki.desligar();
  await extensao.gravarStorage({ pm_atalho: CTRL_SHIFT_L });

  await abrirFrases(page, extensao);
  await expect(faixa(page)).toContainText('A configuração ficou pela metade: 1 de 6 passos.');

  const popup = await context.newPage();
  await abrirPopup(popup, extensao);
  await expect(cartaoDoPopup(popup)).toContainText('Configuração pela metade · 1 de 6');

  await extensao.gravarStorage({ frases: UMA_FRASE });

  await expect(faixa(page)).toContainText('A configuração ficou pela metade: 2 de 6 passos.');
  await expect(faixa(page).getByRole('button', { name: 'Ocultar' })).toBeVisible();
  await expect(faixa(page).getByRole('button', { name: 'Continuar configuração' })).toBeVisible();

  await expect(cartaoDoPopup(popup)).toContainText('Configuração pela metade · 2 de 6');
  await expect(cartaoDoPopup(popup)).toContainText('Volte de onde parou');
  await expect(cartaoDoPopup(popup)).toContainText('Continuar configuração');
});

test('“Agora não” conta como um passo resolvido, como na Boas-vindas', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await extensao.gravarStorage({ pm_boas_vindas: { agoraNao: ['conta', 'chave'], concluida: false } });

  await abrirFrases(page, extensao);
  await expect(faixa(page)).toContainText('2 de 6 passos.');
});

test('a Conexão com o Anki respondendo conta o passo dela', async ({ page, extensao }) => {
  await abrirFrases(page, extensao);
  await expect(faixa(page)).toContainText('1 de 6 passos.');
});

test('Ocultar em Frases esconde o lembrete de vez: some do popup e continua oculto ao recarregar', async ({ page, context, extensao }) => {
  const popup = await context.newPage();
  await abrirPopup(popup, extensao);
  await expect(cartaoDoPopup(popup)).toBeVisible();

  await page.bringToFront();
  await abrirFrases(page, extensao);
  await faixa(page).getByRole('button', { name: 'Ocultar' }).click();

  await expect(faixa(page)).toBeHidden();
  // O foco não se perde com a faixa: vai para o botão do cabeçalho da área.
  await expect(page.getByRole('button', { name: 'Minerar frases', expanded: false })).toBeFocused();
  await expect(cartaoDoPopup(popup)).toBeHidden();
  expect((await extensao.lerStorage('pm_boas_vindas')).pm_boas_vindas)
    .toEqual({ agoraNao: [], concluida: false, lembreteOculto: true });

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Frases mineradas' })).toBeVisible();
  await expect(faixa(page)).toBeHidden();
  await popup.reload();
  await expect(popup.getByRole('button', { name: 'Abrir painel' })).toBeVisible();
  await expect(cartaoDoPopup(popup)).toBeHidden();
});

test('chegar a Tudo pronto tira o lembrete sem ocultá-lo', async ({ page, context, extensao }) => {
  await abrirFrases(page, extensao);
  await expect(faixa(page)).toBeVisible();

  await page.goto(extensao.url('painel.html#boas-vindas/pronto'));
  await page.getByRole('button', { name: 'Abrir painel' }).click();

  await expect(page).toHaveURL(/#frases$/);
  await expect(page.getByRole('heading', { name: 'Frases mineradas' })).toBeVisible();
  await expect(faixa(page)).toBeHidden();

  const popup = await context.newPage();
  await abrirPopup(popup, extensao);
  await expect(cartaoDoPopup(popup)).toBeHidden();
  expect((await extensao.lerStorage('pm_boas_vindas')).pm_boas_vindas.lembreteOculto).toBeUndefined();
});

test('Continuar configuração em Frases cai no primeiro passo que falta', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await extensao.gravarStorage({
    frases: UMA_FRASE,
    pm_atalho: CTRL_SHIFT_L,
    pm_boas_vindas: { agoraNao: ['conta'], concluida: false },
  });

  await abrirFrases(page, extensao);
  await faixa(page).getByRole('button', { name: 'Continuar configuração' }).click();

  await expect(page).toHaveURL(/#boas-vindas\/anki$/);
  await expect(tituloDaBoasVindas(page)).toHaveText('Ligar a Conexão com o Anki');
});

test('Continuar configuração no popup abre o painel no primeiro passo que falta', async ({ page, context, extensao, fakes }) => {
  fakes.anki.desligar();
  await abrirPopup(page, extensao);

  const [painel] = await Promise.all([
    context.waitForEvent('page'),
    cartaoDoPopup(page).click(),
  ]);

  await expect(painel).toHaveURL(extensao.url('painel.html#boas-vindas/minerar'));
  await expect(tituloDaBoasVindas(painel)).toHaveText('Minerar a primeira frase');
});

test('com todos os passos resolvidos e sem Abrir painel, o lembrete diz 6 de 6 e Continuar leva a Tudo pronto', async ({ page, extensao }) => {
  await extensao.gravarStorage({
    frases: UMA_FRASE,
    pm_atalho: CTRL_SHIFT_L,
    pm_boas_vindas: { agoraNao: ['conta', 'automatica', 'chave'], concluida: false },
  });

  await abrirFrases(page, extensao);
  await expect(faixa(page)).toContainText('6 de 6 passos.');
  await faixa(page).getByRole('button', { name: 'Continuar configuração' }).click();

  await expect(page).toHaveURL(/#boas-vindas\/pronto$/);
  await expect(tituloDaBoasVindas(page)).toHaveText('Tudo pronto');
});

test.describe('quem atualizou a extensão', () => {
  test.use({ lembreteDaConfiguracao: false });

  test('nunca começou a Boas-vindas, então não vê lembrete', async ({ page, context, extensao }) => {
    await abrirFrases(page, extensao);
    const popup = await context.newPage();
    await abrirPopup(popup, extensao);

    // Frases já desenhou a lista: o lembrete teria aparecido junto.
    await expect(page.getByText('Nenhuma frase ainda')).toBeVisible();
    await expect(faixa(page)).toBeHidden();
    await expect(cartaoDoPopup(popup)).toBeHidden();
  });
});

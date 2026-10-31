'use strict';

// O resto do plano do ChatGPT no card IA dos cartões (#156, docs/design/imagem-pelo-plano.md): o modal da primeira vez, a conta
// grátis ou Go que o plano não atende, e o plano sem chave (o Cartão sai com foto real ou sem imagem gerada). A Conexão com o Anki é
// o fake do e2e, que responde pelo contrato (complemento/contrato/exemplos-do-chatgpt.json). O que fica guardado é o aviso já dado,
// no storage da extensão (`pm_plano_do_chatgpt_avisado`); o login mora na Conexão.

const { test, expect } = require('../fixtures');
const { estadoFinal, estadoFinalEm } = require('../estado-final');

const AVISADO = 'pm_plano_do_chatgpt_avisado';
const card = page => page.locator('#cfg-ia');
const coluna = page => card(page).getByRole('region', { name: /Conta do ChatGPT/ });
const aviso = page => page.getByRole('dialog', { name: 'Você está usando o seu plano do ChatGPT' });
const faixa = page => card(page).getByRole('alert');

async function abrirIA(page, extensao) {
  await page.goto(extensao.url('painel.html#configuracoes/ia'));
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');
  await expect(coluna(page)).toBeVisible();
}

async function colarAChave(page, chave = 'sk-proj-chave-de-exemplo-9f3a') {
  await card(page).getByRole('textbox', { name: 'Chave da OpenAI' }).fill(chave);
  await card(page).getByRole('button', { name: 'Conferir e salvar' }).click();
  await expect(card(page).locator('.cfg-resumo')).toHaveText('••••••••9f3a');
}

test('a primeira vez que o plano do ChatGPT está em uso, o modal diz de onde sai o uso e Entendi o guarda como dado', async ({ page, extensao, fakes }) => {
  fakes.anki.chatgpt.definir('conectada');
  await abrirIA(page, extensao);

  await expect(aviso(page)).toBeVisible();
  await expect(aviso(page)).toContainText('O texto dos cartões gasta o uso do seu plano, e não a sua chave. A imagem gerada por IA continua saindo pela chave.');
  await expect(aviso(page).getByRole('button', { name: 'Entendi' })).toBeFocused();
  await expect(card(page).getByRole('region', { name: /Conta do ChatGPT/ })).toContainText('Usando o plano do ChatGPT');

  await aviso(page).getByRole('button', { name: 'Entendi' }).click();
  await expect(aviso(page)).toHaveCount(0);
  await estadoFinal(extensao, { [AVISADO]: true });
});

test('depois do Entendi, o modal não volta, nem ao recarregar o painel', async ({ page, extensao, fakes }) => {
  fakes.anki.chatgpt.definir('conectada');
  await extensao.gravarStorage({ [AVISADO]: true });
  await abrirIA(page, extensao);
  await expect(coluna(page)).toContainText('Usando o plano do ChatGPT');
  await expect(aviso(page)).toHaveCount(0);

  await page.reload();
  await expect(coluna(page)).toContainText('Usando o plano do ChatGPT');
  await expect(aviso(page)).toHaveCount(0);
  await estadoFinal(extensao, { [AVISADO]: true });
});

test('entrar com o ChatGPT pela primeira vez abre o modal ao voltar da aba, e Esc também o dispensa', async ({ page, context, extensao }) => {
  await abrirIA(page, extensao);
  await Promise.all([context.waitForEvent('page'), coluna(page).getByRole('button', { name: 'Continuar com o ChatGPT' }).click()]);

  await expect(aviso(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(aviso(page)).toHaveCount(0);
  await estadoFinal(extensao, { [AVISADO]: true });
});

test('a conta grátis ou Go: a faixa diz que o plano não serve e que a chave é o caminho, e Usar a chave leva ao campo', async ({ page, extensao, fakes }) => {
  fakes.anki.chatgpt.definir('nao_serve');
  await abrirIA(page, extensao);

  await expect(faixa(page)).toContainText('Conta do ChatGPT: O plano do ChatGPT não serve para a conta grátis ou Go. Use a chave da OpenAI.');
  await faixa(page).getByText('Detalhes').click();
  await expect(faixa(page)).toContainText('chatgpt_not_eligible');
  await faixa(page).getByRole('button', { name: 'Usar a chave' }).click();
  await expect(card(page).getByRole('textbox', { name: 'Chave da OpenAI' })).toBeFocused();
  await expect(aviso(page)).toHaveCount(0);

  await estadoFinalEm('o login do ChatGPT na Conexão', () => fakes.anki.chatgpt.situacao(), 'nao_serve');
});

test('com o plano e sem chave, o card diz que o cartão sai com foto real ou sem imagem gerada; com a chave, a nota some', async ({ page, extensao, fakes }) => {
  fakes.anki.chatgpt.definir('conectada');
  await extensao.gravarStorage({ [AVISADO]: true });
  await abrirIA(page, extensao);
  const nota = 'Sem a chave da OpenAI, o cartão sai com foto real ou sem imagem gerada.';

  await expect(coluna(page)).toContainText(nota);
  await expect(card(page)).toContainText('A imagem gerada por IA sempre sai pela chave, mesmo com o plano do ChatGPT.');

  await colarAChave(page);
  await expect(card(page)).not.toContainText(nota);
  await estadoFinal(extensao, { pm_chave_openai: { ultimos4: '9f3a' } });
});

test('sem o plano, a nota da chave que falta não aparece', async ({ page, extensao }) => {
  await abrirIA(page, extensao);

  await expect(coluna(page).getByRole('button', { name: 'Continuar com o ChatGPT' })).toBeEnabled();
  await expect(card(page)).not.toContainText('o cartão sai com foto real ou sem imagem gerada');
  await estadoFinal(extensao, { pm_chave_openai: null });
});

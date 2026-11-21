'use strict';

const { test, expect } = require('../fixtures');
const { estadoFinal } = require('../estado-final');

const CHAVE = 'sk-proj-chave-de-exemplo-9f3a';
const OUTRA_CHAVE = 'sk-proj-OutraChaveDoTeste0987654321-wxyz';
const COPIA_NA_CONEXAO = 'A Conexão com o Anki guarda a chave.';

const card = page => page.locator('#cfg-ia');
const corpo = page => card(page).locator('.cfg-corpo');
const campo = page => card(page).getByRole('textbox', { name: 'Chave da OpenAI' });

async function abrirComAChaveConferida(page, extensao) {
  await page.goto(extensao.url('painel.html#configuracoes/ia'));
  await campo(page).fill(CHAVE);
  await card(page).getByRole('button', { name: 'Conferir e salvar' }).click();
  await expect(corpo(page)).toContainText(COPIA_NA_CONEXAO);
}

async function esperarOPainelVerAMudanca(page, chave) {
  await page.evaluate(nome => {
    window.mudancaVista = new Promise(resolver => {
      chrome.storage.onChanged.addListener(function ouvir(mudancas, area) {
        if (area !== 'local' || !(nome in mudancas)) return;
        chrome.storage.onChanged.removeListener(ouvir);
        resolver();
      });
    });
  }, chave);
  return () => page.evaluate(() => window.mudancaVista);
}

test('a marca da chave que muda no storage com a Conexão ligada é conferida de novo: volta à chave que a Conexão guarda, com a cópia', async ({ page, extensao, fakes }) => {
  await abrirComAChaveConferida(page, extensao);
  const conferencias = () => fakes.anki.requisicoes.filter(r => r.caminho === '/ia/estado').length;
  const antes = conferencias();

  await extensao.gravarStorage({ pm_chave_openai: { ultimos4: 'wxyz' } });

  await estadoFinal(extensao, { pm_chave_openai: { ultimos4: '9f3a' } });
  await expect(card(page).locator('.cfg-resumo')).toHaveText('••••••••9f3a');
  await expect(corpo(page)).toContainText(COPIA_NA_CONEXAO);
  expect(conferencias()).toBeGreaterThan(antes);
});

test('entrar na conta com Trocar chave aberto não redesenha o campo: o que foi digitado e o foco ficam', async ({ page, extensao }) => {
  await abrirComAChaveConferida(page, extensao);
  await card(page).getByRole('button', { name: 'Trocar chave' }).click();
  await campo(page).fill(OUTRA_CHAVE);
  await expect(campo(page)).toBeFocused();
  const viu = await esperarOPainelVerAMudanca(page, 'pm_user_info');

  await extensao.semearSessao({ uid: 'uid-teste' });
  await viu();

  await expect(campo(page)).toBeFocused();
  await expect(campo(page)).toHaveValue(OUTRA_CHAVE);
  await expect(card(page).getByRole('button', { name: 'Cancelar' })).toBeVisible();
  await estadoFinal(extensao, { pm_chave_openai: { ultimos4: '9f3a' }, pm_user_info: { uid: 'uid-teste' } });
});

test('a chave conferida leva o foco ao Trocar chave, e a recusada o devolve ao campo', async ({ page, extensao, fakes }) => {
  await abrirComAChaveConferida(page, extensao);
  await expect(card(page).getByRole('button', { name: 'Trocar chave' })).toBeFocused();

  fakes.anki.responderOpenAI('recusa');
  await card(page).getByRole('button', { name: 'Trocar chave' }).click();
  await campo(page).fill(OUTRA_CHAVE);
  await card(page).getByRole('button', { name: 'Conferir e salvar' }).click();

  await expect(card(page).getByRole('alert')).toContainText('A OpenAI recusou a chave.');
  await expect(campo(page)).toBeFocused();
  await estadoFinal(extensao, { pm_chave_openai: { ultimos4: '9f3a' } });
});

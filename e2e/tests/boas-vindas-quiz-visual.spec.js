'use strict';

// Referência visual do quiz de nível no passo do nível da Boas-vindas (#170, ONB-21 e ONB-22): o botão “Não sei meu nível, quero descobrir”, a pergunta sobre a pessoa,
// as três perguntas de 4 alternativas (escuta, legenda, verso) com a resposta marcada, o alfabeto do russo e o resultado com a prévia do Cartão. Não há protótipo das
// telas em si (o do quiz é o do #130/#134/#137, sem a festa, que é do #171): elas reusam o card de passo da Boas-vindas, o botão e o controle segmentado do protótipo aprovado
// (`docs/design/painel/boas-vindas/prototipo-onboarding.html`), e o dono as compara com o protótipo do #134. Todas são PROPOSTAS (`test.fixme`, sem PNG na árvore)
// até a aprovação dele (CODING_STANDARDS regra 10). Aprovando: tirar o `fixme` e `cd e2e && npx playwright test boas-vindas-quiz-visual --update-snapshots`, e a entrada
// no livro `e2e/aprovados-visuais.json`.

const { test, expect } = require('../fixtures');

const AGUARDA_O_DONO = 'a referência visual espera a aprovação do dono (regra 10)';
const OS_DOIS = { en: { enabled: true, dailyLimit: 20 }, ru: { enabled: true, dailyLimit: 20 } };

const grupo = (page, idioma) => page.locator('.bv-card').getByRole('group', { name: idioma, exact: true });
const quiz = (page, idioma) => grupo(page, idioma).locator('.quiz');

async function abrir(page, extensao, relogioParado, { largura = 1100, tema } = {}) {
  const relogio = await relogioParado();
  await extensao.gravarStorage({ pm_auto_miner_settings: OS_DOIS, ...(tema && { pm_tema: tema }) });
  await page.setViewportSize({ width: largura, height: 900 });
  await page.goto(extensao.url('painel.html#boas-vindas/nivel'));
  await expect(page.locator('.bv-card h2')).toHaveText('Escolher o nível do cartão');
  await page.evaluate(() => document.fonts.ready);
  return relogio;
}

/** Abre o quiz do inglês e responde à parte 1 como quem aponta o Iniciante; a primeira pergunta de 4 alternativas (a legenda) fica na tela. */
async function atePrimeiraPergunta(page) {
  await grupo(page, 'Inglês').getByRole('button', { name: 'Não sei meu nível, quero descobrir' }).click();
  await quiz(page, 'Inglês').getByRole('button', { name: 'Só dubladas ou com legenda em português' }).click();
  await quiz(page, 'Inglês').getByRole('button', { name: 'Preciso traduzir quase tudo' }).click();
  await expect(quiz(page, 'Inglês')).toContainText('Pergunta 1 de 3');
}

const tela = (page, nome) => expect(page).toHaveScreenshot(nome, { fullPage: true, animations: 'disabled' });

test('o passo do nível com o botão do quiz sob o controle', async ({ page, extensao, relogioParado }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrir(page, extensao, relogioParado);
  await expect(grupo(page, 'Inglês').getByRole('button', { name: 'Não sei meu nível, quero descobrir' })).toBeVisible();

  await tela(page, 'quiz-botao.png');
});

test('a primeira pergunta sobre a pessoa', async ({ page, extensao, relogioParado }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrir(page, extensao, relogioParado);
  await grupo(page, 'Inglês').getByRole('button', { name: 'Não sei meu nível, quero descobrir' }).click();
  await expect(quiz(page, 'Inglês')).toContainText('Como você assiste séries em inglês?');

  await tela(page, 'quiz-perfil.png');
});

test('a pergunta de legenda', async ({ page, extensao, relogioParado }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrir(page, extensao, relogioParado);
  await atePrimeiraPergunta(page);

  await tela(page, 'quiz-legenda.png');
});

test('a pergunta de legenda com um chute errado: a certa e a errada marcadas', async ({ page, extensao, relogioParado }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrir(page, extensao, relogioParado);
  await atePrimeiraPergunta(page);
  await quiz(page, 'Inglês').locator('.quiz__opcao').first().click();
  await expect(quiz(page, 'Inglês').locator('.quiz__opcao[data-estado="certa"]')).toHaveCount(1);

  await tela(page, 'quiz-legenda-errou.png');
});

test('a pergunta só de áudio', async ({ page, extensao, relogioParado }) => {
  test.fixme(true, AGUARDA_O_DONO);
  const relogio = await abrir(page, extensao, relogioParado);
  await atePrimeiraPergunta(page);
  await quiz(page, 'Inglês').locator('.quiz__opcao').first().click();
  await relogio.avancar(1000);
  await expect(quiz(page, 'Inglês').getByRole('button', { name: 'Ouvir de novo' })).toBeVisible();

  await tela(page, 'quiz-escuta.png');
});

test('o alfabeto do russo', async ({ page, extensao, relogioParado }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrir(page, extensao, relogioParado);
  await grupo(page, 'Russo').getByRole('button', { name: 'Não sei meu nível, quero descobrir' }).click();
  await expect(quiz(page, 'Russo')).toContainText('Você já lê o alfabeto russo?');

  await tela(page, 'quiz-alfabeto.png');
});

test('o resultado: o nível sugerido com a prévia do Cartão e Usar este estilo', async ({ page, extensao, relogioParado }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrir(page, extensao, relogioParado);
  await grupo(page, 'Russo').getByRole('button', { name: 'Não sei meu nível, quero descobrir' }).click();
  await quiz(page, 'Russo').getByRole('button', { name: 'Ainda não' }).click();
  await expect(quiz(page, 'Russo').locator('.previa iframe').contentFrame().locator('.card')).toBeVisible();

  await tela(page, 'quiz-resultado.png');
});

test('a janela estreita empilha a lista sobre o card, com a pergunta inteira', async ({ page, extensao, relogioParado }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrir(page, extensao, relogioParado, { largura: 520 });
  await atePrimeiraPergunta(page);

  await tela(page, 'quiz-estreita.png');
});

test('o tema claro', async ({ page, extensao, relogioParado }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrir(page, extensao, relogioParado, { tema: 'claro' });
  await atePrimeiraPergunta(page);

  await tela(page, 'quiz-claro.png');
});

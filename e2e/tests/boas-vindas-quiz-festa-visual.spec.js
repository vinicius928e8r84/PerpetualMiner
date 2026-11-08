'use strict';

// Referência visual da festa e da Revelação do quiz de nível (#171, ONB-21 e ONB-22): o acerto com o placar, a sequência e o “+10”, a Revelação com as portas cheias até o
// nível, e a Revelação com menos movimento. O dono as comparou com o protótipo do #137 (C · Festa, B · Revelação) e as aprovou em 2026-11-08 (PR 327); a aprovação está em
// `e2e/aprovados-visuais.json` (CODING_STANDARDS regra 10). Mudou o visual: `cd e2e && npx playwright test boas-vindas-quiz-festa-visual --update-snapshots` só depois de nova aprovação
// dele, com a entrada nova no livro. A captura congela as animações (`animations: 'disabled'` leva cada uma ao fim), e o confete, que some ao fim, só aparece na prova do comportamento.

const { test, expect } = require('../fixtures');
const { quiz, responderAParte1, responder, percorrer, abrirOQuiz, fraseDaPergunta, CERTA } = require('../apoio-do-quiz');

const tela = (page, nome) => expect(page).toHaveScreenshot(nome, { fullPage: true, animations: 'disabled' });

test('o acerto: a certa marcada, a sequência e o placar', async ({ page, extensao, fakes, relogioParado }) => {
  const relogio = await abrirOQuiz(page, extensao, relogioParado);
  await responderAParte1(page, 'Inglês', 'iniciante');
  await responder(page, 'Inglês', fakes, relogio, 'certo');
  const certa = CERTA[await fraseDaPergunta(page, 'Inglês', fakes)];
  await quiz(page, 'Inglês').locator('.quiz__opcao').getByText(certa, { exact: true }).click();
  await expect(quiz(page, 'Inglês')).toContainText('Pontos: 30');

  await tela(page, 'quiz-festa-acerto.png');
});

test('a Revelação do Intermediário: duas portas cheias, a do nível em ouro', async ({ page, extensao, fakes, relogioParado }) => {
  const relogio = await abrirOQuiz(page, extensao, relogioParado);
  await responderAParte1(page, 'Inglês', 'iniciante');
  await percorrer(page, 'Inglês', fakes, relogio, ['certo', 'certo', 'certo', 'certo', 'certo', 'errado']);
  await expect(quiz(page, 'Inglês').locator('.quiz__porta[data-cheia]')).toHaveCount(2);

  await tela(page, 'quiz-festa-revelacao.png');
});

test.describe('menos movimento', () => {
  test.use({ reducedMotion: 'reduce' });

  test('a Revelação só com a cor', async ({ page, extensao, fakes, relogioParado }) => {
    const relogio = await abrirOQuiz(page, extensao, relogioParado);
    await responderAParte1(page, 'Inglês', 'iniciante');
    await percorrer(page, 'Inglês', fakes, relogio, ['certo', 'certo', 'certo', 'certo', 'certo', 'errado']);

    await tela(page, 'quiz-festa-revelacao-sem-movimento.png');
  });
});

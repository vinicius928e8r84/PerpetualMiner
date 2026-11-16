'use strict';

const { test, expect } = require('../fixtures');
const { quiz, responderAParte1, responder, percorrer, abrirOQuiz, fraseDaPergunta, CERTA } = require('../apoio-do-quiz');

// A prévia do Cartão é o HTML do Anki com a fonte do sistema, que muda de máquina para máquina: fica coberta, e o que a referência prova é a festa e a Revelação.
const tela = (page, nome, { mascarar = [] } = {}) => expect(page).toHaveScreenshot(nome, { fullPage: true, animations: 'disabled', mask: mascarar });

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

  await tela(page, 'quiz-festa-revelacao.png', { mascarar: [quiz(page, 'Inglês').locator('.previa__palco')] });
});

test.describe('menos movimento', () => {
  test.use({ reducedMotion: 'reduce' });

  test('a Revelação só com a cor', async ({ page, extensao, fakes, relogioParado }) => {
    const relogio = await abrirOQuiz(page, extensao, relogioParado);
    await responderAParte1(page, 'Inglês', 'iniciante');
    await percorrer(page, 'Inglês', fakes, relogio, ['certo', 'certo', 'certo', 'certo', 'certo', 'errado']);

    await tela(page, 'quiz-festa-revelacao-sem-movimento.png', { mascarar: [quiz(page, 'Inglês').locator('.previa__palco')] });
  });
});

'use strict';

// Boas-vindas · o quiz de nível (#170, ONB-21 e ONB-22), o ritmo, o resultado e o áudio (a regra dos dois portões está em `boas-vindas-quiz.spec.js`): a pessoa que não sabe o nível abre “Não sei meu nível, quero descobrir” de um idioma,
// responde às 2 perguntas sobre o que já faz e a de 3 a 6 de 4 alternativas, e vê o nível sugerido com a prévia do Cartão. Cada teste percorre um caminho da regra dos dois
// portões (#134) e confere o nível que ficou guardado nos Ajustes de envio (`ankiBridgePresets`). A Conexão com o Anki é falsificada na fronteira HTTP
// (e2e/fakes/anki.js): a fala vem de `POST /voz/falar` e a prévia de `POST /anki/card-preview`. O relógio fica parado (`relogioParado`): a próxima pergunta entra
// quando o teste anda 1 s. Sem a festa (#171); o ranking é de `boas-vindas-quiz-ranking.spec.js` (#172).

const { test, expect } = require('../fixtures');
const { estadoFinal } = require('../estado-final');
const {
  CHAVE, FALAR, CERTA, ESCUTA, PAUSA_DA_RESPOSTA_MS,
  card, grupo, quiz, pergunta, dizeres, pedidosDaPrevia, abrirOQuiz, responderAParte1, fraseDaPergunta, responder, percorrer, usarOEstilo,
} = require('../apoio-do-quiz');

test.describe('o ritmo e a sequência', () => {
  test('a certa aparece marcada, a próxima pergunta só entra sozinha depois de 1 s e o áudio toca sozinho', async ({ page, extensao, fakes, relogioParado }) => {
    const relogio = await abrirOQuiz(page, extensao, relogioParado);
    await responderAParte1(page, 'Inglês', 'iniciante');
    expect(dizeres(fakes)).toEqual([]);

    await quiz(page, 'Inglês').locator('.quiz__opcao').nth(0).click();
    await expect(quiz(page, 'Inglês').locator('.quiz__opcao[data-estado="certa"]')).toHaveCount(1);
    await expect(quiz(page, 'Inglês').locator('.quiz__opcao').first()).toBeDisabled();
    await expect(quiz(page, 'Inglês')).toContainText('Pergunta 1 de 3');
    await relogio.avancar(PAUSA_DA_RESPOSTA_MS);

    await expect(quiz(page, 'Inglês')).toContainText('Pergunta 2 de 3');
    await expect(pergunta(page, 'Inglês')).toHaveText(ESCUTA);
    await expect.poll(() => dizeres(fakes)).toEqual([{ lang: 'en', sotaque: 'co.uk', texto: 'Could you tell me where the nearest pharmacy is?' }]);
    // Exceção de teste: sem-estado-guardado — o ritmo do quiz é só o que aparece na tela; o nível só é guardado em Usar este estilo.
    expect((await extensao.lerStorage(CHAVE))[CHAVE]).toBeUndefined();
  });

  test('“Não sei” pausa a sequência: ela não sobe nem zera, e a certa aparece marcada', async ({ page, extensao, fakes, relogioParado }) => {
    const relogio = await abrirOQuiz(page, extensao, relogioParado);
    await responderAParte1(page, 'Inglês', 'iniciante');
    await expect(quiz(page, 'Inglês')).toContainText('Sequência: 0');

    await responder(page, 'Inglês', fakes, relogio, 'certo');
    await expect(quiz(page, 'Inglês')).toContainText('Sequência: 1');
    await responder(page, 'Inglês', fakes, relogio, 'certo');
    await expect(quiz(page, 'Inglês')).toContainText('Sequência: 2');
    await expect(quiz(page, 'Inglês').locator('.quiz__feedback')).toBeEmpty();

    await quiz(page, 'Inglês').getByRole('button', { name: 'Não sei', exact: true }).click();
    await expect(quiz(page, 'Inglês')).toContainText('Sequência: 2');
    await expect(quiz(page, 'Inglês').locator('.quiz__feedback')).toHaveText('A certa está marcada.');
    await expect(quiz(page, 'Inglês').locator('.quiz__opcao[data-estado="certa"]')).toHaveCount(1);
    await relogio.avancar(PAUSA_DA_RESPOSTA_MS);

    // Com “Não sei” numa de legenda o portão não passa: são 3 perguntas e o nível é o Iniciante, com a melhor sequência de 2 no resumo.
    await expect(quiz(page, 'Inglês').locator('.quiz__resumo')).toHaveText('2 de 3 certas · melhor sequência: 2 · escuta: 1 de 1');
    await expect(quiz(page, 'Inglês').getByRole('radio', { name: 'Iniciante' })).toBeChecked();
    // Exceção de teste: sem-estado-guardado — a sequência é só o que aparece na tela; nada é guardado até Usar este estilo.
    expect((await extensao.lerStorage(CHAVE))[CHAVE]).toBeUndefined();
  });

  test('o chute errado zera a sequência, e a melhor continua no resumo', async ({ page, extensao, fakes, relogioParado }) => {
    const relogio = await abrirOQuiz(page, extensao, relogioParado);
    await responderAParte1(page, 'Inglês', 'iniciante');
    await responder(page, 'Inglês', fakes, relogio, 'certo');
    await responder(page, 'Inglês', fakes, relogio, 'certo');
    await expect(quiz(page, 'Inglês')).toContainText('Sequência: 2');

    const certa = CERTA[await fraseDaPergunta(page, 'Inglês', fakes)];
    await quiz(page, 'Inglês').locator('.quiz__opcao').filter({ hasNotText: certa }).first().click();
    await expect(quiz(page, 'Inglês')).toContainText('Sequência: 0');
    await relogio.avancar(PAUSA_DA_RESPOSTA_MS);

    await expect(quiz(page, 'Inglês').locator('.quiz__resumo')).toHaveText('2 de 3 certas · melhor sequência: 2 · escuta: 1 de 1');
    // Exceção de teste: sem-estado-guardado — a sequência é só o que aparece na tela; nada é guardado até Usar este estilo.
    expect((await extensao.lerStorage(CHAVE))[CHAVE]).toBeUndefined();
  });

  test('errar mostra a certa marcada e a errada, sem tirar a pessoa da pergunta', async ({ page, extensao, fakes, relogioParado }) => {
    const relogio = await abrirOQuiz(page, extensao, relogioParado);
    await responderAParte1(page, 'Inglês', 'iniciante');
    const certa = CERTA[await fraseDaPergunta(page, 'Inglês', fakes)];

    await quiz(page, 'Inglês').locator('.quiz__opcao').filter({ hasNotText: certa }).first().click();

    await expect(quiz(page, 'Inglês').locator('.quiz__opcao[data-estado="certa"]')).toHaveText(certa);
    await expect(quiz(page, 'Inglês').locator('.quiz__opcao[data-estado="errada"]')).toHaveCount(1);
    await expect(quiz(page, 'Inglês').locator('.quiz__feedback')).toHaveText('Não foi essa. A certa está marcada.');
    await relogio.avancar(PAUSA_DA_RESPOSTA_MS);
    await expect(quiz(page, 'Inglês')).toContainText('Pergunta 2 de 3');
    // Exceção de teste: sem-estado-guardado — só mostra a resposta na tela; nada é guardado até Usar este estilo.
    expect((await extensao.lerStorage(CHAVE))[CHAVE]).toBeUndefined();
  });
});

test.describe('o resultado', () => {
  test('mostra a prévia do Cartão do nível sugerido e deixa trocar o nível ali, antes de usar', async ({ page, extensao, fakes, relogioParado }) => {
    const relogio = await abrirOQuiz(page, extensao, relogioParado);
    await responderAParte1(page, 'Inglês', 'iniciante');
    await percorrer(page, 'Inglês', fakes, relogio, ['certo', 'certo', 'certo', 'certo', 'certo', 'errado']);

    await expect(quiz(page, 'Inglês')).toContainText('Prefere outro nível? Troque aqui.');
    await expect(quiz(page, 'Inglês')).toContainText('Dá para trocar depois em Ajustes de envio › Estilo do cartão.');
    await expect(quiz(page, 'Inglês').locator('.previa')).toContainText('Exemplo do Intermediário em inglês, como o Anki mostra.');
    await expect(quiz(page, 'Inglês').locator('.previa').frameLocator('iframe').locator('body')).toContainText('Desistir de fazer algo, parar de tentar.');
    // Trocar o nível ali só muda o que está na tela: nada é guardado antes de Usar este estilo.
    await quiz(page, 'Inglês').locator('label', { hasText: 'Avançado' }).click();
    await expect(quiz(page, 'Inglês').locator('.previa')).toContainText('Exemplo do Avançado em inglês, como o Anki mostra.');
    await expect(quiz(page, 'Inglês').locator('.previa').frameLocator('iframe').locator('body')).toContainText('To stop doing or trying something');
    await expect.poll(() => pedidosDaPrevia(fakes)).toEqual(expect.arrayContaining([{ lang: 'en', nivel: 'intermediario' }, { lang: 'en', nivel: 'avancado' }]));
    expect((await extensao.lerStorage(CHAVE))[CHAVE]).toBeUndefined();

    await usarOEstilo(page, 'Inglês');
    await expect(grupo(page, 'Inglês').getByRole('radio', { name: 'Avançado' })).toBeChecked();
    await estadoFinal(extensao, { [CHAVE]: { en: { nivel: 'avancado', versao: 1 } } });
  });

  test('usar o estilo fecha o quiz, volta ao controle com o nível salvo e marca o passo como feito', async ({ page, extensao, fakes, relogioParado }) => {
    const relogio = await abrirOQuiz(page, extensao, relogioParado);
    await responderAParte1(page, 'Inglês', 'intermediario');
    await percorrer(page, 'Inglês', fakes, relogio, ['certo', 'certo', 'certo']);
    await expect(page.getByRole('navigation', { name: 'Passos da configuração' }).getByRole('button', { name: /^Escolher o nível do cartão/ })).not.toHaveAccessibleName(/feito/);

    await usarOEstilo(page, 'Inglês');

    await expect(grupo(page, 'Inglês').getByRole('radiogroup', { name: 'Estilo do cartão' }).getByRole('radio', { name: 'Avançado' })).toBeChecked();
    await expect(grupo(page, 'Inglês').getByRole('button', { name: 'Não sei meu nível, quero descobrir' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Passos da configuração' }).getByRole('button', { name: /^Escolher o nível do cartão/ })).toHaveAccessibleName(/feito$/);
    await estadoFinal(extensao, { [CHAVE]: { en: { nivel: 'avancado', versao: 1 } } });
  });

  test('sair do quiz devolve o controle do nível sem guardar nada', async ({ page, extensao, relogioParado }) => {
    await abrirOQuiz(page, extensao, relogioParado);
    await expect(grupo(page, 'Inglês').getByRole('radiogroup', { name: 'Estilo do cartão' })).toHaveCount(0);
    await responderAParte1(page, 'Inglês', 'iniciante');

    await quiz(page, 'Inglês').getByRole('button', { name: 'Sair do quiz' }).click();

    await expect(quiz(page, 'Inglês')).toHaveCount(0);
    await expect(grupo(page, 'Inglês').getByRole('radio', { name: 'Iniciante' })).toBeChecked();
    // Exceção de teste: sem-estado-guardado — sair do quiz não grava nível nenhum.
    expect((await extensao.lerStorage(CHAVE))[CHAVE]).toBeUndefined();
  });
});

test.describe('quando o áudio não vem', () => {
  test('com a Conexão desligada, a pergunta de áudio diz o que falta, segue respondível e Ouvir de novo toca quando ela volta', async ({ page, extensao, fakes, relogioParado }) => {
    fakes.anki.desligar();
    const relogio = await abrirOQuiz(page, extensao, relogioParado);
    await responderAParte1(page, 'Inglês', 'iniciante');
    await responder(page, 'Inglês', fakes, relogio, 'certo');

    await expect(pergunta(page, 'Inglês')).toHaveText(ESCUTA);
    await expect(quiz(page, 'Inglês').locator('.quiz__aviso')).toHaveText('O áudio precisa da Conexão com o Anki ligada.');
    fakes.anki.ligar();
    await quiz(page, 'Inglês').getByRole('button', { name: 'Ouvir de novo' }).click();
    await expect(quiz(page, 'Inglês').locator('.quiz__aviso')).toBeHidden();
    await expect.poll(() => dizeres(fakes).at(-1)).toEqual({ lang: 'en', sotaque: 'co.uk', texto: 'Could you tell me where the nearest pharmacy is?' });
    await quiz(page, 'Inglês').getByRole('button', { name: 'Não sei', exact: true }).click();
    await expect(quiz(page, 'Inglês').locator('.quiz__opcao[data-estado="certa"]')).toHaveCount(1);
    // Exceção de teste: sem-estado-guardado — o aviso do áudio é só o que aparece na tela; nada é guardado até Usar este estilo.
    expect((await extensao.lerStorage(CHAVE))[CHAVE]).toBeUndefined();
  });

  test('uma Conexão sem a rota da fala pede para atualizar', async ({ page, extensao, fakes, relogioParado }) => {
    fakes.anki.responder('POST', FALAR, () => ({ status: 404, json: { error: 'not_found' } }));
    const relogio = await abrirOQuiz(page, extensao, relogioParado);
    await responderAParte1(page, 'Inglês', 'iniciante');
    await quiz(page, 'Inglês').locator('.quiz__opcao').first().click();
    await relogio.avancar(PAUSA_DA_RESPOSTA_MS);

    await expect(quiz(page, 'Inglês').locator('.quiz__aviso')).toHaveText('Atualize a Conexão com o Anki para ouvir as perguntas.');
    // Exceção de teste: sem-estado-guardado — o aviso do áudio é só o que aparece na tela.
    expect((await extensao.lerStorage(CHAVE))[CHAVE]).toBeUndefined();
  });

  test('o Google recusando a fala diz que não deu para tocar, e a pergunta segue respondível', async ({ page, extensao, fakes, relogioParado }) => {
    fakes.anki.responder('POST', FALAR, () => ({ status: 502, json: { error: 'tts_rejected' } }));
    const relogio = await abrirOQuiz(page, extensao, relogioParado);
    await responderAParte1(page, 'Inglês', 'iniciante');
    await quiz(page, 'Inglês').locator('.quiz__opcao').first().click();
    await relogio.avancar(PAUSA_DA_RESPOSTA_MS);

    await expect(quiz(page, 'Inglês').locator('.quiz__aviso')).toHaveText('Não deu para tocar o áudio. Tente de novo.');
    await quiz(page, 'Inglês').locator('.quiz__opcao').first().click();
    await expect(quiz(page, 'Inglês').locator('.quiz__feedback')).not.toBeEmpty();
    // Exceção de teste: sem-estado-guardado — o aviso do áudio é só o que aparece na tela.
    expect((await extensao.lerStorage(CHAVE))[CHAVE]).toBeUndefined();
  });
});

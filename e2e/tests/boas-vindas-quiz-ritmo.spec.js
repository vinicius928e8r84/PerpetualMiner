'use strict';

const { test, expect } = require('../fixtures');
const { estadoFinal } = require('../estado-final');
const {
  CHAVE, FALAR, CERTA, ESCUTA, PAUSA_DA_RESPOSTA_MS, CINCO_CERTAS_E_UMA_ERRADA,
  card, grupo, quiz, pergunta, dizeres, pedidosDaPrevia, abrirOQuiz, responderAParte1, fraseDaPergunta, responder, usarOEstilo, naParte2, chegarAoNivelSugerido,
} = require('../apoio-do-quiz');

async function escolherAPrimeiraAlternativaEEsperarAPausa({ page, relogio }) {
  await quiz(page, 'Inglês').locator('.quiz__opcao').first().click();
  await relogio.avancar(PAUSA_DA_RESPOSTA_MS);
}

test.describe('o ritmo e a sequência', () => {
  test('a certa aparece marcada, a próxima pergunta só entra sozinha depois de 1 s e o áudio toca sozinho', async ({ page, extensao, fakes, relogioParado }) => {
    const partida = await naParte2({ page, extensao, fakes, relogioParado });
    expect(dizeres(fakes)).toEqual([]);

    await quiz(page, 'Inglês').locator('.quiz__opcao').nth(0).click();
    await expect(quiz(page, 'Inglês').locator('.quiz__opcao[data-estado="certa"]')).toHaveCount(1);
    await expect(quiz(page, 'Inglês').locator('.quiz__opcao').first()).toBeDisabled();
    await expect(quiz(page, 'Inglês')).toContainText('Pergunta 1 de 3');
    await partida.relogio.avancar(PAUSA_DA_RESPOSTA_MS);

    await expect(quiz(page, 'Inglês')).toContainText('Pergunta 2 de 3');
    await expect(pergunta(page, 'Inglês')).toHaveText(ESCUTA);
    await expect.poll(() => dizeres(fakes)).toEqual([{ lang: 'en', sotaque: 'co.uk', texto: 'Could you tell me where the nearest pharmacy is?' }]);
    // Exceção de teste: sem-estado-guardado
    expect((await extensao.lerStorage(CHAVE))[CHAVE]).toBeUndefined();
  });

  test('“Não sei” pausa a sequência: ela não sobe nem zera, e a certa aparece marcada', async ({ page, extensao, fakes, relogioParado }) => {
    const partida = await naParte2({ page, extensao, fakes, relogioParado });
    await expect(quiz(page, 'Inglês')).toContainText('Sequência: 0');

    await responder(partida, 'certo');
    await expect(quiz(page, 'Inglês')).toContainText('Sequência: 1');
    await responder(partida, 'certo');
    await expect(quiz(page, 'Inglês')).toContainText('Sequência: 2');
    await expect(quiz(page, 'Inglês').locator('.quiz__feedback')).toBeEmpty();

    await quiz(page, 'Inglês').getByRole('button', { name: 'Não sei', exact: true }).click();
    await expect(quiz(page, 'Inglês')).toContainText('Sequência: 2');
    await expect(quiz(page, 'Inglês').locator('.quiz__feedback')).toHaveText('A certa está marcada.');
    await expect(quiz(page, 'Inglês').locator('.quiz__opcao[data-estado="certa"]')).toHaveCount(1);
    await partida.relogio.avancar(PAUSA_DA_RESPOSTA_MS);

    await expect(quiz(page, 'Inglês').locator('.quiz__resumo')).toHaveText('2 de 3 certas · melhor sequência: 2 · escuta: 1 de 1');
    await expect(quiz(page, 'Inglês').getByRole('radio', { name: 'Iniciante' })).toBeChecked();
    // Exceção de teste: sem-estado-guardado
    expect((await extensao.lerStorage(CHAVE))[CHAVE]).toBeUndefined();
  });

  test('o chute errado zera a sequência, e a melhor continua no resumo', async ({ page, extensao, fakes, relogioParado }) => {
    const partida = await naParte2({ page, extensao, fakes, relogioParado });
    await responder(partida, 'certo');
    await responder(partida, 'certo');
    await expect(quiz(page, 'Inglês')).toContainText('Sequência: 2');

    const certa = CERTA[await fraseDaPergunta(page, 'Inglês', fakes)];
    await quiz(page, 'Inglês').locator('.quiz__opcao').filter({ hasNotText: certa }).first().click();
    await expect(quiz(page, 'Inglês')).toContainText('Sequência: 0');
    await partida.relogio.avancar(PAUSA_DA_RESPOSTA_MS);

    await expect(quiz(page, 'Inglês').locator('.quiz__resumo')).toHaveText('2 de 3 certas · melhor sequência: 2 · escuta: 1 de 1');
    // Exceção de teste: sem-estado-guardado — a sequência é só o que aparece na tela; nada é guardado até Usar este estilo.
    expect((await extensao.lerStorage(CHAVE))[CHAVE]).toBeUndefined();
  });

  test('errar mostra a certa marcada e a errada, sem tirar a pessoa da pergunta', async ({ page, extensao, fakes, relogioParado }) => {
    const partida = await naParte2({ page, extensao, fakes, relogioParado });
    const certa = CERTA[await fraseDaPergunta(page, 'Inglês', fakes)];

    await quiz(page, 'Inglês').locator('.quiz__opcao').filter({ hasNotText: certa }).first().click();

    await expect(quiz(page, 'Inglês').locator('.quiz__opcao[data-estado="certa"]')).toHaveText(certa);
    await expect(quiz(page, 'Inglês').locator('.quiz__opcao[data-estado="errada"]')).toHaveCount(1);
    await expect(quiz(page, 'Inglês').locator('.quiz__feedback')).toHaveText('Não foi essa. A certa está marcada.');
    await partida.relogio.avancar(PAUSA_DA_RESPOSTA_MS);
    await expect(quiz(page, 'Inglês')).toContainText('Pergunta 2 de 3');
    // Exceção de teste: sem-estado-guardado
    expect((await extensao.lerStorage(CHAVE))[CHAVE]).toBeUndefined();
  });
});

test.describe('o resultado', () => {
  test('mostra a prévia do Cartão do nível sugerido e deixa trocar o nível ali, antes de usar', async ({ page, extensao, fakes, relogioParado }) => {
    await chegarAoNivelSugerido({ page, extensao, fakes, relogioParado }, CINCO_CERTAS_E_UMA_ERRADA);

    await expect(quiz(page, 'Inglês')).toContainText('Prefere outro nível? Troque aqui.');
    await expect(quiz(page, 'Inglês')).toContainText('Dá para trocar depois em Ajustes de envio › Estilo do cartão.');
    await expect(quiz(page, 'Inglês').locator('.previa')).toContainText('Exemplo do Intermediário em inglês, como o Anki mostra.');
    await expect(quiz(page, 'Inglês').locator('.previa').frameLocator('iframe').locator('body')).toContainText('Desistir de fazer algo, parar de tentar.');
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
    await chegarAoNivelSugerido({ page, extensao, fakes, relogioParado }, ['certo', 'certo', 'certo'], 'intermediario');
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
    // Exceção de teste: sem-estado-guardado
    expect((await extensao.lerStorage(CHAVE))[CHAVE]).toBeUndefined();
  });
});

test.describe('quando a prévia do resultado não vem', () => {
  test('o tipo de nota que sumiu do Anki: a prévia diz isso e oferece Tentar de novo, sem mandar atualizar a Conexão', async ({ page, extensao, fakes, relogioParado }) => {
    fakes.anki.responder('POST', '/anki/card-preview', () => ({ status: 404, json: { error: 'note_type_missing' } }));
    await chegarAoNivelSugerido({ page, extensao, fakes, relogioParado }, CINCO_CERTAS_E_UMA_ERRADA);

    const previa = quiz(page, 'Inglês').locator('.previa');
    await expect(previa).toContainText('O tipo de nota não está mais no Anki.');
    await expect(previa).not.toContainText('Atualize a Conexão com o Anki');
    await expect(previa.getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
    // Exceção de teste: sem-estado-guardado — a prévia só desenha o que a Conexão respondeu.
    expect((await extensao.lerStorage(CHAVE))[CHAVE]).toBeUndefined();
  });
});

const FALAS_QUE_NAO_VEM = [
  {
    nome: 'uma Conexão sem a rota da fala pede para atualizar',
    fala: { status: 404, json: { error: 'not_found' } },
    aviso: 'Atualize a Conexão com o Anki para ouvir as perguntas.',
  },
  {
    nome: 'uma fala que vem sem o áudio diz que não deu para tocar',
    fala: { status: 200, json: { audio: '' } },
    aviso: 'Não deu para tocar o áudio. Tente de novo.',
  },
];

test.describe('quando o áudio não vem', () => {
  test('com a Conexão desligada, a pergunta de áudio diz o que falta, segue respondível e Ouvir de novo toca quando ela volta', async ({ page, extensao, fakes, relogioParado }) => {
    fakes.anki.desligar();
    const partida = await naParte2({ page, extensao, fakes, relogioParado });
    await responder(partida, 'certo');

    await expect(pergunta(page, 'Inglês')).toHaveText(ESCUTA);
    await expect(quiz(page, 'Inglês').locator('.quiz__aviso')).toHaveText('O áudio precisa da Conexão com o Anki ligada.');
    fakes.anki.ligar();
    await quiz(page, 'Inglês').getByRole('button', { name: 'Ouvir de novo' }).click();
    await expect(quiz(page, 'Inglês').locator('.quiz__aviso')).toBeHidden();
    await expect.poll(() => dizeres(fakes).at(-1)).toEqual({ lang: 'en', sotaque: 'co.uk', texto: 'Could you tell me where the nearest pharmacy is?' });
    await quiz(page, 'Inglês').getByRole('button', { name: 'Não sei', exact: true }).click();
    await expect(quiz(page, 'Inglês').locator('.quiz__opcao[data-estado="certa"]')).toHaveCount(1);
    // Exceção de teste: sem-estado-guardado
    expect((await extensao.lerStorage(CHAVE))[CHAVE]).toBeUndefined();
  });

  for (const { nome, fala, aviso } of FALAS_QUE_NAO_VEM) {
    test(nome, async ({ page, extensao, fakes, relogioParado }) => {
      fakes.anki.responder('POST', FALAR, () => fala);
      const partida = await naParte2({ page, extensao, fakes, relogioParado });
      await escolherAPrimeiraAlternativaEEsperarAPausa(partida);

      await expect(quiz(page, 'Inglês').locator('.quiz__aviso')).toHaveText(aviso);
      // Exceção de teste: sem-estado-guardado — o aviso do áudio é só o que aparece na tela.
      expect((await extensao.lerStorage(CHAVE))[CHAVE]).toBeUndefined();
    });
  }

  test('o Google recusando a fala diz que não deu para tocar, e a pergunta segue respondível', async ({ page, extensao, fakes, relogioParado }) => {
    fakes.anki.responder('POST', FALAR, () => ({ status: 502, json: { error: 'tts_rejected' } }));
    const partida = await naParte2({ page, extensao, fakes, relogioParado });
    await escolherAPrimeiraAlternativaEEsperarAPausa(partida);

    await expect(quiz(page, 'Inglês').locator('.quiz__aviso')).toHaveText('Não deu para tocar o áudio. Tente de novo.');
    await quiz(page, 'Inglês').locator('.quiz__opcao').first().click();
    await expect(quiz(page, 'Inglês').locator('.quiz__feedback')).not.toBeEmpty();
    // Exceção de teste: sem-estado-guardado — o aviso do áudio é só o que aparece na tela.
    expect((await extensao.lerStorage(CHAVE))[CHAVE]).toBeUndefined();
  });
});

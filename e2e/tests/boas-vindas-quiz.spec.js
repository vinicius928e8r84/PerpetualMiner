'use strict';

const { test, expect } = require('../fixtures');
const { estadoFinal } = require('../estado-final');
const {
  CHAVE, OS_DOIS, LEGENDA, VERSO, ESCUTA,
  grupo, quiz, pergunta, dizeres, abrirOQuiz, responderAParte1, percorrer, usarOEstilo,
} = require('../apoio-do-quiz');

const CAMINHOS_ATE_O_NIVEL = [
  {
    nome: 'quem acerta a legenda e erra o verso chega ao Intermediário',
    partida: 'iniciante',
    roteiro: ['certo', 'certo', 'certo', 'certo', 'certo', 'errado'],
    radio: 'Intermediário',
    guardado: 'intermediario',
  },
  {
    nome: 'quem erra o verso e a legenda cai no Iniciante, e “Não sei” não passa o portão',
    partida: 'intermediario',
    roteiro: ['nao sei', 'certo', 'certo', 'certo', 'certo', 'errado'],
    radio: 'Iniciante',
    guardado: 'iniciante',
  },
];

async function naParte2(page, extensao, relogioParado, nivel = 'iniciante') {
  const relogio = await abrirOQuiz(page, extensao, relogioParado);
  await responderAParte1(page, 'Inglês', nivel);
  return relogio;
}

test.describe('a regra dos dois portões, em cada caminho', () => {
  test('quem começa pela legenda e erra uma tem 3 perguntas e fica no Iniciante', async ({ page, extensao, fakes, relogioParado }) => {
    const relogio = await naParte2(page, extensao, relogioParado);
    await expect(quiz(page, 'Inglês')).toContainText('Pergunta 1 de 3');

    const tipos = await percorrer(page, 'Inglês', fakes, relogio, ['errado', 'certo', 'certo']);

    expect(tipos).toEqual([LEGENDA, ESCUTA, LEGENDA]);
    await expect(quiz(page, 'Inglês').getByRole('heading', { level: 4 })).toHaveText('Nível sugerido em inglês');
    await expect(quiz(page, 'Inglês').getByRole('radio', { name: 'Iniciante' })).toBeChecked();
    await usarOEstilo(page, 'Inglês');
    await estadoFinal(extensao, { [CHAVE]: { en: { nivel: 'iniciante', versao: 1 }, ru: { nivel: 'iniciante', versao: 0 } } });
  });

  test('quem acerta as 2 de legenda e as 2 do verso tem 6 perguntas e chega ao Avançado, mesmo errando a escuta', async ({ page, extensao, fakes, relogioParado }) => {
    const relogio = await naParte2(page, extensao, relogioParado);

    const tipos = await percorrer(page, 'Inglês', fakes, relogio, ['certo', 'errado', 'certo', 'certo', 'errado', 'certo']);

    expect(tipos).toEqual([LEGENDA, ESCUTA, LEGENDA, VERSO, ESCUTA, VERSO]);
    await expect(quiz(page, 'Inglês').getByRole('radio', { name: 'Avançado' })).toBeChecked();
    await expect(quiz(page, 'Inglês').locator('.quiz__resumo')).toHaveText('4 de 6 certas · melhor sequência: 2 · escuta: 0 de 2');
    await expect(quiz(page, 'Inglês')).toContainText('A escuta aparece aqui, mas não muda o estilo.');
    await usarOEstilo(page, 'Inglês');
    await estadoFinal(extensao, { [CHAVE]: { en: { nivel: 'avancado', versao: 1 } } });
  });

  test('quem começa pelo verso e acerta as 2 tem 3 perguntas e chega ao Avançado', async ({ page, extensao, fakes, relogioParado }) => {
    const relogio = await naParte2(page, extensao, relogioParado, 'intermediario');
    await expect(quiz(page, 'Inglês')).toContainText('Pergunta 1 de 3');

    const tipos = await percorrer(page, 'Inglês', fakes, relogio, ['certo', 'certo', 'certo']);

    expect(tipos).toEqual([VERSO, ESCUTA, VERSO]);
    await expect(quiz(page, 'Inglês').getByRole('radio', { name: 'Avançado' })).toBeChecked();
    await usarOEstilo(page, 'Inglês');
    await estadoFinal(extensao, { [CHAVE]: { en: { nivel: 'avancado', versao: 1 } } });
  });

  test('quem começa pelo verso e erra uma passa a ter 6 perguntas, com a legenda, e chega ao Intermediário', async ({ page, extensao, fakes, relogioParado }) => {
    const relogio = await naParte2(page, extensao, relogioParado, 'intermediario');

    const tipos = await percorrer(page, 'Inglês', fakes, relogio, ['certo', 'certo', 'errado', 'certo', 'certo', 'certo']);

    expect(tipos).toEqual([VERSO, ESCUTA, VERSO, LEGENDA, ESCUTA, LEGENDA]);
    await expect(quiz(page, 'Inglês').getByRole('radio', { name: 'Intermediário' })).toBeChecked();
    await usarOEstilo(page, 'Inglês');
    await estadoFinal(extensao, { [CHAVE]: { en: { nivel: 'intermediario', versao: 1 } } });
  });

  for (const { nome, partida, roteiro, radio, guardado } of CAMINHOS_ATE_O_NIVEL) {
    test(nome, async ({ page, extensao, fakes, relogioParado }) => {
      const relogio = await naParte2(page, extensao, relogioParado, partida);

      await percorrer(page, 'Inglês', fakes, relogio, roteiro);

      await expect(quiz(page, 'Inglês').getByRole('radio', { name: radio })).toBeChecked();
      await usarOEstilo(page, 'Inglês');
      await estadoFinal(extensao, { [CHAVE]: { en: { nivel: guardado, versao: 1 } } });
    });
  }
});

test.describe('o russo', () => {
  test('“Ainda não” no alfabeto dá o Iniciante sem quiz e sem pedir áudio', async ({ page, extensao, fakes, relogioParado }) => {
    await abrirOQuiz(page, extensao, relogioParado, { automatica: OS_DOIS, idioma: 'Russo' });
    await expect(pergunta(page, 'Russo')).toHaveText('Você já lê o alfabeto russo?');

    await quiz(page, 'Russo').getByRole('button', { name: 'Ainda não' }).click();

    await expect(pergunta(page, 'Russo')).toHaveText('Nível sugerido em russo');
    await expect(quiz(page, 'Russo')).toContainText('Sem ler o alfabeto, o ponto de partida é o Iniciante.');
    await expect(quiz(page, 'Russo').getByRole('radio', { name: 'Iniciante' })).toBeChecked();
    await expect(quiz(page, 'Russo').locator('.previa')).toBeVisible();
    expect(dizeres(fakes)).toEqual([]);
    await usarOEstilo(page, 'Russo');
    await estadoFinal(extensao, { [CHAVE]: { ru: { nivel: 'iniciante', versao: 1 }, en: { nivel: 'iniciante', versao: 0 } } });
  });

  test('“Já leio” segue para as perguntas sobre a pessoa e o quiz, com a fala em russo no sotaque dos Ajustes', async ({ page, extensao, fakes, relogioParado }) => {
    const relogio = await abrirOQuiz(page, extensao, relogioParado, { automatica: OS_DOIS, idioma: 'Russo' });

    await quiz(page, 'Russo').getByRole('button', { name: 'Já leio' }).click();
    await expect(pergunta(page, 'Russo')).toHaveText('Como você assiste séries em russo?');
    await quiz(page, 'Russo').getByRole('button', { name: 'Só dubladas ou com legenda em português' }).click();
    await expect(pergunta(page, 'Russo')).toHaveText('E uma notícia em russo?');
    await quiz(page, 'Russo').getByRole('button', { name: 'Preciso traduzir quase tudo' }).click();
    await percorrer(page, 'Russo', fakes, relogio, ['certo', 'certo', 'certo', 'certo', 'certo', 'certo']);

    expect(dizeres(fakes)).toEqual([
      { lang: 'ru', sotaque: 'ru', texto: 'Завтра мы поедем к бабушке на поезде.' },
      { lang: 'ru', sotaque: 'ru', texto: 'Пожалуйста, закройте окно, на улице очень холодно.' },
    ]);
    await expect(quiz(page, 'Russo').getByRole('radio', { name: 'Avançado' })).toBeChecked();
    await usarOEstilo(page, 'Russo');
    await estadoFinal(extensao, { [CHAVE]: { ru: { nivel: 'avancado', versao: 1 } } });
  });
});

'use strict';

const { expect } = require('@playwright/test');

const CHAVE = 'ankiBridgePresets';
const FALAR = '/voz/falar';
const PREVIA = '/anki/card-preview';
const SO_O_INGLES = { en: { enabled: true, dailyLimit: 20 }, ru: { enabled: false, dailyLimit: 20 } };
const OS_DOIS = { en: { enabled: true, dailyLimit: 20 }, ru: { enabled: true, dailyLimit: 20 } };
const PAUSA_DA_RESPOSTA_MS = 1000;

const CERTA = {
  'I would have called you earlier, but my phone died.': 'Eu teria ligado mais cedo, mas meu celular descarregou.',
  "She didn't get the job, even though she was the most qualified candidate.": 'Ela não conseguiu o emprego, apesar de ser a candidata mais qualificada.',
  'not willing to do something, and slow to agree to do it': 'Relutante',
  'to make something less bad or less severe': 'Atenuar',
  'Could you tell me where the nearest pharmacy is?': 'Você pode me dizer onde fica a farmácia mais próxima?',
  "We're running late, so let's grab something quick on the way.": 'Estamos atrasados, então vamos comer algo rápido no caminho.',
  'Я забыл зонт дома, поэтому промок под дождём.': 'Esqueci o guarda-chuva em casa, por isso me molhei na chuva.',
  'Мы хотели пойти в кино, но все билеты уже раскупили.': 'Queríamos ir ao cinema, mas os ingressos já tinham acabado.',
  'человек, который не хочет тратить деньги зря и не выбрасывает полезные вещи': 'Econômico',
  'перенести дело на другое, более позднее время': 'Adiar',
  'Завтра мы поедем к бабушке на поезде.': 'Amanhã vamos de trem para a casa da avó.',
  'Пожалуйста, закройте окно, на улице очень холодно.': 'Por favor, feche a janela, está muito frio lá fora.',
};
const PERFIL = {
  iniciante: ['Só dubladas ou com legenda em português', 'Preciso traduzir quase tudo'],
  intermediario: ['Com legenda em inglês', 'Entendo o geral e olho uma palavra ou outra'],
};

const card = page => page.locator('.bv-card');
const grupo = (page, idioma) => card(page).getByRole('group', { name: idioma, exact: true });
const quiz = (page, idioma) => grupo(page, idioma).locator('.quiz');
const pergunta = (page, idioma) => quiz(page, idioma).getByRole('heading', { level: 4 });
const dizeres = fakes => fakes.anki.requisicoes.filter(r => r.caminho === FALAR).map(r => r.dados);
const pedidosDaPrevia = fakes => fakes.anki.requisicoes.filter(r => r.caminho === PREVIA).map(r => r.dados);

async function abrirOQuiz(page, extensao, relogioParado, { automatica = SO_O_INGLES, idioma = 'Inglês' } = {}) {
  const relogio = await relogioParado();
  await extensao.gravarStorage({ pm_auto_miner_settings: automatica });
  await page.goto(extensao.url('painel.html#boas-vindas/nivel'));
  await expect(card(page).getByRole('heading', { level: 2 })).toHaveText('Escolher o nível do cartão');
  await grupo(page, idioma).getByRole('button', { name: 'Não sei meu nível, quero descobrir' }).click();
  return relogio;
}

async function responderAParte1(page, idioma, nivel) {
  for (const resposta of PERFIL[nivel]) await quiz(page, idioma).getByRole('button', { name: resposta, exact: true }).click();
}

async function fraseDaPergunta(page, idioma, fakes) {
  const cabeca = (await pergunta(page, idioma).textContent()).trim();
  if (cabeca !== 'Ouça e escolha o que foi dito') return (await quiz(page, idioma).locator('.quiz__frase').textContent()).trim();
  await expect.poll(async () => {
    const certa = CERTA[dizeres(fakes).at(-1)?.texto];
    return Boolean(certa) && await quiz(page, idioma).locator('.quiz__opcao').getByText(certa, { exact: true }).count() > 0;
  }, { message: 'a pergunta de áudio pediu a fala à Conexão' }).toBe(true);
  return dizeres(fakes).at(-1).texto;
}

async function responder({ page, idioma, fakes, relogio }, jeito) {
  const tipo = (await pergunta(page, idioma).textContent()).trim();
  const certa = CERTA[await fraseDaPergunta(page, idioma, fakes)];
  expect(certa, `a certa da pergunta “${tipo}”`).toBeTruthy();
  const alternativas = quiz(page, idioma).locator('.quiz__opcao');
  if (jeito === 'nao sei') await quiz(page, idioma).getByRole('button', { name: 'Não sei', exact: true }).click();
  else if (jeito === 'certo') await alternativas.getByText(certa, { exact: true }).click();
  else await alternativas.filter({ hasNotText: certa }).first().click();
  await expect(quiz(page, idioma).locator('.quiz__opcao[data-estado="certa"]')).toHaveText(certa);
  await relogio.avancar(PAUSA_DA_RESPOSTA_MS);
  return tipo;
}

async function percorrer(partida, roteiro) {
  const { page, idioma } = partida;
  const tipos = [];
  for (const jeito of roteiro) tipos.push(await responder(partida, jeito));
  await expect(quiz(page, idioma).getByRole('heading', { level: 4 })).toContainText('Nível sugerido em');
  return tipos;
}

const partidaDoQuiz = (page, fakes, relogio, idioma = 'Inglês') => ({ page, idioma, fakes, relogio });

async function naParte2({ page, extensao, fakes, relogioParado }, nivel = 'iniciante') {
  const relogio = await abrirOQuiz(page, extensao, relogioParado);
  await responderAParte1(page, 'Inglês', nivel);
  return partidaDoQuiz(page, fakes, relogio);
}

async function chegarAoNivelSugerido(cenario, roteiro, nivel = 'iniciante') {
  const partida = await naParte2(cenario, nivel);
  await percorrer(partida, roteiro);
  return partida;
}

const CINCO_CERTAS_E_UMA_ERRADA = ['certo', 'certo', 'certo', 'certo', 'certo', 'errado'];
const LEGENDA = 'Leia como numa legenda e escolha o sentido';
const VERSO = 'Este verso explica qual palavra?';
const ESCUTA = 'Ouça e escolha o que foi dito';

async function usarOEstilo(page, idioma) {
  await quiz(page, idioma).getByRole('button', { name: 'Usar este nível' }).click();
  await expect(quiz(page, idioma)).toHaveCount(0);
}

module.exports = {
  CHAVE, FALAR, SO_O_INGLES, OS_DOIS, PAUSA_DA_RESPOSTA_MS, CERTA, LEGENDA, VERSO, ESCUTA,
  CINCO_CERTAS_E_UMA_ERRADA,
  card, grupo, quiz, pergunta, dizeres, pedidosDaPrevia, abrirOQuiz, responderAParte1, fraseDaPergunta, responder, percorrer, usarOEstilo,
  partidaDoQuiz, naParte2, chegarAoNivelSugerido,
};

'use strict';

const { test, expect } = require('../fixtures');
const { estadoFinalEm } = require('../estado-final');
const { abrirOQuiz, responderAParte1, percorrer, quiz, partidaDoQuiz } = require('../apoio-do-quiz');

const outra = dados => ({ idioma: 'en', foto: '', acertos: 1, perguntas: 3, grupos: [], topou: true, em: 1, ...dados });
const OUTRAS = [
  outra({ uid: 'ana', nome: 'Ana Souza', nivel: 'iniciante', nota: 33, melhorSequencia: 1 }),
  outra({ uid: 'bia', nome: 'Bia Lima', nivel: 'intermediario', nota: 1100, melhorSequencia: 4 }),
  outra({ uid: 'caio', nome: 'Caio Reis', nivel: 'avancado', nota: 2100, melhorSequencia: 6 }),
];

async function ateOResultado({ page, extensao, fakes, relogioParado }, { conta = true } = {}) {
  if (conta) await extensao.semearSessao();
  const relogio = await abrirOQuiz(page, extensao, relogioParado);
  await responderAParte1(page, 'Inglês', 'iniciante');
  await percorrer(partidaDoQuiz(page, fakes, relogio), ['errado', 'certo', 'certo']);
  return quiz(page, 'Inglês').locator('.ranking');
}

const registrosDe = (fakes, idioma = 'en') => fakes.google.rankingDe(idioma);

test.describe('o ranking do grupo', () => {
  test('quem não marca a caixa vê o X% e a lista de quem topou, e nada dela vai para a coleção', async ({ page, extensao, fakes, relogioParado }) => {
    fakes.google.gravarNoRanking(OUTRAS);
    const ranking = await ateOResultado({ page, extensao, fakes, relogioParado });

    await expect(ranking.getByRole('heading', { name: 'Ranking do grupo' })).toBeVisible();
    await expect(ranking).toContainText('Você foi melhor que 33% de quem fez o quiz');
    await expect(ranking.getByRole('checkbox', { name: 'Aparecer no ranking do grupo' })).not.toBeChecked();
    await expect(ranking).toContainText('Sem marcar, nada seu sai deste computador.');
    await expect(ranking.getByRole('listitem')).toHaveText([
      'Caio Reis · Avançado · melhor sequência: 6', 'Bia Lima · Intermediário · melhor sequência: 4', 'Ana Souza · Iniciante · melhor sequência: 1',
    ]);
    await estadoFinalEm('o ranking do inglês', () => registrosDe(fakes).map(r => r.uid).sort(), ['ana', 'bia', 'caio']);
  });

  test('marcar a caixa grava o nome, a foto, o nível e a melhor sequência dela, com o que os recortes de depois pedem', async ({ page, extensao, fakes, relogioParado }) => {
    fakes.google.gravarNoRanking(OUTRAS);
    const ranking = await ateOResultado({ page, extensao, fakes, relogioParado });

    await ranking.getByRole('checkbox', { name: 'Aparecer no ranking do grupo' }).check();

    await expect(ranking.getByRole('listitem').filter({ hasText: '(você)' })).toHaveText('Pessoa de Teste (você) · Iniciante · melhor sequência: 2');
    await expect(ranking).toContainText('Você foi melhor que 33% de quem fez o quiz');
    await expect(ranking).toContainText('Seu nome, sua foto, seu nível e sua melhor sequência aparecem para quem usa o PerpetualMiner com conta Google.');
    await estadoFinalEm('o registro dela', () => registrosDe(fakes).find(r => r.uid === 'uid-teste'), {
      uid: 'uid-teste', idioma: 'en', nome: 'Pessoa de Teste', foto: '', nivel: 'iniciante', melhorSequencia: 2, nota: 67, acertos: 2, perguntas: 3, grupos: [], topou: true,
    });
  });

  test('desmarcar a caixa apaga o registro dela, e a lista volta a ser só de quem ficou', async ({ page, extensao, fakes, relogioParado }) => {
    fakes.google.gravarNoRanking(OUTRAS);
    const ranking = await ateOResultado({ page, extensao, fakes, relogioParado });
    const caixa = ranking.getByRole('checkbox', { name: 'Aparecer no ranking do grupo' });
    await caixa.check();
    await expect(ranking.getByRole('listitem')).toHaveCount(4);

    await caixa.uncheck();

    await expect(ranking.getByRole('listitem')).toHaveCount(3);
    await expect(ranking.getByRole('checkbox', { name: 'Aparecer no ranking do grupo' })).not.toBeChecked();
    await estadoFinalEm('o ranking do inglês', () => registrosDe(fakes).map(r => r.uid).sort(), ['ana', 'bia', 'caio']);
  });

  test('sem ninguém mais no ranking, a pessoa é a primeira e não há porcentagem', async ({ page, extensao, fakes, relogioParado }) => {
    const ranking = await ateOResultado({ page, extensao, fakes, relogioParado });

    await expect(ranking).toContainText('Você é a primeira pessoa a fazer o quiz.');
    await expect(ranking).not.toContainText('Você foi melhor que');
    await expect(ranking).toContainText('Ninguém topou aparecer ainda.');
    expect(registrosDe(fakes)).toEqual([]);
  });

  test('o ranking de um idioma não mistura quem topou no outro', async ({ page, extensao, fakes, relogioParado }) => {
    fakes.google.gravarNoRanking([...OUTRAS, outra({ uid: 'dani', nome: 'Dani Russa', nivel: 'avancado', nota: 2100, melhorSequencia: 5, idioma: 'ru' })]);
    const ranking = await ateOResultado({ page, extensao, fakes, relogioParado });

    await expect(ranking.getByRole('listitem')).toHaveCount(3);
    await expect(ranking).not.toContainText('Dani Russa');
  });

  test('sem conta Google só há o aviso, e nada é pedido ao Firestore', async ({ page, extensao, fakes, relogioParado }) => {
    const ranking = await ateOResultado({ page, extensao, fakes, relogioParado }, { conta: false });

    await expect(ranking).toContainText('Entre com a conta Google, em Conta e sincronização, para ver o ranking do grupo.');
    await expect(ranking.getByRole('checkbox')).toHaveCount(0);
    expect(fakes.google.requisicoes.filter(r => r.url.includes('/ranking') || r.url.includes('runQuery'))).toEqual([]);
    expect(registrosDe(fakes)).toEqual([]);
  });

  test('se as regras recusam a leitura, o ranking diz que não carregou e deixa tentar de novo', async ({ page, extensao, fakes, relogioParado }) => {
    fakes.google.gravarNoRanking(OUTRAS);
    fakes.google.recusarAcesso();
    const ranking = await ateOResultado({ page, extensao, fakes, relogioParado });

    await expect(ranking).toContainText('Não deu para carregar o ranking.');
    await expect(ranking.getByRole('checkbox')).toHaveCount(0);
    fakes.google.recusarAcesso(false);
    await ranking.getByRole('button', { name: 'Tentar de novo' }).click();

    await expect(ranking).toContainText('Você foi melhor que 33% de quem fez o quiz');
    await estadoFinalEm('o ranking do inglês', () => registrosDe(fakes).map(r => r.uid).sort(), ['ana', 'bia', 'caio']);
  });

  test('se a nuvem recusa o registro, a caixa volta a desmarcada e nada fica gravado', async ({ page, extensao, fakes, relogioParado }) => {
    const ranking = await ateOResultado({ page, extensao, fakes, relogioParado });
    fakes.google.autenticarComo('outra-conta');

    await ranking.getByRole('checkbox', { name: 'Aparecer no ranking do grupo' }).click();

    await expect(ranking).toContainText('Não deu para atualizar a sua escolha. Tente de novo.');
    await expect(ranking.getByRole('checkbox', { name: 'Aparecer no ranking do grupo' })).not.toBeChecked();
    expect(registrosDe(fakes)).toEqual([]);
  });

  test('Chamar um amigo copia o convite', async ({ page, extensao, fakes, relogioParado }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    const ranking = await ateOResultado({ page, extensao, fakes, relogioParado });

    await ranking.getByRole('button', { name: 'Chamar um amigo' }).click();

    await expect(ranking).toContainText('Convite copiado');
    await estadoFinalEm('a área de transferência', () => page.evaluate(() => navigator.clipboard.readText()),
      'Fiz o quiz de nível de inglês no PerpetualMiner. Instale a extensão e tente me superar.');
  });

  test('quem diz “Ainda não” no alfabeto russo não fez o quiz e não vê o ranking', async ({ page, extensao, fakes, relogioParado }) => {
    await extensao.semearSessao();
    await abrirOQuiz(page, extensao, relogioParado, { automatica: { en: { enabled: false, dailyLimit: 20 }, ru: { enabled: true, dailyLimit: 20 } }, idioma: 'Russo' });

    await quiz(page, 'Russo').getByRole('button', { name: 'Ainda não' }).click();

    await expect(quiz(page, 'Russo')).toContainText('Sem ler o alfabeto, o ponto de partida é o Iniciante.');
    await expect(quiz(page, 'Russo').locator('.ranking')).toHaveCount(0);
    expect(fakes.google.requisicoes.filter(r => r.url.includes('/ranking') || r.url.includes('runQuery'))).toEqual([]);
    await estadoFinalEm('o ranking do russo', () => registrosDe(fakes, 'ru').map(r => r.uid), []);
  });
});

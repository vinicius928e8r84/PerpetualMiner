'use strict';

// Conexão com o Anki (#208): ler o arquivo do Anki não prova que ele está fechado. Quem diz “Anki fechado” confirma com
// `GET /anki/status`; uma resposta que não confirma (erro, sem a contagem, contagem que não é número, não é um objeto) deixa o
// estado desconhecido, e a tela não afirma o fechado. O que fica gravado diz o mesmo (`ankiFechado: false`).

const { test, expect } = require('../fixtures');
const DEN = 'PerpetualMiner::Inglês';

const AGORA = new Date('2026-09-18T12:00:00');
const BARALHO_EN = { palavras: 3412, cartoes: 2140, termos: 1870, porCartao: 1.62, novos: 310, aprendendo: 20, recentes: 400, maduros: 1410 };
const VOCABULARIO_EN = [{ word: 'barely', maduros: 6 }, { word: 'eerie', novos: 1 }];

const lerGravado = async (extensao, chave) => (await extensao.lerStorage(chave))[chave];

test.beforeEach(({ fakes }) => {
  fakes.anki.definirBaralho(DEN, BARALHO_EN);
  fakes.anki.definirVocabulario('en', VOCABULARIO_EN);
});

for (const [nome, responder] of [
  ['responde erro', () => ({ status: 500, json: { error: 'internal_error' } })],
  ['responde sem a contagem de processos', () => ({ json: { ok: true } })],
  ['responde a contagem como texto', () => ({ json: { processCount: '0' } })],
  ['responde algo que não é um objeto JSON', () => ({ json: [0] })],
]) {
  test(`lido o arquivo, um /anki/status que ${nome} não confirma o Anki fechado: a tela não diz “Anki fechado”`, async ({ page, extensao, fakes }) => {
    fakes.anki.ankiAbertoSemAnkiConnect();
    fakes.anki.responder('GET', '/anki/status', responder);
    await extensao.gravarStorage({ pm_anki_ja_conectou: true });
    await page.clock.setFixedTime(AGORA);
    await page.goto(extensao.url('painel.html#anki/baralhos'));

    await expect(page.locator('.shell-aba[data-aba="baralhos"]')).toContainText('Números lidos direto do arquivo do Anki.');
    await page.locator('label.veio-segmentado__opcao').filter({ hasText: /^Vocabulário$/ }).click();
    await expect(page.getByRole('listbox', { name: 'Vocabulário' }).getByRole('option')).toHaveCount(2);
    await expect(page.getByText(/Anki fechado/)).toHaveCount(0);
    for (const chave of ['pm_anki_baralhos', 'pm_anki_vocabulario']) {
      expect(await lerGravado(extensao, chave)).toMatchObject({ ankiFechado: false });
    }
  });
}

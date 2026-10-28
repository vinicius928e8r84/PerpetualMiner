'use strict';

// O botão Abrir o Anki (#150, histórias 97 a 100): o selo do popup, o selo e o “— esperando o Anki” de Baralhos e
// termos e de Vocabulário. Só o clique chama o abridor da Conexão (o host de mentira do fixture, e2e/fakes/abridor.js);
// quando o Anki responde, o selo e o botão saem e os dados vêm da Conexão. O aviso do Chrome que pede a permissão é
// nativo e o Playwright não o alcança (como em abrir-o-anki-sozinho.spec.js): a permissão dada vem do fixture.

const { test, expect } = require('../fixtures');
const { estadoFinal, estadoFinalEm } = require('../estado-final');
const contrato = require('../../complemento/contrato/exemplos.json');
const { leituraDoVocabulario: leitura } = require('../leitura-do-vocabulario');

const AGORA = new Date('2026-09-18T12:00:00');
/** As mensagens `abrir` que o abridor recebeu (o passo Abrir o Anki sozinho também manda `conferir`, que nada abre). */
const aberturas = fakes => fakes.abridor.pedidos().filter(p => p.mensagem.acao === 'abrir');
const ABRIR = { mensagem: { acao: 'abrir' }, origem: `${contrato.origemDaExtensao}/` };

const BARALHO_EN = { palavras: 3412, cartoes: 2140, termos: 1870, porCartao: 1.62, novos: 310, aprendendo: 20, recentes: 400, maduros: 1410 };
const VOCABULARIO_EN = [{ word: 'barely', maduros: 6 }, { word: 'reluctant', recentes: 2, novos: 1 }];

const aba = (page, nome) => page.locator('label.veio-segmentado__opcao').filter({ hasText: new RegExp(`^${nome}$`) });
const baralhos = page => page.locator('.shell-aba[data-aba="baralhos"]');
const vocabulario = page => page.locator('.shell-aba[data-aba="vocabulario"]');
const abrirOAnki = lugar => lugar.getByRole('button', { name: /^Abrir o Anki$|^Abrindo o Anki…$/ });
const NAO_ABRIU = 'Não deu para abrir o Anki. Abra-o você mesmo.';

test.beforeEach(({ fakes }) => {
  fakes.anki.definirBaralho('CIMV', BARALHO_EN);
  fakes.anki.definirVocabulario('en', VOCABULARIO_EN);
});

/** Lê os dados com o Anki aberto e fecha o Anki duas horas depois: o painel mostra a última leitura. */
async function fecharOAnkiDepoisDeLer(page, extensao, fakes) {
  await extensao.gravarStorage({ pm_anki_ja_conectou: true });
  await page.clock.setFixedTime(AGORA);
  await page.goto(extensao.url('painel.html#anki/baralhos'));
  await expect(page.getByRole('group', { name: 'Idioma dos baralhos' })).toContainText('3.412 palavras');
  await aba(page, 'Vocabulário').click();
  await expect(page.getByRole('listbox', { name: 'Vocabulário' }).getByRole('option')).toHaveCount(2);
  fakes.anki.desligar();
  await page.clock.setFixedTime(new Date(AGORA.getTime() + 2 * 3600_000));
  await page.reload();
}

test.describe('com a permissão do abridor', () => {
  test.use({ permissaoDoAbridor: true });

  test('Baralhos e termos com o Anki fechado: o selo tem Abrir o Anki, que chama o abridor, e quando o Anki responde os dados voltam', async ({ page, extensao, fakes }) => {
    await fecharOAnkiDepoisDeLer(page, extensao, fakes);
    await aba(page, 'Baralhos e termos').click();
    await expect(baralhos(page)).toContainText('Anki fechado. Mostrando dados de há 2 h.');
    expect(aberturas(fakes)).toEqual([]);

    await abrirOAnki(baralhos(page)).click();

    await expect.poll(() => aberturas(fakes)).toEqual([ABRIR]);
    await expect(abrirOAnki(baralhos(page))).toHaveText('Abrindo o Anki…');
    await expect(abrirOAnki(baralhos(page))).toHaveAttribute('aria-disabled', 'true');
    fakes.anki.ligar();
    await expect(baralhos(page)).not.toContainText('Anki fechado', { timeout: 10_000 });
    await expect(abrirOAnki(baralhos(page))).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Idioma dos baralhos' })).toContainText('3.412 palavras');
    expect(aberturas(fakes)).toEqual([ABRIR]);
    await estadoFinal(extensao, { pm_anki_ja_conectou: true });
  });

  test('Vocabulário com o Anki fechado: o selo tem Abrir o Anki', async ({ page, extensao, fakes }) => {
    await fecharOAnkiDepoisDeLer(page, extensao, fakes);
    await aba(page, 'Vocabulário').click();
    await expect(vocabulario(page)).toContainText('Anki fechado. Mostrando dados de há 2 h.');

    await abrirOAnki(vocabulario(page)).click();

    await expect.poll(() => aberturas(fakes)).toEqual([ABRIR]);
    fakes.anki.ligar();
    await expect(vocabulario(page)).not.toContainText('Anki fechado', { timeout: 10_000 });
    await expect(abrirOAnki(vocabulario(page))).toHaveCount(0);
    await estadoFinal(extensao, { pm_anki_ja_conectou: true });
  });

  test('sem nenhuma leitura guardada, “— esperando o Anki” tem Abrir o Anki em Baralhos e termos e em Vocabulário', async ({ page, extensao, fakes }) => {
    await extensao.gravarStorage({ pm_anki_ja_conectou: true });
    fakes.anki.desligar();
    await page.goto(extensao.url('painel.html#anki/baralhos'));
    await expect(baralhos(page)).toContainText('— esperando o Anki');
    await expect(abrirOAnki(baralhos(page))).toBeVisible();
    await aba(page, 'Vocabulário').click();
    await expect(vocabulario(page)).toContainText('Começa depois que o Anki abrir uma vez.');
    expect(aberturas(fakes)).toEqual([]);

    await abrirOAnki(vocabulario(page)).click();

    await expect.poll(() => aberturas(fakes)).toEqual([ABRIR]);
    fakes.anki.ligar();
    await expect(vocabulario(page)).not.toContainText('esperando o Anki', { timeout: 10_000 });
    await expect(page.getByRole('listbox', { name: 'Vocabulário' }).getByRole('option')).toHaveCount(2);
    await estadoFinal(extensao, { pm_anki_ja_conectou: true });
  });

  test('o abridor que não abre o Anki deixa o botão de volta e diz para abrir à mão', async ({ page, extensao, fakes }) => {
    fakes.abridor.definir('achei_sem_abrir');
    await extensao.gravarStorage({ pm_anki_ja_conectou: true });
    fakes.anki.desligar();
    await page.goto(extensao.url('painel.html#anki/baralhos'));

    await abrirOAnki(baralhos(page)).click();

    await expect(baralhos(page)).toContainText(NAO_ABRIU);
    await expect(abrirOAnki(baralhos(page))).toHaveText('Abrir o Anki');
    await expect(abrirOAnki(baralhos(page))).not.toHaveAttribute('aria-disabled', 'true');
    expect(aberturas(fakes)).toEqual([ABRIR]);
    await estadoFinal(extensao, { pm_anki_ja_conectou: true });
  });

  test('o popup com a leitura de ontem: o selo tem Abrir o Anki, que chama o abridor', async ({ page, extensao, fakes }) => {
    fakes.anki.desligar();
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    ontem.setHours(14, 2, 0, 0);
    const hoje = new Date();
    const dia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    await extensao.gravarStorage({
      pm_anki_ja_conectou: true,
      pm_auto_miner_settings: { en: { enabled: true, dailyLimit: 20 }, ru: { enabled: false, dailyLimit: 15 } },
      pm_auto_miner_daily: { date: dia, en: { count: 12 }, ru: { count: 0 } },
      pm_auto_keyword_vocab_en: leitura('CIMV', ontem.getTime()),
    });
    await page.goto(extensao.url('popup.html'));
    await expect(page.getByText('Vocabulário de ontem, 14:02')).toBeVisible();

    await abrirOAnki(page.locator('#selo-vocabulario')).click();

    await expect.poll(() => aberturas(fakes)).toEqual([ABRIR]);
    fakes.anki.ligar();
    await expect(page.locator('#selo-vocabulario')).toBeHidden({ timeout: 10_000 });
    await estadoFinal(extensao, { pm_auto_keyword_vocab_en: { deckName: 'CIMV' } });
  });

  test('o popup sem nenhuma leitura: o azulejo que espera o Anki tem Abrir o Anki', async ({ page, extensao, fakes }) => {
    fakes.anki.desligar();
    const hoje = new Date();
    const dia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    await extensao.gravarStorage({
      pm_anki_ja_conectou: true,
      pm_auto_miner_settings: { en: { enabled: true, dailyLimit: 20 }, ru: { enabled: false, dailyLimit: 15 } },
      pm_auto_miner_daily: { date: dia, en: { count: 0 }, ru: { count: 0 } },
    });
    await page.goto(extensao.url('popup.html'));
    const espera = page.locator('.popup-azulejo__espera:visible');
    await expect(espera).toContainText('— esperando o Anki');

    await abrirOAnki(espera).click();

    await expect.poll(() => aberturas(fakes)).toEqual([ABRIR]);
    await estadoFinal(extensao, { pm_auto_miner_settings: { en: { enabled: true } } });
  });
});

test.describe('sem a permissão do abridor', () => {
  test('Abrir o Anki pede a permissão ao Chrome e não chama o abridor enquanto o aviso espera', async ({ page, extensao, fakes }) => {
    await extensao.gravarStorage({ pm_anki_ja_conectou: true });
    fakes.anki.desligar();
    await page.goto(extensao.url('painel.html#anki/baralhos'));
    await expect(baralhos(page)).toContainText('— esperando o Anki');

    await abrirOAnki(baralhos(page)).click();

    await expect(abrirOAnki(baralhos(page))).toHaveAttribute('aria-disabled', 'true');
    expect(aberturas(fakes)).toEqual([]);
    await estadoFinalEm('a permissão nativeMessaging no Chrome', () => extensao.permissaoDoAbridor(), false);
  });

  test('o popup de quem nunca conectou o Anki não tem Abrir o Anki, no selo nem no azulejo, e o abridor não é chamado', async ({ page, extensao, fakes }) => {
    fakes.anki.desligar();
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    const hoje = new Date();
    const dia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    await extensao.gravarStorage({
      pm_auto_miner_settings: { en: { enabled: true, dailyLimit: 20 }, ru: { enabled: true, dailyLimit: 15 } },
      pm_auto_miner_daily: { date: dia, en: { count: 0 }, ru: { count: 0 } },
      pm_auto_keyword_vocab_en: leitura('CIMV', ontem.getTime()),
    });
    await page.goto(extensao.url('popup.html'));
    await expect(page.locator('#selo-vocabulario')).toBeVisible();
    await expect(page.locator('.popup-azulejo__espera:visible')).toContainText('— esperando o Anki');

    await expect(page.getByRole('button', { name: /^Abrir o Anki$/ })).toHaveCount(0);
    expect(aberturas(fakes)).toEqual([]);
    await estadoFinalEm('a permissão nativeMessaging no Chrome', () => extensao.permissaoDoAbridor(), false);
    await estadoFinal(extensao, { pm_auto_miner_settings: { en: { enabled: true } } });
  });
});

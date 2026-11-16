'use strict';

const { test, expect } = require('../fixtures');
const { estadoFinalEm } = require('../estado-final');
const contrato = require('../../complemento/contrato/exemplos.json');

const ABRIR = { mensagem: { acao: 'abrir' }, origem: `${contrato.origemDaExtensao}/` };

const card = page => page.getByRole('region', { name: 'Ainda não houve conexão neste computador' });
const lista = page => page.getByRole('navigation', { name: 'Como ligar' });
const itemDaLista = (page, nome) => lista(page).getByRole('button', { name: nome });
const jaTenho = page => card(page).getByRole('button', { name: 'Já tenho' });
const resultadoDoAnki = page => page.locator('#apv-anki-resultado');

test.beforeEach(({ fakes }) => {
  fakes.anki.desligar();
});

test.describe('com a permissão do abridor já dada', () => {
  test.use({ permissaoDoAbridor: true });

  test('o abridor mudo: “Já tenho” diz que o Anki está abrindo na espera e, passado o limite, mostra o caminho manual', async ({ page, extensao, fakes, relogioParado }) => {
    fakes.abridor.definir('sem_resposta');
    const relogio = await relogioParado({ em: new Date('2026-09-18T12:00:00') });
    await page.goto(extensao.url('painel.html#anki/custos'));
    await expect(card(page)).toBeVisible();

    await jaTenho(page).click();

    await expect(resultadoDoAnki(page)).toHaveText('O Anki está abrindo…');
    await expect.poll(() => fakes.abridor.pedidos()).toEqual([ABRIR]);
    await relogio.avancar(5_000);
    await expect(resultadoDoAnki(page)).toHaveText('O Anki está abrindo…');

    await relogio.avancar(6_000);
    await expect(resultadoDoAnki(page)).toHaveText('Abra o Anki para continuar.');
    await expect(itemDaLista(page, /^Ter o Anki/)).not.toHaveAccessibleName(/feito$|agora não$/);
    await estadoFinalEm('a permissão nativeMessaging no Chrome', () => extensao.permissaoDoAbridor(), true);
  });
});

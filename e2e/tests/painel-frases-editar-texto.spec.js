'use strict';

const { test, expect } = require('../fixtures');
const { AGORA, frase, abrirPainel, cartao, marcarEEnviar, enviosCriados } = require('../apoio-do-envio');

test.beforeEach(({ fakes }) => {
  fakes.anki.usarRelogio(() => AGORA);
});

const ID = 1_700_000_000_007;
const COM_PALAVRA = frase(ID, 'She hit the sack early.', { keywords: ['sack@6'], autoKeyword: false });
const chip = (page, texto) => cartao(page, texto).locator('.veio-chip-palavra');
const guardada = async extensao => (await extensao.frases()).find(f => f.id === ID);

async function trocarOTexto(page, antigo, novo) {
  await cartao(page, antigo).getByRole('button', { name: 'Editar texto' }).click();
  const campo = page.getByRole('textbox', { name: 'Texto da frase' });
  await campo.fill(novo);
  await campo.press('Enter');
  await expect(cartao(page, novo)).toBeVisible();
}

test('a Palavra que saiu do texto editado sai da frase, e o Envio não a leva', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: [COM_PALAVRA] });
  await abrirPainel(page, extensao);
  await expect(chip(page, COM_PALAVRA.texto)).toContainText('sack');

  const novo = 'She went to bed early.';
  await trocarOTexto(page, COM_PALAVRA.texto, novo);

  await expect(chip(page, novo)).toHaveCount(0);
  await expect.poll(() => guardada(extensao)).toMatchObject({ texto: novo, keywords: [] });

  await marcarEEnviar(page, [novo]);
  const [naConexao] = await enviosCriados(fakes, 1);
  expect(naConexao.corpo.entries.map(entrada => entrada.line)).toEqual([`${novo} [Contexto: netflix - Desconhecido - Desconhecido]`]);
});

test('a Palavra que continua no texto editado fica grifada no lugar novo', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: [COM_PALAVRA] });
  await abrirPainel(page, extensao);

  const novo = 'Honestly, she hit the sack early.';
  await trocarOTexto(page, COM_PALAVRA.texto, novo);

  await expect(chip(page, novo)).toContainText('sack');
  await expect(cartao(page, novo).getByRole('button', { name: 'sack', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => guardada(extensao)).toMatchObject({ texto: novo, keywords: ['sack@9'] });
});

test('o texto editado para outro idioma muda o idioma da frase: ela aparece no filtro dele', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: [COM_PALAVRA] });
  await abrirPainel(page, extensao);

  const novo = 'Она рано легла спать.';
  await trocarOTexto(page, COM_PALAVRA.texto, novo);

  await page.getByRole('combobox', { name: 'Idioma', exact: true }).selectOption({ label: 'Russo' });
  await expect(cartao(page, novo)).toBeVisible();
  await expect.poll(() => guardada(extensao)).toMatchObject({ texto: novo, idioma: 'Russo', keywords: [] });
});

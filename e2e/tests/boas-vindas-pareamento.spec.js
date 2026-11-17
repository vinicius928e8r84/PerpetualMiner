'use strict';

const { test, expect } = require('../fixtures');
const { estadoFinal, estadoFinalEm } = require('../estado-final');
const { faixa, campo, confirmar, quantosPareados, codigoNoAnki } = require('../apoio-do-pareamento');

test.use({ pareada: false });

const lista = page => page.getByRole('navigation', { name: 'Passos da configuração' });
const itemDaLista = (page, nome) => lista(page).getByRole('button', { name: new RegExp(`^${nome}`) });
const card = page => page.locator('.bv-card');
const subpasso = (page, nome) => card(page).getByRole('navigation', { name: 'Como ligar' }).getByRole('button', { name: new RegExp(`^${nome}`) });
const alerta = page => card(page).getByRole('alert');

async function abrirBoasVindas(page, extensao, passo) {
  await page.goto(extensao.url(`painel.html#boas-vindas/${passo}`));
  await expect(card(page).getByRole('heading', { level: 2 })).toBeVisible();
}

async function parearNoCard(page, fakes, conexaoDoTeste) {
  await faixa(page).getByRole('button', { name: 'Conectar' }).click();
  await expect(campo(page)).toBeVisible();
  await campo(page).fill(await codigoNoAnki(fakes, conexaoDoTeste));
  await confirmar(page).click();
  await expect(faixa(page)).toHaveCount(0);
}

test('passo 4: com a Conexão ligada e o navegador sem parear, o Conectar fica no card e o passo só é feito depois do código do Anki', async ({ page, extensao, fakes, conexaoDoTeste }) => {
  await abrirBoasVindas(page, extensao, 'anki');

  await expect(card(page).locator('#painel-pareamento')).toContainText('Conecte este navegador ao Anki');
  await expect(card(page).locator('#bv4-status-texto')).toHaveText('Conecte este navegador ao Anki');
  await expect(card(page)).not.toContainText('Achei o Anki');
  await expect(itemDaLista(page, 'Ligar a Conexão com o Anki')).not.toHaveAccessibleName(/feito/);
  await expect(subpasso(page, 'Reiniciar o Anki')).not.toHaveAccessibleName(/feito/);
  await expect(page.locator('#boas-vindas > #painel-pareamento')).toHaveCount(0);
  await estadoFinalEm('os navegadores que a Conexão tem pareados', () => quantosPareados(fakes, conexaoDoTeste), 0);

  await parearNoCard(page, fakes, conexaoDoTeste);

  await expect(itemDaLista(page, 'Ligar a Conexão com o Anki')).toHaveAccessibleName(/feito$/);
  await expect(card(page).locator('#bv4-status-texto')).toHaveText(/^Achei o Anki/);
  await expect(subpasso(page, 'Reiniciar o Anki')).toHaveAccessibleName(/feito$/);
  await estadoFinalEm('os navegadores que a Conexão tem pareados', () => quantosPareados(fakes, conexaoDoTeste), 1);
});

test('passo 5: a chave colada sem o navegador conectado diz que falta conectar, e não que a Conexão não respondeu', async ({ page, extensao, fakes, conexaoDoTeste }) => {
  await abrirBoasVindas(page, extensao, 'ia');

  await card(page).getByRole('textbox', { name: 'Chave da OpenAI' }).fill('sk-proj-chave-de-exemplo-9f3a');
  await card(page).getByRole('button', { name: 'Conferir e salvar', exact: true }).click();

  await expect(alerta(page)).toContainText('Este navegador ainda não está conectado ao Anki');
  await expect(alerta(page)).not.toContainText('não respondeu');
  await expect(alerta(page)).not.toContainText('sem resposta');
  await expect(alerta(page).getByRole('button', { name: 'Conectar' })).toBeVisible();
  await estadoFinal(extensao, { pm_chave_openai: null });
  if (!conexaoDoTeste) expect(JSON.stringify(fakes.anki.requisicoes)).not.toContain('sk-proj-chave-de-exemplo');

  await alerta(page).getByRole('button', { name: 'Conectar' }).click();
  await expect(campo(page)).toBeFocused();
  await campo(page).fill(await codigoNoAnki(fakes, conexaoDoTeste));
  await confirmar(page).click();

  await expect(faixa(page)).toHaveCount(0);
  await expect(alerta(page)).toHaveCount(0);
  await expect(itemDaLista(page, 'Ligar a Conexão com o Anki')).toHaveAccessibleName(/feito$/);
  await card(page).getByRole('button', { name: 'Conferir e salvar', exact: true }).click();
  await expect(card(page)).toContainText('Chave conferida');
  await estadoFinal(extensao, { pm_chave_openai: { ultimos4: '9f3a' } });
  await estadoFinalEm('os navegadores que a Conexão tem pareados', () => quantosPareados(fakes, conexaoDoTeste), 1);
});

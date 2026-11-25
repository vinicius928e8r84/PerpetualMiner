'use strict';

const { expect } = require('@playwright/test');
const { AGORA } = require('./apoio-do-envio');

const CHAVE = 'ankiBridgePresets';
const AJUSTES = {
  en: { deckName: 'Inglês', imageSource: '1', ttsWordTld: 'com', ttsPhraseTld: 'co.uk', versao: 1 },
  ru: { deckName: 'Русский', imageSource: '1', ttsWordTld: 'ru', ttsPhraseTld: 'ru', versao: 1 },
};
const MEU_TIPO = { name: 'Meu Inglês', fields: ['Pergunta', 'Resposta', 'Anotações', 'Som'] };
const TIPO_DE_UM_CAMPO = { name: 'Só um campo', fields: ['Texto'] };

const formulario = (page, idioma = 'Inglês') => page.getByRole('form', { name: `Ajustes de envio · ${idioma}` });
const abrirOTipo = page => formulario(page).getByRole('button', { name: 'Usar um tipo que já tenho' });
const painelDoTipo = page => formulario(page).getByRole('group', { name: 'Usar um tipo que já tenho' });
const campo = (page, nome) => painelDoTipo(page).getByLabel(nome, { exact: true });
const continuar = page => painelDoTipo(page).getByRole('button', { name: 'Continuar' });
const salvar = page => formulario(page).getByRole('button', { name: 'Salvar ajustes' });
const situacao = page => formulario(page).getByRole('status').filter({ hasText: /Salvo|Alterações não salvas/ });
const pedidosDaPrevia = fakes => fakes.anki.requisicoes.filter(r => r.caminho === '/anki/card-preview' && r.dados?.tipoProprio).map(r => r.dados);

async function abrirAjustes(page, extensao, fakes, { tipos = [MEU_TIPO, TIPO_DE_UM_CAMPO], gravado = AJUSTES } = {}) {
  fakes.anki.previa.tiposDeNota.definir(tipos);
  await extensao.gravarStorage({ pm_anki_ja_conectou: true, [CHAVE]: gravado });
  await page.clock.setFixedTime(AGORA);
  await page.goto(extensao.url('painel.html#anki/ajustes'));
  await expect(formulario(page)).toBeVisible();
}

async function abrirOPainelDoTipo(page, extensao, fakes) {
  await abrirAjustes(page, extensao, fakes);
  await abrirOTipo(page).click();
}

module.exports = {
  CHAVE, AJUSTES, MEU_TIPO, TIPO_DE_UM_CAMPO,
  formulario, abrirOTipo, painelDoTipo, campo, continuar, salvar, situacao, pedidosDaPrevia,
  abrirAjustes, abrirOPainelDoTipo,
};

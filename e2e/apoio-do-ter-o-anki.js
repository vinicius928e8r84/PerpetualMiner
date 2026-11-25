'use strict';

const { expect } = require('@playwright/test');
const { comOSistema } = require('./fixtures');
const contrato = require('../complemento/contrato/exemplos.json');

const ORIGEM = `${contrato.origemDaExtensao}/`;
const ABRIR = { mensagem: { acao: 'abrir' }, origem: ORIGEM };
const CONFERIR = { mensagem: { acao: 'conferir' }, origem: ORIGEM };
const PAGINA_DE_DOWNLOAD_DO_ANKI = 'https://apps.ankiweb.net/';
const PASSOS = [/^Ter o Anki/, /^Pôr a Conexão no Anki/, /^Reiniciar o Anki/, /^Abrir o Anki sozinho/];

const card = page => page.getByRole('region', { name: 'Ainda não houve conexão neste computador' });
const lista = page => page.getByRole('navigation', { name: 'Como ligar' });
const itemDaLista = (page, nome) => lista(page).getByRole('button', { name: nome });
const tituloDoPasso = page => page.locator('#apv-passo-titulo');
const pergunta = page => card(page).getByText('Você já tem o Anki?');
const jaTenho = page => card(page).getByRole('button', { name: 'Já tenho' });
const naoTenho = page => card(page).getByRole('button', { name: 'Não tenho' });
const baixarOAnki = page => card(page).getByRole('link', { name: 'Baixar o Anki' });
const resultadoDoAnki = page => page.locator('#apv-anki-resultado');
const statusDaConexao = page => page.locator('#apv-status');

async function abrirOCard(page, extensao) {
  await page.goto(extensao.url('painel.html#anki/custos'));
  await expect(card(page)).toBeVisible();
}

async function abrirComo(page, extensao, sistema) {
  await comOSistema(page, sistema);
  await abrirOCard(page, extensao);
}

async function esperarOLinkDaPagina(page) {
  await expect(baixarOAnki(page)).toBeVisible();
  await expect(baixarOAnki(page)).toHaveAttribute('href', PAGINA_DE_DOWNLOAD_DO_ANKI);
  await expect(baixarOAnki(page)).toHaveAttribute('target', '_blank');
  await expect(baixarOAnki(page)).toHaveAttribute('rel', 'noopener');
}

module.exports = {
  ABRIR, CONFERIR, PASSOS,
  card, lista, itemDaLista, tituloDoPasso, pergunta, jaTenho, naoTenho, baixarOAnki, resultadoDoAnki, statusDaConexao,
  abrirOCard, abrirComo, esperarOLinkDaPagina,
};

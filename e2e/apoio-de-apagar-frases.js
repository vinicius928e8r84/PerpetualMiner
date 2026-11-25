'use strict';

const { expect } = require('@playwright/test');

const PRIMEIRA = 'The ferry left before the fog had lifted.';
const SEGUNDA = 'Her notebook was full of borrowed recipes.';
const MUITAS = 400;

const muitasFrases = (quantidade = MUITAS) => Array.from({ length: quantidade }, (_, i) => ({
  id: 1_700_000_000_000 + i, texto: `The lighthouse keeper counted wave number ${i + 1}.`,
  data: new Date().toLocaleDateString('pt-BR'), streaming: 'manual', idioma: 'Inglês',
}));
const idsDas = frases => frases.map(f => String(f.id)).sort();

async function minerar(page, textos) {
  return page.evaluate(lista => Promise.all(lista.map(texto =>
    chrome.runtime.sendMessage({
      type: 'SALVAR_HISTORICO',
      texto,
      origem: 'manual',
      idioma: 'Inglês',
      contexto: { fonte: 'manual', titulo: 'Manual Input', detalhe: '' },
    }),
  )), textos);
}

async function minerarNaPopup(page, extensao, textos) {
  await page.goto(extensao.url('popup/popup.html'));
  return minerar(page, textos);
}

async function semearContaComFrases(extensao, fakes, uid, frases) {
  await extensao.semearSessao({ uid });
  await extensao.gravarStorage({ frases });
  fakes.google.gravarFrases(uid, frases);
}

async function abrirPainelSincronizado(page, extensao, endereco = '') {
  await page.goto(extensao.url(`painel.html${endereco}`));
  await expect(page.locator('#shell-chip')).toContainText('Sincronizado');
}

async function selecionarTodasAsFrases(page, total) {
  await page.getByRole('checkbox', { name: 'Selecionar página' }).check();
  await page.getByRole('button', { name: `Selecionar todas as ${total} frases` }).click();
}

module.exports = {
  PRIMEIRA, SEGUNDA, MUITAS, muitasFrases, idsDas,
  minerarNaPopup, semearContaComFrases, abrirPainelSincronizado, selecionarTodasAsFrases,
};

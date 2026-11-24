'use strict';

const { expect } = require('@playwright/test');
const { semearComoNoPrototipo, abrirConfiguracoes } = require('./apoio-das-configuracoes');

const CONTA_VISUAL = { uid: 'uid-visual', displayName: 'Ana Souza' };
const CONTA_DA_IA = { uid: 'uid-ia', displayName: 'Vinicius' };

const estadoDoChip = page => page.locator('#shell-chip-estado');
const campoDaChave = page => page.locator('#cfg-ia .cfg-chave-campo');
const esperarALigacao = (page, estado = 'ligada') => expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', estado);

async function semearContaVisual(extensao, fakes) {
  await extensao.semearSessao(CONTA_VISUAL);
  await semearComoNoPrototipo(extensao, fakes, CONTA_VISUAL.uid);
}

async function semearContaDaIA(extensao, fakes) {
  await semearComoNoPrototipo(extensao, fakes, CONTA_DA_IA.uid);
  await extensao.semearSessao(CONTA_DA_IA);
}

async function semearChaveConferida(extensao, fakes) {
  await extensao.gravarStorage({ pm_chave_openai: { ultimos4: '9f3a' } });
  fakes.anki.guardarChaveNaConexao('9f3a');
}

async function abrirComContaSincronizada(page, extensao, fakes, endereco) {
  await semearContaVisual(extensao, fakes);
  await abrirConfiguracoes(page, extensao, endereco);
  await expect(estadoDoChip(page)).toHaveText('Sincronizado agora');
  await esperarALigacao(page);
}

async function abrirOCardDoAnki(page, extensao, fakes) {
  await semearContaVisual(extensao, fakes);
  await abrirConfiguracoes(page, extensao, '#configuracoes/anki');
}

async function falharOArmazemDeSegredos(page) {
  await page.evaluate(() => {
    const abrir = indexedDB.open.bind(indexedDB);
    indexedDB.open = (...args) => {
      if (args[0] === 'pm-segredos') throw new DOMException('fake storage failure', 'StorageUnavailable');
      return abrir(...args);
    };
  });
}

module.exports = {
  estadoDoChip,
  campoDaChave,
  esperarALigacao,
  semearContaVisual,
  semearContaDaIA,
  semearChaveConferida,
  abrirComContaSincronizada,
  abrirOCardDoAnki,
  falharOArmazemDeSegredos,
};

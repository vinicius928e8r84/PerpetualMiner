'use strict';

const { expect } = require('@playwright/test');

async function abrirOCard(page, extensao) {
  await page.goto(extensao.url('painel.html#configuracoes/anki'));
  await expect(page.getByRole('button', { name: 'Conexão com o Anki', expanded: true })).toBeVisible();
}

async function abrirComPerfis(page, extensao, fakes, { lista, marcado, aberto }) {
  fakes.anki.definirPerfis(lista, { marcado, aberto });
  await abrirOCard(page, extensao);
}

const abrirComAnaMarcadaEBeto = (page, extensao, fakes) =>
  abrirComPerfis(page, extensao, fakes, { lista: ['Ana', 'Beto'], marcado: 'Ana', aberto: 'Ana' });

module.exports = { abrirOCard, abrirComPerfis, abrirComAnaMarcadaEBeto };

'use strict';

const { abrirPainel } = require('./apoio-do-envio');
const { conectar } = require('./apoio-do-pareamento');

const ilha = page => page.locator('.shell-conteudo');
const esperarAsFontes = page => page.evaluate(() => document.fonts.ready);

async function abrirOCampoDoCodigo(page, extensao) {
  await abrirPainel(page, extensao, '#anki');
  await conectar(page).click();
}

module.exports = { ilha, esperarAsFontes, abrirOCampoDoCodigo };

'use strict';

const { ehJsDaExtensao, linhaDe, semComentariosJs } = require('./comum');

const id = 'dialogo-nativo';

const guarda = 'nada de `confirm()`, `alert()` ou `prompt()` nativos: use os componentes do Veio';

const conserto = 'Use os componentes de veio/componentes.js: `Veio.abrirConfirmacao` para confirmar (o perigo abre o modal e '
  + 'confirma dentro dele), `Veio.montarAviso` para um erro que pede ação e `Veio.mostrarToastDeSucesso` para o sucesso; '
  + 'o `confirm()`, o `alert()` e o `prompt()` do navegador não entram.';

const seAplica = ehJsDaExtensao;

const DIALOGO_NATIVO = /(?<![.\w$])(?:(?:window|globalThis|self)\s*\.\s*)?(confirm|alert|prompt)\s*\(/g;

function verificar(arquivo, fonte) {
  const codigo = semComentariosJs(fonte);
  return [...codigo.matchAll(DIALOGO_NATIVO)].map(m => ({ linha: linhaDe(codigo, m.index), detalhe: `diálogo nativo do navegador: ${m[1]}()` }));
}

module.exports = { id, guarda, conserto, seAplica, verificar };

'use strict';

function expandirChaves(glob) {
  const chaves = /\{([^{}]*)\}/.exec(glob);
  if (!chaves) return [glob];
  return chaves[1].split(',').flatMap(opcao => expandirChaves(glob.slice(0, chaves.index) + opcao + glob.slice(chaves.index + chaves[0].length)));
}

const REGEX_DO_CURINGA = new Map([['**/', '(?:.*/)?'], ['**', '.*'], ['*', '[^/]*'], ['?', '[^/]']]);
const CURINGA_OU_CARACTERE_DE_REGEX = /\*\*\/|\*\*|\*|\?|[.+^$()|[\]\\]/g;

function corpoDoGlob(glob) {
  return glob.replace(CURINGA_OU_CARACTERE_DE_REGEX, pedaco => REGEX_DO_CURINGA.get(pedaco) ?? `\\${pedaco}`);
}

function globParaRegex(glob) {
  const alternativas = expandirChaves(glob).map(g => {
    if (g.endsWith('/')) {
      const pasta = g.slice(0, -1);
      return pasta.includes('/') ? `^${corpoDoGlob(pasta)}/` : `(?:^|/)${corpoDoGlob(pasta)}/`;
    }
    return g.includes('/') ? `^${corpoDoGlob(g)}$` : `(?:^|/)${corpoDoGlob(g)}$`;
  });
  return new RegExp(alternativas.join('|'));
}

module.exports = { globParaRegex };

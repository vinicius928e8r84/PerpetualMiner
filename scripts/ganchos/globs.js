'use strict';

// --- Globs: `*.lock` (nome, em qualquer pasta), `dist/` (pasta, em qualquer lugar), `a/b/` (pasta
// na raiz), `a/**/x.json` (caminho a partir da raiz); `{a,b}` vira alternativa. ---

function expandirChaves(glob) {
  const chaves = /\{([^{}]*)\}/.exec(glob);
  if (!chaves) return [glob];
  return chaves[1].split(',').flatMap(opcao => expandirChaves(glob.slice(0, chaves.index) + opcao + glob.slice(chaves.index + chaves[0].length)));
}

function corpoDoGlob(glob) {
  let regex = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') { regex += '(?:.*/)?'; i += 2; } else { regex += '.*'; i += 1; }
    } else if (c === '*') regex += '[^/]*';
    else if (c === '?') regex += '[^/]';
    else regex += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return regex;
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

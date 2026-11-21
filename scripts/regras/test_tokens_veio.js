'use strict';

const assert = require('assert');

const regra = require('./verificar').REGRAS.find(r => r.id === 'tokens-veio');

const ONDE_SE_APLICA = [
  ['veio/tokens.css', false],
  ['veio/componentes.css', true],
  ['painel.css', true],
  ['popup/popup.html', true],
  ['e2e/vitrine/vitrine.html', true],
  ['e2e/pages/loja-cartoes.html', true],
  ['e2e/pages/sub/loja-cartoes.html', false],
  ['e2e/pages/outra.html', false],
  ['docs/design/prototipo.css', false],
  ['painel.js', true],
  ['lib/historico.js', true],
  ['scripts/testar.mjs', false],
  ['README.md', false],
];

const ACHADOS = [
  {
    porque: 'cada propriedade do CSS que a regra conhece, com e sem literal',
    arquivo: 'exemplo.css',
    fonte: [
      '.a { --fundo: #fff; --largura: 240px; --nome: var(--veio-bg); }',
      '.b { color: #123456; background: url(#abc) var(--veio-bg); border-left-color: rgba(0,0,0,.5); }',
      '.c { font-size: 12px; font-size: .9rem; font-size: var(--veio-tam-p); font-size: calc(1px + 2px); }',
      '.d { font: 600 14pt sans-serif; font: inherit; }',
      '.e { border-radius: 0; border-radius: 4px; border-top-left-radius: .5em; border-radius: 0px; }',
      '.f { transition: opacity 0s; transition: opacity 200ms; animation-delay: .3s; animation: x 1.5s; }',
      '.g { outline: 1px solid hsl(0 0% 0%); box-shadow: 0 0 0 1px Tomato; fill: currentColor; stroke: transparent; }',
      '.h { width: 12px; margin: 4px; z-index: 3; }',
    ].join('\n'),
    esperado: [
      { linha: 1, detalhe: 'cor literal na variável `--fundo`: --fundo: #fff' },
      { linha: 2, detalhe: 'cor literal em `color`: color: #123456' },
      { linha: 2, detalhe: 'cor literal em `border-left-color`: border-left-color: rgba(0,0,0,.5)' },
      { linha: 3, detalhe: 'tamanho de letra literal: font-size: 12px' },
      { linha: 3, detalhe: 'tamanho de letra literal: font-size: .9rem' },
      { linha: 3, detalhe: 'tamanho de letra literal: font-size: calc(1px + 2px)' },
      { linha: 4, detalhe: 'tamanho de letra literal em `font`: font: 600 14pt sans-serif' },
      { linha: 5, detalhe: 'raio literal: border-radius: 4px' },
      { linha: 5, detalhe: 'raio literal: border-top-left-radius: .5em' },
      { linha: 6, detalhe: 'duração literal: transition: opacity 200ms' },
      { linha: 6, detalhe: 'duração literal: animation-delay: .3s' },
      { linha: 6, detalhe: 'duração literal: animation: x 1.5s' },
      { linha: 7, detalhe: 'cor literal em `outline`: outline: 1px solid hsl(0 0% 0%)' },
      { linha: 7, detalhe: 'cor literal em `box-shadow`: box-shadow: 0 0 0 1px Tomato' },
    ],
  },
  {
    porque: 'o reserva do var() conta e o comentário do CSS não',
    arquivo: 'painel.css',
    fonte: '/* color: #fff */\n.x {\n  color: var(--veio-text, #eee);\n  background: var( --veio-bg );\n}\n',
    esperado: [{ linha: 3, detalhe: 'cor literal em `color`: color: var(--veio-text, #eee)' }],
  },
  {
    porque: 'o <style> e o atributo style do HTML, fora dos comentários',
    arquivo: 'popup/popup.html',
    fonte: [
      '<!-- <div style="color: red"></div> -->',
      '<style>',
      '  .a { color: #f00; }',
      '  .b { border-radius: 3px; }',
      '</style>',
      '<div style="font-size: 11px; color: var(--veio-text)"></div>',
      "<p style='transition: all 2s'>x</p>",
    ].join('\n'),
    esperado: [
      { linha: 3, detalhe: 'cor literal em `color`: color: #f00' },
      { linha: 4, detalhe: 'raio literal: border-radius: 3px' },
      { linha: 6, detalhe: 'tamanho de letra literal: font-size: 11px' },
      { linha: 7, detalhe: 'duração literal: transition: all 2s' },
    ],
  },
  {
    porque: 'a imitação do badge na vitrine (veio/README.md § Como usar) pode ter o raio e a letra do Chrome, e só ela',
    arquivo: 'e2e/vitrine/vitrine.html',
    fonte: [
      '<style>',
      '  /* o badge do Chrome */',
      '  .icone-com-badge b { border-radius: 3px; font-size: 10px; color: #fff; transition: all 2s; }',
      '  .icone-com-badge i { border-radius: 3px; }',
      '  @media (min-width: 1px) { .icone-com-badge b { font-size: 10px; } }',
      '</style>',
      '<b class="icone-com-badge" style="font-size: 10px"></b>',
    ].join('\n'),
    esperado: [
      { linha: 3, detalhe: 'cor literal em `color`: color: #fff' },
      { linha: 3, detalhe: 'duração literal: transition: all 2s' },
      { linha: 4, detalhe: 'raio literal: border-radius: 3px' },
      { linha: 7, detalhe: 'tamanho de letra literal: font-size: 10px' },
    ],
  },
  {
    porque: 'o mesmo seletor fora da vitrine não é a imitação do badge',
    arquivo: 'popup/popup.html',
    fonte: '<style>\n  .icone-com-badge b { border-radius: 3px; font-size: 10px; }\n</style>\n',
    esperado: [
      { linha: 2, detalhe: 'raio literal: border-radius: 3px' },
      { linha: 2, detalhe: 'tamanho de letra literal: font-size: 10px' },
    ],
  },
  {
    porque: 'o estilo no JS e a cor solta numa string, uma vez por linha',
    arquivo: 'painel.js',
    fonte: [
      "el.style.fontSize = '13px';",
      "Object.assign(b.style, { borderRadius: '6px', boxShadow: `0 0 2px #000` });",
      "const cor = '#abcdef';",
      "el.style.color = '#F5B83D'; const outra = '#000';",
      "if (el.style.color == '#fff') {}",
      "el.style.animationDuration = '0s'; el.style.backgroundColor = 'var(--veio-bg)';",
      "// el.style.color = '#fff';",
      "el.style.transition = 'opacity .2s';",
    ].join('\n'),
    esperado: [
      { linha: 1, detalhe: "tamanho de letra literal: fontSize = '13px'" },
      { linha: 2, detalhe: "raio literal: borderRadius: '6px'" },
      { linha: 2, detalhe: 'cor literal em `box-shadow`: boxShadow: `0 0 2px #000`' },
      { linha: 4, detalhe: "cor literal em `color`: color = '#F5B83D'" },
      { linha: 8, detalhe: "duração literal: transition = 'opacity .2s'" },
      { linha: 3, detalhe: 'cor literal #abcdef' },
      { linha: 5, detalhe: 'cor literal #fff' },
    ],
  },
];

let total = 0;
for (const [arquivo, esperado] of ONDE_SE_APLICA) {
  assert.strictEqual(regra.seAplica(arquivo), esperado, `seAplica(${arquivo})`);
  total++;
}
for (const { porque, arquivo, fonte, esperado } of ACHADOS) {
  assert.deepStrictEqual(regra.verificar(arquivo, fonte), esperado, porque);
  total++;
}

console.log(`tokens-veio: ${total} provas passaram`);

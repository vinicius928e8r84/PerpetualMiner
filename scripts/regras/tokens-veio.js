'use strict';

const { ehDaExtensao } = require('../arquivos-do-pacote');
const { ehJsDaExtensao, linhaDe, semComentariosCss, semComentariosHtml, semComentariosJs } = require('./comum');

const id = 'tokens-veio';

const conserto = 'Use um token `var(--veio-…)` de veio/tokens.css (cores: --veio-bg, --veio-text, --veio-accent…; '
  + 'letra: --veio-tam-*; raio: --veio-raio-*; tempo: --veio-transicao, --veio-destaque…). '
  + 'Um valor que ainda não existe vira token novo em veio/tokens.css, registrado no veio/README.md. '
  + 'As únicas exceções são as de veio/README.md § Como usar (CODING_STANDARDS.md regra 2).';

function seAplica(arquivo) {
  if (arquivo === 'veio/tokens.css') return false;
  if (/\.(css|html)$/.test(arquivo) && ehDaExtensao(arquivo)) return true;
  if (arquivo === 'e2e/vitrine/vitrine.html' || /^e2e\/pages\/loja-[^/]+\.html$/.test(arquivo)) return true;
  return ehJsDaExtensao(arquivo);
}

// As 148 cores com nome do CSS (CSS Color 4); `transparent` e `currentColor` não são cor literal.
const CORES_COM_NOME = `
  aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown
  burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan
  darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred
  darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink
  deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold
  goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush
  lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey
  lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow
  lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen
  mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin
  navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise
  palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue
  saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow
  springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen
`.trim().split(/\s+/);

const COR = new RegExp(`#[0-9a-fA-F]{3,8}\\b|\\b(?:rgba?|hsla?)\\(|(?<![\\w-])(?:${CORES_COM_NOME.join('|')})(?![\\w-])`, 'i');
const PROPRIEDADE_DE_COR = /^(?:color|background(?:-color|-image)?|border(?:-(?:top|right|bottom|left|block|inline))?(?:-color)?|outline(?:-color)?|fill|stroke|box-shadow|text-shadow|caret-color|accent-color|text-decoration(?:-color)?|column-rule(?:-color)?)$/;
const PROPRIEDADE_DE_RAIO = /^border(?:-(?:top|bottom|start|end)-(?:left|right|start|end))?-radius$/;
const PROPRIEDADE_DE_TEMPO = /^(?:transition|animation)(?:-duration|-delay)?$/;

function semVar(valor) {
  return valor
    .replace(/var\(\s*--[\w-]+\s*\)/g, 'var()')
    .replace(/var\(\s*--[\w-]+\s*,/g, '(');
}

function literal(propriedade, valorBruto) {
  const p = propriedade.trim().toLowerCase();
  const valor = semVar(valorBruto).replace(/url\([^)]*\)/g, 'url()');
  if (p.startsWith('--')) return COR.test(valor) ? `cor literal na variável \`${p}\`` : null;
  if (PROPRIEDADE_DE_COR.test(p) && COR.test(valor)) return `cor literal em \`${p}\``;
  if (p === 'font-size' && /(?:^|[\s(])\d*\.?\d+(?:px|rem|pt)\b/.test(valor)) return 'tamanho de letra literal';
  if (p === 'font' && /(?:^|\s)\d*\.?\d+(?:px|rem|pt)\b/.test(valor)) return 'tamanho de letra literal em `font`';
  if (PROPRIEDADE_DE_RAIO.test(p) && /(?:^|\s)(?:0*[1-9]\d*|\d*\.\d+)(?:px|rem|em)\b/.test(valor)) return 'raio literal';
  if (PROPRIEDADE_DE_TEMPO.test(p) && /(?:^|[\s,(])(?:0*[1-9]\d*(?:\.\d+)?|0?\.\d*[1-9]\d*)m?s\b/.test(valor)) return 'duração literal';
  return null;
}

function achadosNoCss(css, deslocamento, original) {
  const achados = [];
  const blocos = deslocamento.atributo
    ? [{ corpo: css, inicio: 0 }]
    : [...css.matchAll(/\{([^{}]*)\}/g)].map(m => ({ corpo: m[1], inicio: m.index + 1 }));
  for (const { corpo, inicio } of blocos) {
    for (const m of corpo.matchAll(/([a-zA-Z-]+)\s*:\s*([^;]+)/g)) {
      const problema = literal(m[1], m[2]);
      if (!problema) continue;
      const linha = linhaDe(original, deslocamento.inicio + inicio + m.index);
      achados.push({ linha, detalhe: `${problema}: ${m[0].trim().replace(/\s+/g, ' ')}` });
    }
  }
  return achados;
}

const ESTILO_NO_JS = /\b(fontSize|borderRadius|transition|animation(?:Duration|Delay)?|color|background(?:Color)?|borderColor|outlineColor|boxShadow)\s*(?::|=(?!=))\s*(['"`])([^'"`]*)\2/g;
const PARA_CSS = nome => nome.replace(/[A-Z]/g, letra => `-${letra.toLowerCase()}`);

function achadosNoJs(fonte) {
  const codigo = semComentariosJs(fonte);
  const achados = [];
  for (const m of codigo.matchAll(ESTILO_NO_JS)) {
    const problema = literal(PARA_CSS(m[1]), m[3]);
    if (problema) achados.push({ linha: linhaDe(codigo, m.index), detalhe: `${problema}: ${m[0]}` });
  }
  const jaVistas = new Set(achados.map(a => a.linha));
  for (const m of codigo.matchAll(/(['"`])(#[0-9a-fA-F]{3,8})\1/g)) {
    const linha = linhaDe(codigo, m.index);
    if (!jaVistas.has(linha)) achados.push({ linha, detalhe: `cor literal ${m[2]}` });
  }
  return achados;
}

function verificar(arquivo, fonte) {
  if (arquivo.endsWith('.js')) return achadosNoJs(fonte);
  if (arquivo.endsWith('.css')) return achadosNoCss(semComentariosCss(fonte), { inicio: 0 }, fonte);
  const achados = [];
  const html = semComentariosHtml(fonte);
  for (const m of html.matchAll(/(<style[^>]*>)([\s\S]*?)<\/style>/g)) {
    achados.push(...achadosNoCss(m[2], { inicio: m.index + m[1].length }, fonte));
  }
  for (const m of html.matchAll(/\sstyle\s*=\s*(["'])([^"']*)\1/g)) {
    const inicio = m.index + m[0].indexOf(m[2]);
    achados.push(...achadosNoCss(m[2], { inicio, atributo: true }, fonte));
  }
  return achados;
}

module.exports = { id, conserto, seAplica, verificar };

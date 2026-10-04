'use strict';

// Cor, tamanho de letra, raio e duração só como token da Veio (CODING_STANDARDS.md
// regra 2). A revisão pediu "token, não px solto" em 0510e37, d2ab0da, b1a3664,
// 8d13cc7 e 1378e3f; esta regra acusa o literal antes da revisão.

const { ehJsDaExtensao, linhaDe, semComentariosCss, semComentariosJs } = require('./comum');

const id = 'tokens-veio';

const conserto = 'Use um token `var(--veio-…)` de veio/tokens.css (cores: --veio-bg, --veio-text, --veio-accent…; '
  + 'letra: --veio-tam-*; raio: --veio-raio-*; tempo: --veio-transicao, --veio-destaque…). '
  + 'Um valor que ainda não existe vira token novo em veio/tokens.css, registrado no veio/README.md. '
  + 'As únicas exceções são as de veio/README.md § Como usar (CODING_STANDARDS.md regra 2).';

// As páginas do repositório que usam a Veio: as da extensão, a vitrine e as
// imagens da loja. As páginas falsas de e2e/pages imitam sites de terceiros e
// os protótipos de docs/ têm o seu próprio CSS: ficam de fora.
function seAplica(arquivo) {
  if (arquivo === 'veio/tokens.css') return false;
  if (/^[^/]+\.(css|html)$/.test(arquivo) || /^veio\/.+\.css$/.test(arquivo)) return true;
  if (arquivo === 'e2e/vitrine/vitrine.html' || /^e2e\/pages\/loja-[^/]+\.html$/.test(arquivo)) return true;
  return ehJsDaExtensao(arquivo);
}

const COR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(|\b(?:white|black)\b/;
const PROPRIEDADE_DE_COR = /^(?:color|background(?:-color|-image)?|border(?:-(?:top|right|bottom|left|block|inline))?(?:-color)?|outline(?:-color)?|fill|stroke|box-shadow|text-shadow|caret-color|accent-color|text-decoration(?:-color)?|column-rule(?:-color)?)$/;
const PROPRIEDADE_DE_RAIO = /^border(?:-(?:top|bottom|start|end)-(?:left|right|start|end))?-radius$/;
const PROPRIEDADE_DE_TEMPO = /^(?:transition|animation)(?:-duration|-delay)?$/;

// O valor sem o que está dentro de var(): o reserva de `var(--x, 12px)` é do token.
function semVar(valor) {
  let saida = valor;
  for (let antes = ''; antes !== saida;) {
    antes = saida;
    saida = saida.replace(/var\([^()]*\)/g, 'var()');
  }
  return saida;
}

/** O que há de errado com `propriedade: valor`, ou null. */
function literal(propriedade, valorBruto) {
  const p = propriedade.trim().toLowerCase();
  if (p.startsWith('--')) return null;
  const valor = semVar(valorBruto).replace(/url\([^)]*\)/g, 'url()');
  if (PROPRIEDADE_DE_COR.test(p) && COR.test(valor)) return `cor literal em \`${p}\``;
  if (p === 'font-size' && /(?:^|[\s(])\d*\.?\d+(?:px|rem|pt)\b/.test(valor)) return 'tamanho de letra literal';
  if (p === 'font' && /(?:^|\s)\d*\.?\d+(?:px|rem|pt)\b/.test(valor)) return 'tamanho de letra literal em `font`';
  if (PROPRIEDADE_DE_RAIO.test(p) && /(?:^|\s)(?:0*[1-9]\d*|\d*\.\d+)(?:px|rem|em)\b/.test(valor)) return 'raio literal';
  if (PROPRIEDADE_DE_TEMPO.test(p) && /(?:^|[\s,(])(?:0*[1-9]\d*(?:\.\d+)?|0?\.\d*[1-9]\d*)m?s\b/.test(valor)) return 'duração literal';
  return null;
}

// As declarações de um trecho de CSS. Só o miolo dos blocos (ou de um style="")
// tem declarações: fora deles, `a:hover` também pareceria uma.
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

// Os mesmos literais escritos pelo JavaScript: objetos de estilo
// (`fontSize: '13px'`), `elemento.style.color = '#fff'` e cores soltas.
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
  const html = fonte.replace(/<!--[\s\S]*?-->/g, t => t.replace(/[^\n]/g, ' '));
  for (const m of html.matchAll(/(<style[^>]*>)([\s\S]*?)<\/style>/g)) {
    const inicio = m.index + m[1].length;
    achados.push(...achadosNoCss(semComentariosCss(m[2]), { inicio }, fonte));
  }
  for (const m of html.matchAll(/\sstyle\s*=\s*(["'])([^"']*)\1/g)) {
    const inicio = m.index + m[0].indexOf(m[2]);
    achados.push(...achadosNoCss(m[2], { inicio, atributo: true }, fonte));
  }
  return achados;
}

module.exports = { id, conserto, seAplica, verificar };

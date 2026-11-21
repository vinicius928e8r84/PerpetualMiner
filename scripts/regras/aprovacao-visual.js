'use strict';

const fs = require('fs');
const path = require('path');

const id = 'aprovacao-visual';

const LIVRO = 'e2e/aprovados-visuais.json';

const conserto = `Depois que o dono aprovar a tela, acrescente a entrada em ${LIVRO} (\`"<spec>": { "<nome>.png": { "data": `
  + '"AAAA-MM-DD", "resposta": "onde ele respondeu" } }`), na mesma PR do PNG; uma referência que ainda espera o '
  + 'olhar dele fica num `test.fixme` até ser aprovada.';

const seAplica = arquivo => /^e2e\/tests\/[^/]+-visual\.spec\.js$/.test(arquivo);

function nomesEmFixme(fonte) {
  const nomes = new Set();
  for (const trecho of fonte.split(/^(?=test(?:\.[a-z]+)?\()/m)) {
    if (!/\btest\.fixme\(/.test(trecho)) continue;
    for (const m of trecho.matchAll(/['"`]([\w.-]+\.png)['"`]/g)) nomes.add(m[1]);
  }
  return nomes;
}

function lerLivro(raiz) {
  const caminho = path.join(raiz, LIVRO);
  if (!fs.existsSync(caminho)) return { telas: {} };
  try {
    return JSON.parse(fs.readFileSync(caminho, 'utf8'));
  } catch (erro) {
    throw new Error(`${LIVRO} não é um JSON válido (${erro.message})`);
  }
}

const aprovadosDaSpec = (livro, spec) => (livro.telas || {})[spec] || {};

const entradaValida = e => e && /^\d{4}-\d{2}-\d{2}$/.test(e.data || '') && typeof e.resposta === 'string' && e.resposta.trim() !== '';

const detalheDaReferencia = (nome, entrada) => (entrada
  ? `${nome} tem entrada em ${LIVRO} sem data (AAAA-MM-DD) ou sem a resposta do dono`
  : `a referência ${nome} não tem entrada em ${LIVRO} (aprovação do dono)`);

function verificar(arquivo, fonte, raiz) {
  const pasta = path.join(raiz, `${arquivo}-snapshots`);
  if (!fs.existsSync(pasta)) return [];
  const spec = path.posix.basename(arquivo, '.spec.js');
  const aprovados = aprovadosDaSpec(lerLivro(raiz), spec);
  const emFixme = nomesEmFixme(fonte);
  const achados = [];
  for (const png of fs.readdirSync(pasta).filter(f => f.endsWith('.png')).sort()) {
    const nome = png.replace(/-(?:linux|darwin|win32)\.png$/, '.png');
    if (emFixme.has(nome)) continue;
    if (!entradaValida(aprovados[nome])) achados.push({ linha: 1, detalhe: detalheDaReferencia(nome, aprovados[nome]) });
  }
  return achados;
}

module.exports = { id, conserto, seAplica, verificar };

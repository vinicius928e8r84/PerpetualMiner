'use strict';

const fs = require('fs');
const path = require('path');

const id = 'aprovacao-visual';

const LIVRO = 'e2e/aprovados-visuais';

const conserto = `Depois que o dono aprovar a tela, acrescente a entrada em ${LIVRO}/<spec>.json (\`"<nome>.png": { "data": `
  + '"AAAA-MM-DD", "resposta": "onde ele respondeu" }`), na mesma PR do PNG; uma referência que ainda espera o '
  + 'olhar dele fica num `test.fixme` até ser aprovada.';

const seAplica = arquivo => /^e2e\/tests\/[^/]+-visual\.spec\.js$/.test(arquivo);

function nomesEmFixme(fonte) {
  const nomes = new Set();
  for (const trecho of fonte.split(/^(?=test(?:\.[a-z]+)?\()/m)) {
    if (!/^test\.fixme\(/.test(trecho) && !/\btest\.fixme\(/.test(trecho)) continue;
    for (const m of trecho.matchAll(/['"`]([\w.-]+\.png)['"`]/g)) nomes.add(m[1]);
  }
  return nomes;
}

function lerEntradas(raiz, spec) {
  const arquivo = `${LIVRO}/${spec}.json`;
  const caminho = path.join(raiz, arquivo);
  if (!fs.existsSync(caminho)) return {};
  try {
    return JSON.parse(fs.readFileSync(caminho, 'utf8'));
  } catch (erro) {
    throw new Error(`${arquivo} não é um JSON válido (${erro.message})`);
  }
}

const entradaValida = e => e && /^\d{4}-\d{2}-\d{2}$/.test(e.data || '') && typeof e.resposta === 'string' && e.resposta.trim() !== '';

function verificar(arquivo, fonte, raiz) {
  const pasta = path.join(raiz, `${arquivo}-snapshots`);
  if (!fs.existsSync(pasta)) return [];
  const spec = path.posix.basename(arquivo, '.spec.js');
  const aprovados = lerEntradas(raiz, spec);
  const emFixme = nomesEmFixme(fonte);
  const achados = [];
  for (const png of fs.readdirSync(pasta).filter(f => f.endsWith('.png')).sort()) {
    const nome = png.replace(/-(?:linux|darwin|win32)\.png$/, '.png');
    if (emFixme.has(nome)) continue;
    if (!entradaValida(aprovados[nome])) {
      achados.push({
        linha: 1,
        detalhe: aprovados[nome]
          ? `${nome} tem entrada em ${LIVRO}/${spec}.json sem data (AAAA-MM-DD) ou sem a resposta do dono`
          : `a referência ${nome} não tem entrada em ${LIVRO}/${spec}.json (aprovação do dono)`,
      });
    }
  }
  return achados;
}

module.exports = { id, conserto, seAplica, verificar };

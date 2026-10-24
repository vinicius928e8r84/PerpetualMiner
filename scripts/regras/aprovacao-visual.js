'use strict';

// Uma referência visual (o PNG de e2e/tests/*-visual.spec.js-snapshots/) só entra depois que o dono aprova
// o visual (CODING_STANDARDS.md, regra 10). A aprovação continua humana; esta regra faz o
// `--update-snapshots` sem aprovação aparecer no diff: cada PNG precisa de uma entrada em
// e2e/aprovados-visuais.json (a tela, a data e onde o dono respondeu), a menos que o teste dele esteja
// em `test.fixme` (a proposta que espera o olhar do dono). Os PNG que já existiam quando o livro nasceu
// estão na linha de base da regra e não pedem entrada.

const fs = require('fs');
const path = require('path');

const id = 'aprovacao-visual';

const LIVRO = 'e2e/aprovados-visuais.json';

const conserto = `Depois que o dono aprovar a tela, acrescente a entrada em ${LIVRO} (\`"<spec>": { "<nome>.png": { "data": `
  + '"AAAA-MM-DD", "resposta": "onde ele respondeu" } }`), na mesma PR do PNG; uma referência que ainda espera o '
  + 'olhar dele fica num `test.fixme` até ser aprovada.';

const seAplica = arquivo => /^e2e\/tests\/[^/]+-visual\.spec\.js$/.test(arquivo);

/** Os nomes de PNG citados dentro de testes `test.fixme`, que esperam a aprovação. */
function nomesEmFixme(fonte) {
  const nomes = new Set();
  for (const trecho of fonte.split(/^(?=test(?:\.[a-z]+)?\()/m)) {
    if (!/^test\.fixme\(/.test(trecho) && !/\btest\.fixme\(/.test(trecho)) continue;
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

const entradaValida = e => e && /^\d{4}-\d{2}-\d{2}$/.test(e.data || '') && typeof e.resposta === 'string' && e.resposta.trim() !== '';

function verificar(arquivo, fonte, raiz) {
  const pasta = path.join(raiz, `${arquivo}-snapshots`);
  if (!fs.existsSync(pasta)) return [];
  const spec = path.posix.basename(arquivo, '.spec.js');
  const aprovados = (lerLivro(raiz).telas || {})[spec] || {};
  const emFixme = nomesEmFixme(fonte);
  const achados = [];
  for (const png of fs.readdirSync(pasta).filter(f => f.endsWith('.png')).sort()) {
    const nome = png.replace(/-(?:linux|darwin|win32)\.png$/, '.png');
    if (emFixme.has(nome)) continue;
    if (!entradaValida(aprovados[nome])) {
      achados.push({
        linha: 1,
        detalhe: aprovados[nome]
          ? `${nome} tem entrada em ${LIVRO} sem data (AAAA-MM-DD) ou sem a resposta do dono`
          : `a referência ${nome} não tem entrada em ${LIVRO} (aprovação do dono)`,
      });
    }
  }
  return achados;
}

module.exports = { id, conserto, seAplica, verificar };

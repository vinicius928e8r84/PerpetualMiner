'use strict';

// Um link relativo de Markdown para um arquivo que não existe, ou para um título (#âncora) que o arquivo
// de destino não tem, deixa o leitor num beco: o texto aponta para um lugar que sumiu ou foi renomeado
// (os 4 links de docs/arquitetura.md na revisão do #446; o `#movimento` de
// docs/design/identidade-veio/README.md, cujo título é "Movimento (da C)"). Esta regra confere, em todo
// arquivo .md do repositório, os links `[texto](alvo)`, as imagens, as definições `[id]: alvo` e os
// `href`/`src` em HTML: o arquivo precisa existir (relativo à pasta do .md, ou à raiz se o alvo começa com `/`) e,
// quando o alvo é um .md com `#âncora`, a âncora precisa ser o título de lá (a regra de nome do GitHub) ou um
// `id`/`name` escrito no texto. Não olha links com esquema (https:, mailto:), nem código (cercado ou entre crases),
// nem `#L12` (linha de arquivo). Não há exceção na linha: o verificar.js só lê exceções em comentários de js,
// mjs, css, html e py, não em Markdown; um link que precisa ficar entra na linha de base.

const fs = require('fs');
const path = require('path');

const id = 'link-de-doc';

const conserto = 'Aponte o link para o arquivo ou o título que existe hoje (o arquivo, e o título na forma do GitHub: '
  + 'minúsculas, espaços viram `-`, sem pontuação; a mensagem sugere os títulos parecidos), ou tire o link.';

const seAplica = arquivo => arquivo.endsWith('.md');

// Uma linha em branco no lugar do código: as linhas e as colunas ficam as do arquivo.
const branco = texto => texto.replace(/[^\n]/g, ' ');

/** O Markdown sem o código cercado (``` ou ~~~) e sem os trechos entre crases, com as mesmas linhas. */
function semCodigo(fonte) {
  let cerca = null;
  return fonte.split('\n').map(linha => {
    const abre = /^ {0,3}(`{3,}|~{3,})/.exec(linha);
    if (cerca) {
      if (abre && abre[1][0] === cerca[0] && abre[1].length >= cerca.length && /^ {0,3}[`~]+\s*$/.test(linha)) cerca = null;
      return branco(linha);
    }
    if (abre) {
      cerca = abre[1];
      return branco(linha);
    }
    return linha.replace(/(`+)(?!`)[\s\S]*?[^`]\1(?!`)/g, trecho => branco(trecho));
  }).join('\n');
}

const sinalDeEsquema = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

// Os alvos: `](alvo)` (com `<...>`, parênteses dentro e título depois), `[id]: alvo` e href/src de HTML.
const EM_LINHA = /\]\(\s*(<[^>\n]*>|[^\s()]*(?:\([^\s()]*\)[^\s()]*)*)/g;
const DEFINICAO = /^ {0,3}\[[^\]\n]+\]:\s*(<[^>\n]*>|\S+)/;
const EM_HTML = /<(?:a|img)\b[^>]*?\b(?:href|src)=(?:"([^"]*)"|'([^']*)')/gi;

/** Os links de uma linha: { alvo, texto } (texto é o que a mensagem mostra). */
function linksDaLinha(linha) {
  const achados = [];
  const limpar = bruto => bruto.replace(/^<|>$/g, '');
  const definicao = DEFINICAO.exec(linha);
  if (definicao) achados.push({ alvo: limpar(definicao[1]), texto: linha.trim() });
  for (const m of linha.matchAll(EM_LINHA)) {
    const inicio = linha.lastIndexOf('[', m.index);
    achados.push({ alvo: limpar(m[1]), texto: linha.slice(inicio < 0 ? m.index : inicio, m.index + m[0].length) + ')' });
  }
  for (const m of linha.matchAll(EM_HTML)) achados.push({ alvo: m[1] ?? m[2], texto: m[0] });
  return achados.filter(a => a.alvo);
}

/** A âncora que o GitHub dá a um título: minúsculas, sem pontuação, espaços viram `-`. */
function ancoraDoTitulo(titulo) {
  return titulo
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[`*~]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

/** As âncoras de um .md: os títulos (com -1, -2 nos repetidos) e os `id=`/`name=` do texto. */
function ancorasDe(fonte) {
  const limpo = semCodigo(fonte);
  const linhas = limpo.split('\n');
  const titulos = [];
  linhas.forEach((linha, i) => {
    const atx = /^ {0,3}#{1,6}[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/.exec(linha);
    if (atx) titulos.push(atx[1]);
    else if (i > 0 && /^ {0,3}(?:=+|-+)[ \t]*$/.test(linha) && /\S/.test(linhas[i - 1]) && !/^ {0,3}(?:#|>|[-*+] |\d+[.)] |\||$)/.test(linhas[i - 1])) {
      titulos.push(linhas[i - 1].trim());
    }
  });
  const vistos = new Map();
  const ancoras = [];
  for (const titulo of titulos) {
    const base = ancoraDoTitulo(titulo);
    const n = vistos.get(base) || 0;
    vistos.set(base, n + 1);
    ancoras.push({ ancora: n ? `${base}-${n}` : base, titulo });
  }
  const explicitas = [...limpo.matchAll(/<[a-z][^>]*?\b(?:id|name)=(?:"([^"]+)"|'([^']+)')/gi)].map(m => (m[1] ?? m[2]).toLowerCase());
  return { ancoras, explicitas };
}

/** Os títulos que um leitor provavelmente quis dizer com `pedida`: a âncora começa igual ou contém a outra. */
function parecidas(pedida, ancoras) {
  return ancoras.filter(a => a.ancora && (a.ancora.startsWith(pedida) || pedida.startsWith(a.ancora) || a.ancora.includes(pedida)))
    .slice(0, 3).map(a => `#${a.ancora}`);
}

function decodificar(texto) {
  try {
    return decodeURIComponent(texto);
  } catch {
    return texto;
  }
}

function verificar(arquivo, fonte, raiz) {
  const achados = [];
  const doDestino = new Map();
  const ancorasDoArquivo = caminho => {
    if (!doDestino.has(caminho)) doDestino.set(caminho, ancorasDe(caminho === arquivo ? fonte : fs.readFileSync(path.join(raiz, caminho), 'utf8')));
    return doDestino.get(caminho);
  };
  semCodigo(fonte).split('\n').forEach((linha, i) => {
    for (const { alvo, texto } of linksDaLinha(linha)) {
      if (sinalDeEsquema.test(alvo)) continue;
      const jogo = /^([^#?]*)(?:\?[^#]*)?(?:#(.*))?$/.exec(alvo);
      const caminhoBruto = decodificar(jogo[1]);
      const ancora = jogo[2] === undefined ? null : decodificar(jogo[2]).toLowerCase();
      let destino = arquivo;
      if (caminhoBruto) {
        destino = caminhoBruto.startsWith('/')
          ? path.posix.normalize(caminhoBruto.slice(1))
          : path.posix.normalize(path.posix.join(path.posix.dirname(arquivo), caminhoBruto));
        if (destino.startsWith('..') || !fs.existsSync(path.join(raiz, destino))) {
          const fora = destino.startsWith('..');
          const pasta = path.posix.dirname(arquivo);
          achados.push({ linha: i + 1, detalhe: `o link ${texto} (relativo a \`${pasta === '.' ? './' : `${pasta}/`}\`) aponta para `
            + `\`${fora ? caminhoBruto : destino}\`, ${fora ? 'que está fora do repositório' : 'que não existe'}; conserte o link em ${arquivo}` });
          continue;
        }
      }
      if (!ancora || /^l\d+(?:-l\d+)?$/.test(ancora) || !destino.endsWith('.md')
        || (destino !== arquivo && !fs.statSync(path.join(raiz, destino)).isFile())) continue;
      const { ancoras, explicitas } = ancorasDoArquivo(destino);
      if (ancoras.some(a => a.ancora === ancora) || explicitas.includes(ancora)) continue;
      const sugestao = parecidas(ancora, ancoras);
      achados.push({ linha: i + 1, detalhe: `o link ${texto} aponta para a âncora \`#${ancora}\`, que ${destino === arquivo ? 'este arquivo' : `\`${destino}\``} não tem`
        + `${sugestao.length ? ` (títulos parecidos: ${sugestao.join(', ')})` : ''}; conserte o link em ${arquivo}` });
    }
  });
  return achados;
}

module.exports = { id, conserto, seAplica, verificar };

'use strict';

// Um teste e2e que age na tela confere também o que ficou guardado (CODING_STANDARDS.md regra 8). Sem isso o
// teste passa olhando só o interruptor, a foto ou o texto, e uma gravação que falha não é vista. A revisão
// cobrou isso no #190 (o cenário da coleção terminava nas fotos, sem conferir pm_anki_baralhos nem
// pm_anki_vocabulario) e no #189 (os testes do item de login conferiam o interruptor, não o item que a
// Conexão tem). Esta regra acusa o teste que age (clique, texto, tecla…) e, depois da ÚLTIMA ação, não lê o
// que ficou guardado e compara o valor lido: a leitura vem de `extensao.lerStorage`, `extensao.frases()`, de um
// leitor que o fake declara com `@estado-guardado` (e2e/fakes/) ou das conferências de e2e/estado-final.js. Uma
// leitura cujo resultado nenhum `expect` usa não conta, nem o pedido que chegou ao fake (`requisicoes`, `chamadas`):
// isso é transporte, não o que ficou guardado.

const fs = require('fs');
const path = require('path');
const { comentariosPorLinha, fechamento, linhaDe, semComentariosJs } = require('./comum');

const id = 'e2e-estado-final';

const conserto = 'Depois de agir, confira o que ficou guardado, com um valor concreto: '
  + '`await estadoFinal(extensao, { pm_anki_baralhos: { nomes: … } })` (e2e/estado-final.js), '
  + '`expect(await extensao.frases()).toHaveLength(…)` ou o que o fake guardou, por um leitor marcado `@estado-guardado` em e2e/fakes/ '
  + '(`expect(fakes.anki.enviosEm(\'en\')).toHaveLength(1)`; um leitor novo do fake leva a marca no comentário dele). '
  + 'Uma foto, um texto na tela, os pedidos que chegaram ao fake (`requisicoes`) ou uma leitura que nenhum `expect` usa não bastam, '
  + 'e a conferência vem depois da última ação. '
  + 'Um teste que não guarda nada (um filtro, uma aba, um modal) diz isso no comentário logo acima: '
  + '`// Exceção de teste: sem-estado-guardado — <motivo>` (CODING_STANDARDS.md regra 8).';

// Os specs de referência visual olham a aparência, não a gravação (a regra 10 os guarda).
const seAplica = arquivo => /^e2e\/tests\/.+\.spec\.js$/.test(arquivo) && !/-visual\.spec\.js$/.test(arquivo);

const MARCA = /Exceção de teste:\s*sem-estado-guardado\b/;
const ACAO = /\.(?:click|dblclick|fill|press|pressSequentially|check|uncheck|selectOption|setInputFiles|type|tap|dragTo)\s*\(/g;
// De onde o teste lê o que ficou guardado: o storage da extensão e as conferências do helper. O que o fake guardou
// entra pelos leitores que ele marca com `@estado-guardado` (`leitoresDosFakes`).
const LEITURA_FIXA = /\b(?:lerStorage|estadoFinal\w*)\s*\(|\.frases\s*\(|\bchrome\.storage\.local\.get\b/g;
const CONFERENCIA = /\bexpect(?:\.poll)?\s*\(/g;
const ASSERCAO_PROPRIA = /\bestadoFinal\w*\s*\(/g;

const leitoresPorRaiz = new Map();
/** Os nomes dos leitores que os fakes (e2e/fakes/) marcam com `@estado-guardado` no comentário. */
function leitoresDosFakes(raiz) {
  if (!leitoresPorRaiz.has(raiz)) {
    const nomes = new Set();
    const pasta = path.join(raiz, 'e2e', 'fakes');
    for (const nome of fs.existsSync(pasta) ? fs.readdirSync(pasta).filter(n => n.endsWith('.js')) : []) {
      const fonte = fs.readFileSync(path.join(pasta, nome), 'utf8');
      for (const m of fonte.matchAll(/@estado-guardado[\s\S]*?\*\/\s*(?:async\s+)?([A-Za-z_$][\w$]*)/g)) nomes.add(m[1]);
    }
    leitoresPorRaiz.set(raiz, nomes);
  }
  return leitoresPorRaiz.get(raiz);
}

/** O fim do corpo que começa em `de`: o bloco `{ … }`, ou (corpo de uma expressão) o fim da linha fora de parênteses. */
function fimDoCorpo(codigo, de) {
  const comeco = codigo.slice(de).search(/\S/);
  if (comeco < 0) return codigo.length;
  const primeiro = de + comeco;
  if (codigo[primeiro] === '{') {
    const fim = fechamento(codigo, primeiro);
    return fim < 0 ? codigo.length : fim + 1;
  }
  let fundura = 0;
  for (let i = primeiro; i < codigo.length; i++) {
    if ('([{'.includes(codigo[i])) fundura++;
    else if (')]}'.includes(codigo[i])) fundura--;
    else if ((codigo[i] === '\n' || codigo[i] === ';') && fundura <= 0) return i;
  }
  return codigo.length;
}

/** As funções do arquivo ({ nome, corpo }), de qualquer nível: `function` e `const x = (…) =>`. */
function funcoes(codigo) {
  const lista = [];
  for (const m of codigo.matchAll(/(?:^|\n)\s*(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/g)) {
    const abre = m.index + m[0].length - 1;
    const parametros = fechamento(codigo, abre);
    if (parametros < 0) continue;
    const chave = codigo.indexOf('{', parametros);
    if (chave >= 0) lista.push({ nome: m[1], corpo: codigo.slice(chave, fimDoCorpo(codigo, chave)) });
  }
  for (const m of codigo.matchAll(/(?:^|\n)\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g)) {
    lista.push({ nome: m[1], corpo: codigo.slice(m.index + m[0].length, fimDoCorpo(codigo, m.index + m[0].length)) });
  }
  return lista;
}

// Os nomes das funções do arquivo que, direta ou indiretamente, fazem o que `padrao` acha.
function quemFaz(defs, padrao) {
  const nomes = new Set();
  const acha = corpo => new RegExp(padrao.source, padrao.flags.replace('g', '')).test(corpo);
  for (let mudou = true; mudou;) {
    mudou = false;
    for (const def of defs) {
      if (nomes.has(def.nome)) continue;
      if (acha(def.corpo) || [...nomes].some(nome => new RegExp(`\\b${nome}\\s*\\(`).test(def.corpo))) { nomes.add(def.nome); mudou = true; }
    }
  }
  return nomes;
}

const posicoes = (texto, padrao, nomes = new Set()) => {
  const achados = [...texto.matchAll(new RegExp(padrao.source, 'g'))].map(m => m.index);
  for (const nome of nomes) for (const m of texto.matchAll(new RegExp(`\\b${nome}\\s*\\(`, 'g'))) achados.push(m.index);
  return achados.sort((a, b) => a - b);
};

const identificadores = texto => texto.match(/[A-Za-z_$][\w$]*/g) || [];

/**
 * A leitura que começa em `p` chega a uma conferência: está dentro de um `expect(…)`, é uma conferência do helper, ou
 * o valor lido vai para uma variável (`const x = await …`) que um `expect` depois usa, direta ou por outra variável.
 * Uma leitura que ninguém compara não conta.
 */
function leituraConferida(corpo, p, conferencias) {
  if (/^estadoFinal\w*\s*\(/.test(corpo.slice(p))) return true;
  if (conferencias.some(c => c.de < p && p < c.fim)) return true;
  // O começo da instrução: sobe enquanto a linha de cima não termina uma instrução ou um bloco.
  const linhas = corpo.slice(0, p).split('\n');
  let de = linhas.length - 1;
  while (de > 0 && !/[;{}]\s*$/.test(linhas[de - 1].trim() === '' ? ';' : linhas[de - 1])) de--;
  const instrucao = linhas.slice(de).join('\n');
  const m = /(?:\b(?:const|let|var)\s+)?(\{[^}]*\}|\[[^\]]*\]|[A-Za-z_$][\w$]*)\s*=(?!=)[^;]*$/.exec(instrucao);
  if (!m) return false;
  const nomes = new Set(identificadores(m[1]));
  // O que vem depois: uma variável feita a partir de uma já seguida também é seguida.
  const resto = corpo.slice(p);
  for (const parte of resto.split(';')) {
    const derivada = /(?:\b(?:const|let|var)\s+)?([A-Za-z_$][\w$]*)\s*=(?!=)([^]*)$/.exec(parte);
    if (derivada && identificadores(derivada[2]).some(nome => nomes.has(nome))) nomes.add(derivada[1]);
  }
  return conferencias.some(c => c.de > p && identificadores(corpo.slice(c.de, c.fim)).some(nome => nomes.has(nome)));
}

// A exceção vale no próprio teste ou nas linhas de comentário logo acima da instrução que o abre.
function anotado(comentarios, linhas, primeira, ultima) {
  for (let linha = primeira; linha <= ultima; linha++) if (MARCA.test(comentarios.get(linha) || '')) return true;
  for (let linha = primeira - 1, vistas = 0; linha >= 1 && vistas < 12; linha--, vistas++) {
    if (MARCA.test(comentarios.get(linha) || '')) return true;
    const instrucao = (linhas[linha - 1] || '').trim();
    if (instrucao !== '' && /[;{}]$/.test(instrucao)) break;
  }
  return false;
}

function verificar(arquivo, fonte, raiz = process.cwd()) {
  const codigo = semComentariosJs(fonte);
  const linhas = codigo.split('\n');
  const comentarios = comentariosPorLinha(arquivo, fonte);
  const doFake = [...leitoresDosFakes(raiz)];
  const LEITURA = new RegExp(doFake.length ? `${LEITURA_FIXA.source}|\\.(?:${doFake.join('|')})\\b` : LEITURA_FIXA.source, 'g');
  const defs = funcoes(codigo);
  const quemAge = quemFaz(defs, ACAO);
  const quemLe = quemFaz(defs, LEITURA);
  const achados = [];
  for (const m of codigo.matchAll(/\btest(?:\.only)?\s*\(\s*(['"`])/g)) {
    const abre = codigo.indexOf('(', m.index);
    const fecha = fechamento(codigo, abre);
    if (fecha < 0) continue;
    const corpo = codigo.slice(abre + 1, fecha);
    const acoes = posicoes(corpo, ACAO, quemAge);
    if (acoes.length === 0) continue;
    const conferencias = posicoes(corpo, CONFERENCIA).map(de => ({ de, fim: fechamento(corpo, corpo.indexOf('(', de)) }));
    const leituras = posicoes(corpo, LEITURA, quemLe).filter(p => p > acoes[acoes.length - 1]);
    if (leituras.some(p => leituraConferida(corpo, p, conferencias))) continue;
    const primeira = linhaDe(codigo, m.index);
    if (anotado(comentarios, linhas, primeira, linhaDe(codigo, fecha))) continue;
    const titulo = /^\s*(['"`])((?:(?!\1).)*)\1/.exec(codigo.slice(abre + 1, abre + 200).replace(/^\s+/, ''));
    achados.push({
      linha: primeira,
      detalhe: `o teste age (${acoes.length} ação(ões)) e depois da última não lê e compara o que ficou guardado${titulo ? `: “${titulo[2].slice(0, 70)}”` : ''}`,
    });
  }
  return achados;
}

module.exports = { id, conserto, seAplica, verificar };

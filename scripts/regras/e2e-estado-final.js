'use strict';

// Um teste e2e que age na tela confere também o que ficou guardado (CODING_STANDARDS.md regra 8). Sem isso o
// teste passa olhando só o interruptor, a foto ou o texto, e uma gravação que falha não é vista. A revisão
// cobrou isso no #190 (o cenário da coleção terminava nas fotos, sem conferir pm_anki_baralhos nem
// pm_anki_vocabulario) e no #189 (os testes do item de login conferiam o interruptor, não o item que a
// Conexão tem). Esta regra acusa o teste que age (clique, texto, tecla…) e, depois da primeira ação, não lê o
// que ficou guardado nem compara com um valor: a leitura vem de `extensao.lerStorage`, `extensao.frases()`, do
// que o fake guardou (`itemDeLogin`, `requisicoes`, `envios`…), ou das conferências de e2e/estado-final.js.

const fs = require('fs');
const path = require('path');
const { comentariosPorLinha, fechamento, linhaDe, semComentariosJs } = require('./comum');

const id = 'e2e-estado-final';

const conserto = 'Depois de agir, confira o que ficou guardado, com um valor concreto: '
  + '`await estadoFinal(extensao, { pm_anki_baralhos: { nomes: … } })` (e2e/estado-final.js), '
  + '`expect(await extensao.frases()).toHaveLength(…)` ou o que o fake guardou (`expect(fakes.anki.itemDeLogin()).toBe(\'ligado\')`). '
  + 'Uma foto, um texto na tela ou uma leitura sem comparar não bastam. '
  + 'Um teste que não guarda nada (um filtro, uma aba, um modal) diz isso no comentário logo acima: '
  + '`// Exceção de teste: sem-estado-guardado — <motivo>` (CODING_STANDARDS.md regra 8).';

// Os specs de referência visual olham a aparência, não a gravação (a regra 10 os guarda).
const seAplica = arquivo => /^e2e\/tests\/.+\.spec\.js$/.test(arquivo) && !/-visual\.spec\.js$/.test(arquivo);

const MARCA = /Exceção de teste:\s*sem-estado-guardado\b/;
const ACAO = /\.(?:click|dblclick|fill|press|pressSequentially|check|uncheck|selectOption|setInputFiles|type|tap|dragTo)\s*\(/g;
// De onde o teste lê o que ficou guardado: o storage da extensão, o que o fake guardou e as conferências do helper.
const LEITURA = /\b(?:lerStorage|estadoFinal\w*|itemDeLogin|itemInstalado)\s*\(|\.frases\s*\(|\bchrome\.storage\.local\.get\b|\bfakes\.(?:anki|google|gemini)\.(?:requisicoes|envios|enviosEm|chamadas|frasesDe|apagadasDe)\b/g;
const CONFERENCIA = /\bexpect(?:\.poll)?\s*\(|\bestadoFinal\w*\s*\(/g;

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

function verificar(arquivo, fonte) {
  const codigo = semComentariosJs(fonte);
  const linhas = codigo.split('\n');
  const comentarios = comentariosPorLinha(arquivo, fonte);
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
    const leituras = posicoes(corpo, LEITURA, quemLe).filter(p => p > acoes[0]);
    // Uma conferência que termina depois do começo da leitura: o `expect` que a envolve ou um que vem depois.
    const conferencias = posicoes(corpo, CONFERENCIA).map(p => fechamento(corpo, corpo.indexOf('(', p)));
    const conferido = leituras.length > 0 && conferencias.some(fim => fim > leituras[0]);
    if (conferido) continue;
    const primeira = linhaDe(codigo, m.index);
    if (anotado(comentarios, linhas, primeira, linhaDe(codigo, fecha))) continue;
    const titulo = /^\s*(['"`])((?:(?!\1).)*)\1/.exec(codigo.slice(abre + 1, abre + 200).replace(/^\s+/, ''));
    achados.push({
      linha: primeira,
      detalhe: `o teste age (${acoes.length} ação(ões)) e depois não confere o que ficou guardado${titulo ? `: “${titulo[2].slice(0, 70)}”` : ''}`,
    });
  }
  return achados;
}

module.exports = { id, conserto, seAplica, verificar };

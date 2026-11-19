'use strict';

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
  + '`// Exceção de teste: sem-estado-guardado — <motivo>` (docs/CODING_STANDARDS.md regra 8).';

const seAplica = arquivo => /^e2e\/tests\/.+\.spec\.js$/.test(arquivo) && !/-visual\.spec\.js$/.test(arquivo);

const MARCA = /Exceção de teste:\s*sem-estado-guardado\b/;
const ACAO = /\.(?:click|dblclick|fill|press|pressSequentially|check|uncheck|selectOption|setInputFiles|type|tap|dragTo)\s*\(/g;
const LEITURA_FIXA = /\b(?:lerStorage|estadoFinal\w*)\s*\(|\.frases\s*\(|\bchrome\.storage\.local\.get\b/g;

const leitoresPorRaiz = new Map();
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

const MATCHER = /^\s*\.\s*(?:(?:not|resolves)\s*\.\s*)*to[A-Z]\w*\s*\(/;

function conferenciasDe(corpo) {
  const lista = [];
  for (const m of corpo.matchAll(/\bexpect(\.poll)?\s*\(/g)) {
    const abre = m.index + m[0].length - 1;
    const fim = fechamento(corpo, abre);
    if (fim >= 0 && MATCHER.test(corpo.slice(fim + 1))) lista.push({ de: m.index, fim, poll: Boolean(m[1]) });
  }
  return lista;
}

function inicioDaInstrucao(corpo, p) {
  let fundura = 0;
  for (let i = p - 1; i >= 0; i--) {
    const c = corpo[i];
    if (')]}'.includes(c)) fundura++;
    else if ('([{'.includes(c)) {
      if (fundura > 0) { fundura--; continue; }
      if (c === '{' && /(?:\)|=>|\belse|\btry|\bdo)\s*$/.test(corpo.slice(Math.max(0, i - 8), i))) return i + 1;
    } else if (c === ';' && fundura === 0) return i + 1;
  }
  return 0;
}

const ATRIBUICAO = /^\s*(?:(const|let|var)\s+)?(\{[^}]*\}|\[[^\]]*\]|[A-Za-z_$][\w$]*)\s*=(?!=)([^]*)$/;

function nomesVivos(corpo, p, ate) {
  const inicio = inicioDaInstrucao(corpo, p);
  const m = ATRIBUICAO.exec(corpo.slice(inicio, p));
  if (!m) return new Set();
  const nomes = new Set(identificadores(m[2]));
  let deslocamento = p;
  for (const parte of corpo.slice(p).split(';')) {
    const comeco = deslocamento;
    deslocamento += parte.length + 1;
    if (comeco >= ate) break;
    const a = ATRIBUICAO.exec(parte);
    if (!a || a[1] === undefined && !/^[A-Za-z_$][\w$]*$/.test(a[2])) continue;
    if (identificadores(a[3]).some(nome => nomes.has(nome))) identificadores(a[2]).forEach(nome => nomes.add(nome));
    else if (!a[1]) nomes.delete(a[2]);
  }
  return nomes;
}

function leituraDevolvida(corpo, p, poll) {
  const funcao = corpo.slice(poll.de, poll.fim);
  const relativo = p - poll.de;
  const seta = funcao.search(/=>/);
  if (seta < 0 || relativo < seta) return false;
  const depois = funcao.slice(seta + 2);
  if (!/^\s*\{/.test(depois)) return true;
  for (const r of funcao.matchAll(/\breturn\b([^;}]*)/g)) {
    const posicaoDoReturn = poll.de + r.index;
    if (posicaoDoReturn > p) {
      if (identificadores(r[1]).some(nome => nomesVivos(corpo, p, posicaoDoReturn).has(nome))) return true;
    } else if (posicaoDoReturn < p && p < posicaoDoReturn + r[0].length) return true;
  }
  return false;
}

function leituraConferida(corpo, p, conferencias) {
  if (/^estadoFinal\w*\s*\(/.test(corpo.slice(p))) return true;
  for (const c of conferencias.filter(c => c.de < p && p < c.fim)) {
    if (!c.poll || leituraDevolvida(corpo, p, c)) return true;
  }
  return conferencias.some(c => c.de > p && !c.poll && identificadores(corpo.slice(c.de, c.fim)).some(nome => nomesVivos(corpo, p, c.de).has(nome)));
}

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
    const conferencias = conferenciasDe(corpo);
    const efetiva = p => (/^estadoFinalInalterado\s*\(/.test(corpo.slice(p)) ? fechamento(corpo, corpo.indexOf('(', p)) : p);
    const leituras = posicoes(corpo, LEITURA, quemLe).filter(p => efetiva(p) > acoes[acoes.length - 1]);
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

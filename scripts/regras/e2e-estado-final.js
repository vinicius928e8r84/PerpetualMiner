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
  + '`// Exceção de teste: sem-estado-guardado — <motivo>`.';

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

const eFimDeInstrucao = (c, fundura) => (c === '\n' || c === ';') && fundura <= 0;

function fimDoCorpoEmExpressao(codigo, primeiro) {
  let fundura = 0;
  for (let i = primeiro; i < codigo.length; i++) {
    if ('([{'.includes(codigo[i])) fundura++;
    else if (')]}'.includes(codigo[i])) fundura--;
    else if (eFimDeInstrucao(codigo[i], fundura)) return i;
  }
  return codigo.length;
}

function fimDoCorpo(codigo, de) {
  const comeco = codigo.slice(de).search(/\S/);
  if (comeco < 0) return codigo.length;
  const primeiro = de + comeco;
  if (codigo[primeiro] !== '{') return fimDoCorpoEmExpressao(codigo, primeiro);
  const fim = fechamento(codigo, primeiro);
  return fim < 0 ? codigo.length : fim + 1;
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

const abreCorpoDeBloco = (corpo, i) => corpo[i] === '{' && /(?:\)|=>|\belse|\btry|\bdo)\s*$/.test(corpo.slice(Math.max(0, i - 8), i));

const comecaInstrucaoDepois = (corpo, i, fundura) => (corpo[i] === ';' ? fundura === 0 : abreCorpoDeBloco(corpo, i));

function inicioDaInstrucao(corpo, p) {
  let fundura = 0;
  for (let i = p - 1; i >= 0; i--) {
    if (')]}'.includes(corpo[i])) fundura++;
    else if ('([{'.includes(corpo[i]) && fundura > 0) fundura--;
    else if (comecaInstrucaoDepois(corpo, i, fundura)) return i + 1;
  }
  return 0;
}

const ATRIBUICAO = /^\s*(?:(const|let|var)\s+)?(\{[^}]*\}|\[[^\]]*\]|[A-Za-z_$][\w$]*)\s*=(?!=)([^]*)$/;

const eNomeSoltoSemDeclaracao = a => a[1] === undefined && !/^[A-Za-z_$][\w$]*$/.test(a[2]);

function* atribuicoesAte(corpo, p, ate) {
  let deslocamento = p;
  for (const parte of corpo.slice(p).split(';')) {
    const comeco = deslocamento;
    deslocamento += parte.length + 1;
    if (comeco >= ate) return;
    const a = ATRIBUICAO.exec(parte);
    if (a && !eNomeSoltoSemDeclaracao(a)) yield a;
  }
}

function propagarNomesVivos(nomes, atribuicao) {
  if (identificadores(atribuicao[3]).some(nome => nomes.has(nome))) identificadores(atribuicao[2]).forEach(nome => nomes.add(nome));
  else if (!atribuicao[1]) nomes.delete(atribuicao[2]);
}

function nomesVivos(corpo, p, ate) {
  const inicio = inicioDaInstrucao(corpo, p);
  const m = ATRIBUICAO.exec(corpo.slice(inicio, p));
  if (!m) return new Set();
  const nomes = new Set(identificadores(m[2]));
  for (const atribuicao of atribuicoesAte(corpo, p, ate)) propagarNomesVivos(nomes, atribuicao);
  return nomes;
}

function returnDevolveALeitura(corpo, p, posicao, retorno) {
  if (posicao > p) return identificadores(retorno[1]).some(nome => nomesVivos(corpo, p, posicao).has(nome));
  return posicao < p && p < posicao + retorno[0].length;
}

function leituraDevolvida(corpo, p, poll) {
  const funcao = corpo.slice(poll.de, poll.fim);
  const seta = funcao.search(/=>/);
  if (seta < 0 || p - poll.de < seta) return false;
  if (!/^\s*\{/.test(funcao.slice(seta + 2))) return true;
  return [...funcao.matchAll(/\breturn\b([^;}]*)/g)].some(r => returnDevolveALeitura(corpo, p, poll.de + r.index, r));
}

function leituraConferida(corpo, p, conferencias) {
  if (/^estadoFinal\w*\s*\(/.test(corpo.slice(p))) return true;
  for (const c of conferencias.filter(c => c.de < p && p < c.fim)) {
    if (!c.poll || leituraDevolvida(corpo, p, c)) return true;
  }
  return conferencias.some(c => c.de > p && !c.poll && identificadores(corpo.slice(c.de, c.fim)).some(nome => nomesVivos(corpo, p, c.de).has(nome)));
}

const temMarca = (comentarios, linha) => MARCA.test(comentarios.get(linha) || '');

const fechaInstrucao = (linhas, linha) => /[;{}]$/.test((linhas[linha - 1] || '').trim());

function marcaNasLinhasDoTeste(comentarios, primeira, ultima) {
  for (let linha = primeira; linha <= ultima; linha++) if (temMarca(comentarios, linha)) return true;
  return false;
}

function marcaAcimaDoTeste(comentarios, linhas, primeira) {
  for (let linha = primeira - 1; linha >= 1 && primeira - linha <= 12; linha--) {
    if (temMarca(comentarios, linha)) return true;
    if (fechaInstrucao(linhas, linha)) return false;
  }
  return false;
}

const anotado = (comentarios, linhas, primeira, ultima) => marcaNasLinhasDoTeste(comentarios, primeira, ultima) || marcaAcimaDoTeste(comentarios, linhas, primeira);

function contextoDoArquivo(arquivo, fonte, raiz) {
  const codigo = semComentariosJs(fonte);
  const doFake = [...leitoresDosFakes(raiz)];
  const leitura = new RegExp(doFake.length ? `${LEITURA_FIXA.source}|\\.(?:${doFake.join('|')})\\b` : LEITURA_FIXA.source, 'g');
  const defs = funcoes(codigo);
  return {
    codigo,
    leitura,
    linhas: codigo.split('\n'),
    comentarios: comentariosPorLinha(arquivo, fonte),
    quemAge: quemFaz(defs, ACAO),
    quemLe: quemFaz(defs, leitura),
  };
}

function oTesteConfereOEstado(corpo, acoes, contexto) {
  const conferencias = conferenciasDe(corpo);
  const efetiva = p => (/^estadoFinalInalterado\s*\(/.test(corpo.slice(p)) ? fechamento(corpo, corpo.indexOf('(', p)) : p);
  const leituras = posicoes(corpo, contexto.leitura, contexto.quemLe).filter(p => efetiva(p) > acoes[acoes.length - 1]);
  return leituras.some(p => leituraConferida(corpo, p, conferencias));
}

const tituloDoTeste = (codigo, abre) => /^\s*(['"`])((?:(?!\1).)*)\1/.exec(codigo.slice(abre + 1, abre + 200).replace(/^\s+/, ''));

function achadoDoTeste(inicio, contexto) {
  const { codigo } = contexto;
  const abre = codigo.indexOf('(', inicio);
  const fecha = fechamento(codigo, abre);
  if (fecha < 0) return null;
  const corpo = codigo.slice(abre + 1, fecha);
  const acoes = posicoes(corpo, ACAO, contexto.quemAge);
  if (acoes.length === 0 || oTesteConfereOEstado(corpo, acoes, contexto)) return null;
  const primeira = linhaDe(codigo, inicio);
  if (anotado(contexto.comentarios, contexto.linhas, primeira, linhaDe(codigo, fecha))) return null;
  const titulo = tituloDoTeste(codigo, abre);
  return {
    linha: primeira,
    detalhe: `o teste age (${acoes.length} ação(ões)) e depois da última não lê e compara o que ficou guardado${titulo ? `: “${titulo[2].slice(0, 70)}”` : ''}`,
  };
}

function verificar(arquivo, fonte, raiz = process.cwd()) {
  const contexto = contextoDoArquivo(arquivo, fonte, raiz);
  return [...contexto.codigo.matchAll(/\btest(?:\.only)?\s*\(\s*(['"`])/g)]
    .map(m => achadoDoTeste(m.index, contexto))
    .filter(Boolean);
}

module.exports = { id, conserto, seAplica, verificar };

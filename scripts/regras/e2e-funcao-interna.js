'use strict';

const fs = require('fs');
const path = require('path');
const { PASTAS_DA_EXTENSAO } = require('../arquivos-do-pacote');
const { comentariosPorLinha, ehJsDaExtensao, fechamento, linhaDe, semComentariosJs } = require('./comum');

const id = 'e2e-funcao-interna';

const EXCECOES = ['chrome-nativo', 'catálogo', 'componente-base'];

const conserto = 'Confira pela tela (locators) e pelo que ficou gravado (`extensao.lerStorage`, `extensao.frases()`), '
  + 'não chamando o código da extensão num `evaluate`. Se for uma das três exceções de docs/testes.md, '
  + 'diga qual no comentário logo acima, seguido do porquê: `// Exceção de teste: chrome-nativo|catálogo|componente-base (docs/testes.md).` '
  + '(CODING_STANDARDS.md regra 8).';

const seAplica = arquivo => /^e2e\/tests\/.+\.spec\.js$/.test(arquivo);

const globaisPorRaiz = new Map();
function funcoesDaExtensao(raiz) {
  if (globaisPorRaiz.has(raiz)) return globaisPorRaiz.get(raiz);
  const globais = new Set();
  globaisPorRaiz.set(raiz, globais);
  const daRaiz = fs.readdirSync(raiz);
  const dasPastas = PASTAS_DA_EXTENSAO.filter(pasta => fs.existsSync(path.join(raiz, pasta)))
    .flatMap(pasta => fs.readdirSync(path.join(raiz, pasta), { recursive: true }).map(nome => `${pasta}/${nome.split(path.sep).join('/')}`));
  for (const arquivo of [...daRaiz, ...dasPastas]) {
    if (!ehJsDaExtensao(arquivo) || !fs.statSync(path.join(raiz, arquivo)).isFile()) continue;
    const fonte = fs.readFileSync(path.join(raiz, arquivo), 'utf8');
    for (const m of fonte.matchAll(/^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/gm)) globais.add(m[1]);
  }
  return globais;
}

const MARCA = new RegExp(`Exceção de teste:\\s*(${EXCECOES.join('|')})\\b`);

function anotado(comentarios, codigo, primeira, ultima) {
  const marcada = linha => MARCA.test(comentarios.get(linha) || '');
  for (let linha = primeira; linha <= ultima; linha++) if (marcada(linha)) return true;
  for (let linha = primeira - 1, vistas = 0; linha >= 1 && vistas < 12; linha--, vistas++) {
    if (marcada(linha)) return true;
    const instrucao = (codigo[linha - 1] || '').trim();
    if (instrucao === '') continue;
    if (/[;{}]$/.test(instrucao)) break;
  }
  return false;
}

function verificar(arquivo, fonte, raiz = process.cwd()) {
  const nomes = funcoesDaExtensao(raiz);
  const codigo = semComentariosJs(fonte);
  const linhasDeCodigo = codigo.split('\n');
  const comentarios = comentariosPorLinha(arquivo, fonte);
  const achados = [];
  for (const m of codigo.matchAll(/\.evaluate(?:Handle)?\s*\(/g)) {
    const abre = m.index + m[0].length - 1;
    const fecha = fechamento(codigo, abre);
    if (fecha < 0) continue;
    const corpo = codigo.slice(abre + 1, fecha);
    const usadas = new Set();
    for (const c of corpo.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) if (nomes.has(c[1])) usadas.add(`${c[1]}()`);
    for (const c of corpo.matchAll(/\bPerpetualMiner((?:\.[A-Za-z_$][\w$]*)+)/g)) usadas.add(`PerpetualMiner${c[1]}`);
    if (usadas.size === 0) continue;
    const primeira = linhaDe(codigo, m.index);
    if (anotado(comentarios, linhasDeCodigo, primeira, linhaDe(codigo, fecha))) continue;
    achados.push({ linha: primeira, detalhe: `evaluate chama o código da extensão: ${[...usadas].join(', ')}` });
  }
  return achados;
}

module.exports = { id, conserto, seAplica, verificar, EXCECOES };

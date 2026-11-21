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
  + '(docs/CODING_STANDARDS.md regra 8).';

const seAplica = arquivo => /^e2e\/tests\/.+\.spec\.js$/.test(arquivo);

const DECLARACAO_DE_FUNCAO = /^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/gm;
const CHAMADA_DE_FUNCAO = /(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g;
const USO_DO_NAMESPACE = /\bPerpetualMiner((?:\.[A-Za-z_$][\w$]*)+)/g;
const CHAMADA_DE_EVALUATE = /\.evaluate(?:Handle)?\s*\(/g;
const LINHAS_ACIMA_DA_MARCA = 12;

const MARCA = new RegExp(`Exceção de teste:\\s*(${EXCECOES.join('|')})\\b`);

const globaisPorRaiz = new Map();

const arquivosDaPasta = (raiz, pasta) => fs.readdirSync(path.join(raiz, pasta), { recursive: true })
  .map(nome => `${pasta}/${nome.split(path.sep).join('/')}`);

function arquivosJsDaExtensao(raiz) {
  const dasPastas = PASTAS_DA_EXTENSAO.filter(pasta => fs.existsSync(path.join(raiz, pasta)))
    .flatMap(pasta => arquivosDaPasta(raiz, pasta));
  return [...fs.readdirSync(raiz), ...dasPastas]
    .filter(arquivo => ehJsDaExtensao(arquivo) && fs.statSync(path.join(raiz, arquivo)).isFile());
}

const funcoesDeclaradasEm = fonte => [...fonte.matchAll(DECLARACAO_DE_FUNCAO)].map(declaracao => declaracao[1]);

function funcoesDaExtensao(raiz) {
  if (globaisPorRaiz.has(raiz)) return globaisPorRaiz.get(raiz);
  const globais = new Set();
  globaisPorRaiz.set(raiz, globais);
  for (const arquivo of arquivosJsDaExtensao(raiz)) {
    for (const nome of funcoesDeclaradasEm(fs.readFileSync(path.join(raiz, arquivo), 'utf8'))) globais.add(nome);
  }
  return globais;
}

const linhaMarcada = (comentarios, linha) => MARCA.test(comentarios.get(linha) || '');

const instrucaoEncerrada = instrucao => /[;{}]$/.test(instrucao);

function marcaEntre(comentarios, primeira, ultima) {
  for (let linha = primeira; linha <= ultima; linha++) if (linhaMarcada(comentarios, linha)) return true;
  return false;
}

function marcaAcima(comentarios, codigo, primeira) {
  const ultimaAcima = Math.max(primeira - LINHAS_ACIMA_DA_MARCA, 1);
  for (let linha = primeira - 1; linha >= ultimaAcima; linha--) {
    if (linhaMarcada(comentarios, linha)) return true;
    if (instrucaoEncerrada((codigo[linha - 1] || '').trim())) return false;
  }
  return false;
}

const anotado = (comentarios, codigo, primeira, ultima) => marcaEntre(comentarios, primeira, ultima)
  || marcaAcima(comentarios, codigo, primeira);

function usosDaExtensao(corpo, nomes) {
  const funcoes = [...corpo.matchAll(CHAMADA_DE_FUNCAO)].map(chamada => chamada[1]).filter(nome => nomes.has(nome));
  const namespace = [...corpo.matchAll(USO_DO_NAMESPACE)].map(uso => `PerpetualMiner${uso[1]}`);
  return new Set([...funcoes.map(nome => `${nome}()`), ...namespace]);
}

function chamadasDeEvaluate(codigo) {
  return [...codigo.matchAll(CHAMADA_DE_EVALUATE)]
    .map(chamada => ({ inicio: chamada.index, abre: chamada.index + chamada[0].length - 1 }))
    .map(chamada => ({ ...chamada, fecha: fechamento(codigo, chamada.abre) }))
    .filter(chamada => chamada.fecha >= 0);
}

function achadosDoEvaluate({ inicio, abre, fecha }, { codigo, linhasDeCodigo, comentarios, nomes }) {
  const usadas = usosDaExtensao(codigo.slice(abre + 1, fecha), nomes);
  if (usadas.size === 0) return [];
  const primeira = linhaDe(codigo, inicio);
  if (anotado(comentarios, linhasDeCodigo, primeira, linhaDe(codigo, fecha))) return [];
  return [{ linha: primeira, detalhe: `evaluate chama o código da extensão: ${[...usadas].join(', ')}` }];
}

function verificar(arquivo, fonte, raiz = process.cwd()) {
  const nomes = funcoesDaExtensao(raiz);
  const codigo = semComentariosJs(fonte);
  const leitura = { codigo, linhasDeCodigo: codigo.split('\n'), comentarios: comentariosPorLinha(arquivo, fonte), nomes };
  return chamadasDeEvaluate(codigo).flatMap(chamada => achadosDoEvaluate(chamada, leitura));
}

module.exports = { id, conserto, seAplica, verificar, EXCECOES };

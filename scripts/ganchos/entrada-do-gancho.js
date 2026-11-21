'use strict';

class ErroDeEntrada extends Error {
  constructor(onde, detalhe, linha, aproximada = false) {
    const ondeNoArquivo = linha ? `${aproximada ? 'perto da ' : ''}linha ${linha}` : '';
    super(`✗ ${onde}${ondeNoArquivo && `, ${ondeNoArquivo}`}: ${detalhe}`);
    this.detalhe = ondeNoArquivo ? `${detalhe} (${ondeNoArquivo})` : detalhe;
    this.name = 'ErroDeEntrada';
  }
}

function ehObjeto(valor) {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
}

function ehNumeroDeBytes(valor) {
  return typeof valor === 'number' && Number.isFinite(valor) && valor >= 0;
}

function linhaDaChave(texto, chave) {
  const indice = texto.split('\n').findIndex(linha => linha.includes(JSON.stringify(chave)));
  return indice < 0 ? null : indice + 1;
}

function linhaAntesDe(texto, indice) {
  return texto.slice(0, indice).split('\n').length;
}

function linhaDoErroDoJson(texto, mensagem) {
  const posicao = /position (\d+)/.exec(mensagem);
  if (posicao) return { linha: linhaAntesDe(texto, Number(posicao[1])), aproximada: false };
  const trecho = /, (?:\.\.\.)?"(.+?)"(?:\.\.\.)? is not valid JSON/s.exec(mensagem);
  const inicio = trecho ? texto.indexOf(trecho[1]) : -1;
  return { linha: inicio < 0 ? null : linhaAntesDe(texto, inicio), aproximada: true };
}

function lerJson(texto, onde) {
  try {
    return JSON.parse(texto);
  } catch (erro) {
    const { linha, aproximada } = linhaDoErroDoJson(texto, erro.message);
    throw new ErroDeEntrada(onde, `não é um JSON válido (${erro.message})`, linha, aproximada);
  }
}

function primeiroTamanhoInvalido(arquivos) {
  return Object.entries(arquivos).find(([, valor]) => !ehNumeroDeBytes(valor));
}

function erroDeTamanhoInvalido(texto, onde, [caminho, valor]) {
  return new ErroDeEntrada(onde, `o tamanho de ${JSON.stringify(caminho)} tem de ser um número de bytes (achou ${JSON.stringify(valor)})`, linhaDaChave(texto, caminho));
}

function lerLinhaDeBaseDoTexto(texto, onde) {
  const dados = lerJson(texto, onde);
  if (!ehObjeto(dados)) throw new ErroDeEntrada(onde, 'esperava um objeto com a chave "arquivos"', 1);
  if (dados.arquivos === undefined) return {};
  if (!ehObjeto(dados.arquivos)) throw new ErroDeEntrada(onde, '"arquivos" tem de ser um objeto { caminho: bytes }', linhaDaChave(texto, 'arquivos'));
  const invalido = primeiroTamanhoInvalido(dados.arquivos);
  if (invalido) throw erroDeTamanhoInvalido(texto, onde, invalido);
  return dados.arquivos;
}

function ehNumeroPositivo(valor) {
  return typeof valor === 'number' && valor > 0;
}

function ehLimiteDeBytes(valor) {
  return Number.isFinite(valor) && ehNumeroPositivo(valor);
}

function ehCaminhoDaLinhaDeBase(valor) {
  return typeof valor === 'string' && valor !== '';
}

function ehNumeroDeLinhas(valor) {
  return Number.isInteger(valor) && valor >= 0;
}

function ehTexto(valor) {
  return typeof valor === 'string';
}

function ehListaDeTextos(valor) {
  return Array.isArray(valor) && valor.every(ehTexto);
}

function ehRegraDeIgnorar(regra) {
  return ehObjeto(regra) && ehTexto(regra.glob) && ehTexto(regra.motivo);
}

function ehListaDeRegrasDeIgnorar(valor) {
  return Array.isArray(valor) && valor.every(ehRegraDeIgnorar);
}

function ehBytesPorTokenOpcional(valor) {
  return valor === undefined || ehNumeroPositivo(valor);
}

const CAMPOS_DA_CONFIGURACAO = [
  ['limiteDeBytes', ehLimiteDeBytes, 'um número de bytes maior que zero'],
  ['linhaDeBase', ehCaminhoDaLinhaDeBase, 'o caminho da linha de base'],
  ['linhasDoCabecalho', ehNumeroDeLinhas, 'um número inteiro de linhas'],
  ['marcasDeGerado', ehListaDeTextos, 'uma lista de textos'],
  ['ignorar', ehListaDeRegrasDeIgnorar, 'uma lista de { glob, motivo }'],
  ['bytesPorToken', ehBytesPorTokenOpcional, 'um número maior que zero'],
];

function lerConfiguracaoDoTexto(texto, onde) {
  const config = lerJson(texto, onde);
  if (!ehObjeto(config)) throw new ErroDeEntrada(onde, 'esperava um objeto de configuração', 1);
  for (const [campo, valido, esperado] of CAMPOS_DA_CONFIGURACAO) {
    if (!valido(config[campo])) throw new ErroDeEntrada(onde, `"${campo}" tem de ser ${esperado}`, linhaDaChave(texto, campo));
  }
  return config;
}

function mensagemDeEntradaInvalida(erro) {
  return `Commit barrado: a conferência de tamanho não pôde ler o que precisa.\n\n${erro.message}\n\n`
    + 'Corrija o arquivo (e dê `git add` nele, se for a linha de base) ou restaure o do último commit: '
    + '`git restore --source=HEAD --staged --worktree -- <arquivo>`.\n';
}

module.exports = { ErroDeEntrada, lerConfiguracaoDoTexto, lerLinhaDeBaseDoTexto, mensagemDeEntradaInvalida };

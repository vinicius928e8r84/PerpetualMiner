'use strict';

// A leitura confiável do que o gancho do tamanho dos arquivos (limite-de-tokens.js) recebe como
// entrada: a configuração (limite-de-tokens.json) e a linha de base preparada. Arquivo ilegível, JSON
// quebrado ou formato errado lança ErroDeEntrada, que barra o commit (fail closed) dizendo o arquivo
// e a linha. Só a falha do ambiente (git indisponível, por exemplo) deixa o commit passar com aviso.

class ErroDeEntrada extends Error {
  constructor(onde, detalhe, linha, aproximada = false) {
    const ondeNoArquivo = linha ? `${aproximada ? 'perto da ' : ''}linha ${linha}` : '';
    super(`✗ ${onde}${ondeNoArquivo && `, ${ondeNoArquivo}`}: ${detalhe}`);
    this.detalhe = ondeNoArquivo ? `${detalhe} (${ondeNoArquivo})` : detalhe;
    this.name = 'ErroDeEntrada';
  }
}

const ehObjeto = valor => valor !== null && typeof valor === 'object' && !Array.isArray(valor);
const ehNumeroDeBytes = valor => typeof valor === 'number' && Number.isFinite(valor) && valor >= 0;

/** A linha (de 1) da primeira linha do texto que cita a chave; `null` se nenhuma cita. */
function linhaDaChave(texto, chave) {
  const indice = texto.split('\n').findIndex(linha => linha.includes(JSON.stringify(chave)));
  return indice < 0 ? null : indice + 1;
}

function lerJson(texto, onde) {
  try {
    return JSON.parse(texto);
  } catch (erro) {
    const posicao = /position (\d+)/.exec(erro.message);
    if (posicao) throw new ErroDeEntrada(onde, `não é um JSON válido (${erro.message})`, texto.slice(0, Number(posicao[1])).split('\n').length);
    // Sem a posição, a mensagem traz o trecho em volta do erro: a linha onde ele começa fica a uma ou duas do erro.
    const trecho = /, (?:\.\.\.)?"(.+?)"(?:\.\.\.)? is not valid JSON/s.exec(erro.message);
    const inicio = trecho ? texto.indexOf(trecho[1]) : -1;
    const linha = inicio < 0 ? null : texto.slice(0, inicio).split('\n').length;
    throw new ErroDeEntrada(onde, `não é um JSON válido (${erro.message})`, linha, true);
  }
}

/** A linha de base `{ caminho: bytes }` de um texto JSON `{ arquivos: {...} }`; `onde` nomeia o arquivo nas mensagens. */
function lerLinhaDeBaseDoTexto(texto, onde) {
  const dados = lerJson(texto, onde);
  if (!ehObjeto(dados)) throw new ErroDeEntrada(onde, 'esperava um objeto com a chave "arquivos"', 1);
  if (dados.arquivos === undefined) return {};
  if (!ehObjeto(dados.arquivos)) throw new ErroDeEntrada(onde, '"arquivos" tem de ser um objeto { caminho: bytes }', linhaDaChave(texto, 'arquivos'));
  for (const [caminho, valor] of Object.entries(dados.arquivos)) {
    if (!ehNumeroDeBytes(valor)) throw new ErroDeEntrada(onde, `o tamanho de ${JSON.stringify(caminho)} tem de ser um número de bytes (achou ${JSON.stringify(valor)})`, linhaDaChave(texto, caminho));
  }
  return dados.arquivos;
}

const CAMPOS_DA_CONFIGURACAO = [
  ['limiteDeBytes', valor => typeof valor === 'number' && Number.isFinite(valor) && valor > 0, 'um número de bytes maior que zero'],
  ['linhaDeBase', valor => typeof valor === 'string' && valor !== '', 'o caminho da linha de base'],
  ['linhasDoCabecalho', valor => Number.isInteger(valor) && valor >= 0, 'um número inteiro de linhas'],
  ['marcasDeGerado', valor => Array.isArray(valor) && valor.every(marca => typeof marca === 'string'), 'uma lista de textos'],
  ['ignorar', valor => Array.isArray(valor) && valor.every(r => ehObjeto(r) && typeof r.glob === 'string' && typeof r.motivo === 'string'), 'uma lista de { glob, motivo }'],
];

/** A configuração `{ limiteDeBytes, linhaDeBase, ignorar, ... }` de um texto JSON; `onde` nomeia o arquivo nas mensagens. */
function lerConfiguracaoDoTexto(texto, onde) {
  const config = lerJson(texto, onde);
  if (!ehObjeto(config)) throw new ErroDeEntrada(onde, 'esperava um objeto de configuração', 1);
  for (const [campo, valido, esperado] of CAMPOS_DA_CONFIGURACAO) {
    if (!valido(config[campo])) throw new ErroDeEntrada(onde, `"${campo}" tem de ser ${esperado}`, linhaDaChave(texto, campo));
  }
  if (config.bytesPorToken !== undefined && !(typeof config.bytesPorToken === 'number' && config.bytesPorToken > 0)) {
    throw new ErroDeEntrada(onde, '"bytesPorToken" tem de ser um número maior que zero', linhaDaChave(texto, 'bytesPorToken'));
  }
  return config;
}

function mensagemDeEntradaInvalida(erro) {
  return `Commit barrado: a conferência de tamanho não pôde ler o que precisa.\n\n${erro.message}\n\n`
    + 'Corrija o arquivo (e dê `git add` nele, se for a linha de base) ou restaure o do último commit: '
    + '`git restore --source=HEAD --staged --worktree -- <arquivo>`.\n';
}

module.exports = { ErroDeEntrada, lerConfiguracaoDoTexto, lerLinhaDeBaseDoTexto, mensagemDeEntradaInvalida };

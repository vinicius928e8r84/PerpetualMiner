'use strict';

const { categoriaDaRegra } = require('./categorias');

const NOME_NO_FIM_DA_MENSAGEM = /:\s*(\S+)$/;

const MEDIDA_DA_REGRA = {
  'qlty:function-complexity': 'complexidade cognitiva',
  'qlty:function-parameters': 'argumentos',
  'qlty:nested-control-flow': 'nível',
  'qlty:boolean-logic': 'operadores lógicos',
  'qlty:file-complexity': 'complexidade cognitiva do arquivo',
  'qlty:return-statements': 'retornos',
  'qlty:identical-code': 'linhas idênticas',
  'qlty:similar-code': 'linhas parecidas',
};

function funcaoDaMensagem(texto) {
  const nome = NOME_NO_FIM_DA_MENSAGEM.exec(texto);
  return nome ? nome[1] : null;
}

function rotuloDoQlty({ regra, linha, funcao, valor, texto }) {
  const medida = MEDIDA_DA_REGRA[regra];
  if (!medida) return `l. ${linha}: ${texto}`;
  const onde = funcao ? `\`${funcao}\` (l. ${linha})` : `l. ${linha}`;
  return `${onde}: ${medida} ${valor}`;
}

function achadoDoResultado(resultado) {
  const local = resultado.locations[0].physicalLocation;
  const achado = {
    arquivo: local.artifactLocation.uri,
    categoria: categoriaDaRegra.get(resultado.ruleId) || 'outra-do-qlty',
    regra: resultado.ruleId,
    linha: local.region.startLine,
    fim: local.region.endLine || local.region.startLine,
    funcao: funcaoDaMensagem(resultado.message.text),
    valor: (resultado.properties || {}).actual,
    texto: resultado.message.text,
  };
  return { ...achado, rotulo: rotuloDoQlty(achado) };
}

function lerSarif(texto) {
  const sarif = JSON.parse(texto);
  const run = sarif.runs[0];
  return { versao: run.tool.driver.semanticVersion, resultados: run.results };
}

function achadosDoQlty(textoDoSarif) {
  const { versao, resultados } = lerSarif(textoDoSarif);
  const porArquivo = new Map();
  for (const achado of resultados.map(achadoDoResultado)) {
    if (!porArquivo.has(achado.arquivo)) porArquivo.set(achado.arquivo, []);
    porArquivo.get(achado.arquivo).push(achado);
  }
  return { versao, porArquivo };
}

module.exports = { achadosDoQlty };

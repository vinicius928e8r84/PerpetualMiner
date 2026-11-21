'use strict';

const fs = require('fs');
const path = require('path');

const { arquivosDoRepositorio } = require('../regras/comum');
const { seAplica } = require('../regras/saude-do-codigo');
const { MedidorDoRepositorio, ehPython } = require('../regras/analisador/medir');
const { pontuar } = require('../regras/analisador/pontos');
const { categoriaDaMedida } = require('./categorias');

const rotuloDoMedidor = excesso => (excesso.unidade ? `\`${excesso.unidade}\` (l. ${excesso.linha}): ${excesso.detalhe}` : excesso.detalhe);

const achadoDoExcesso = excesso => ({
  categoria: categoriaDaMedida.get(excesso.medida),
  medida: excesso.medida,
  linha: excesso.linha,
  funcao: excesso.unidade,
  pontos: excesso.pontos,
  rotulo: rotuloDoMedidor(excesso),
});

function medicaoDoArquivo(medicao) {
  const unidades = medicao.unidades || [];
  return {
    achados: pontuar(medicao).map(achadoDoExcesso),
    linhasDasFuncoes: new Set(unidades.map(unidade => unidade.linha)),
  };
}

function achadosDoMedidor(raiz, arquivos = arquivosDoRepositorio(raiz).filter(seAplica)) {
  const medidor = new MedidorDoRepositorio(raiz, arquivos.filter(ehPython));
  const porArquivo = new Map();
  for (const arquivo of arquivos) {
    const fonte = fs.readFileSync(path.join(raiz, arquivo), 'utf8');
    porArquivo.set(arquivo, medicaoDoArquivo(medidor.medir(arquivo, fonte)));
  }
  return porArquivo;
}

module.exports = { achadosDoMedidor, medicaoDoArquivo };

'use strict';

const fs = require('fs');
const path = require('path');

const ARQUIVO_DA_LINHA_DE_BASE = 'scripts/regras/linha-de-base.json';
const MARCA_DE_GERADO = '@generated';
const AVISO_DE_GERADO = 'gerado por `node scripts/regras/verificar.js --criar-linha-de-base`, DO NOT EDIT: o teto de cada arquivo desce no merge (scripts/regras/baixar-no-merge.js)';

const arquivoDe = regra => regra.arquivoDaLinhaDeBase || ARQUIVO_DA_LINHA_DE_BASE;
const arquivosDe = regras => [...new Set(regras.map(arquivoDe))];
const regrasDoArquivo = (regras, arquivo) => regras.filter(regra => arquivoDe(regra) === arquivo);
const comoArquivo = objeto => `${JSON.stringify(objeto, null, 2)}\n`;

const lerJson = (texto, origem) => {
  try {
    return JSON.parse(texto);
  } catch (erro) {
    throw new Error(`${origem} não é um JSON válido (${erro.message}); conserte o arquivo ou restaure-o da main`);
  }
};

function lerArquivoDaLinhaDeBase(texto, origem) {
  return Object.fromEntries(Object.entries(lerJson(texto, origem)).filter(([chave]) => !chave.startsWith('@')));
}

function lerDoDisco(raiz, arquivo) {
  const caminho = path.join(raiz, arquivo);
  return fs.existsSync(caminho) ? lerArquivoDaLinhaDeBase(fs.readFileSync(caminho, 'utf8'), arquivo) : null;
}

function gravar(raiz, arquivo, entradas) {
  const marca = arquivo === ARQUIVO_DA_LINHA_DE_BASE ? {} : { [MARCA_DE_GERADO]: AVISO_DE_GERADO };
  fs.writeFileSync(path.join(raiz, arquivo), comoArquivo({ ...marca, ...entradas }));
}

function emOrdem(porArquivo) {
  const ordenado = {};
  for (const [arquivo, n] of Object.entries(porArquivo).sort()) ordenado[arquivo] = n;
  return ordenado;
}

function criarLinhaDeBase(raiz, regras, agora) {
  const criadas = [];
  for (const arquivo of arquivosDe(regras)) {
    const existente = lerDoDisco(raiz, arquivo) || {};
    const novas = regrasDoArquivo(regras, arquivo).map(regra => regra.id).filter(regra => !(regra in existente));
    if (!novas.length) continue;
    gravar(raiz, arquivo, { ...existente, ...Object.fromEntries(novas.map(regra => [regra, emOrdem(agora[regra])])) });
    criadas.push(`${arquivo} para ${novas.join(', ')}`);
  }
  if (!criadas.length) throw new Error('a linha de base já existe com todas as regras; ela só desce (--atualizar)');
  console.log(`linha de base criada em ${criadas.join('; ')}`);
  return 0;
}

function lerLinhaDeBase(raiz, regras) {
  if (!fs.existsSync(path.join(raiz, ARQUIVO_DA_LINHA_DE_BASE))) {
    throw new Error(`falta ${ARQUIVO_DA_LINHA_DE_BASE}; ela é versionada com as regras (crie com --criar-linha-de-base)`);
  }
  return Object.assign({}, ...arquivosDe(regras).map(arquivo => lerDoDisco(raiz, arquivo) || {}));
}

function atualizarLinhaDeBase(raiz, regras, agora, { erros, podeBaixar }) {
  if (erros.length) {
    console.log(`${erros.join('\n\n')}\n\nerror: nada atualizado; --atualizar só baixa a linha de base, e há erros acima`);
    return 1;
  }
  for (const arquivo of arquivosDe(regras)) {
    gravar(raiz, arquivo, Object.fromEntries(regrasDoArquivo(regras, arquivo).map(regra => [regra.id, emOrdem(agora[regra.id])])));
  }
  console.log(podeBaixar.length ? `linha de base baixada:\n  ${podeBaixar.join('\n  ')}` : 'a linha de base já estava em dia');
  return 0;
}

module.exports = {
  ARQUIVO_DA_LINHA_DE_BASE, arquivoDe, arquivosDe, lerJson, lerArquivoDaLinhaDeBase, criarLinhaDeBase, lerLinhaDeBase, atualizarLinhaDeBase,
};

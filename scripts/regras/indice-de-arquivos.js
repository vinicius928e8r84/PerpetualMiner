'use strict';

const fs = require('fs');
const path = require('path');
const { PASTAS_DA_EXTENSAO } = require('../arquivos-do-pacote');

const id = 'indice-de-arquivos';

const guarda = 'um arquivo da raiz, de lib/, veio/ ou scripts/ tem a sua linha em docs/arquivos/';

const conserto = 'Acrescente uma linha (ou cite o arquivo numa linha que já o explica) numa tabela de '
  + '`docs/arquivos/*.md`, com o caminho entre crases; uma linha cujo arquivo foi removido ou renomeado sai ou segue o novo nome.';

const PASTA_DO_INDICE = 'docs/arquivos';
const ehDoIndice = arquivo => arquivo.startsWith(`${PASTA_DO_INDICE}/`) && /^[^/]+\.md$/.test(arquivo.slice(PASTA_DO_INDICE.length + 1));
const naRaizOuNumaPastaDoIndice = arquivo => {
  const partes = arquivo.split('/');
  return partes.length === 1 || (partes.length === 2 && [...PASTAS_DA_EXTENSAO, 'scripts'].includes(partes[0]));
};

const noEscopo = arquivo => naRaizOuNumaPastaDoIndice(arquivo)
  && !arquivo.startsWith('.')
  && !/\.md$/.test(arquivo)
  && !/(^|\/)test_[^/]*$/.test(arquivo);

const seAplica = arquivo => ehDoIndice(arquivo) || noEscopo(arquivo);

function expandir(item) {
  const m = /^(.*?[^/.]\.)([a-z0-9]+(?:\/[a-z0-9]+)+)$/i.exec(item);
  return m ? m[2].split('/').map(extensao => m[1] + extensao) : [item];
}

const itensDe = texto => [...texto.matchAll(/`([^`]+)`/g)]
  .flatMap(m => m[1].split(/[\s,]+/).filter(Boolean))
  .flatMap(expandir);

function linhasDaTabela(fonte) {
  const saida = [];
  fonte.split('\n').forEach((texto, i) => {
    if (texto.startsWith('|')) saida.push({ linha: i + 1, primeiraColuna: texto.split('|')[1] || '', texto });
  });
  return saida;
}

const ehSeparador = chave => /^[\s:-]*$/.test(chave);
const citaUmArquivo = item => /\/|\.[a-z0-9]+$/i.test(item);

function primeiraLinhaDeCadaChave(linhas) {
  const primeira = new Map();
  for (const { linha, chave } of linhas) if (!primeira.has(chave)) primeira.set(chave, linha);
  return primeira;
}

function repeticao({ linha, chave }, primeira) {
  if (ehSeparador(chave) || primeira.get(chave) === linha) return [];
  return [{ linha, detalhe: `a linha repete a primeira coluna da linha ${primeira.get(chave)} (duplicata, talvez de um merge=union): deixe uma só` }];
}

const citacoesQueNaoExistem = ({ linha, primeiraColuna }, raiz) => itensDe(primeiraColuna)
  .filter(item => citaUmArquivo(item) && !fs.existsSync(path.join(raiz, item)))
  .map(item => ({ linha, detalhe: `a linha cita \`${item}\`, que não existe` }));

function achadosDoIndice(fonte, raiz) {
  const linhas = linhasDaTabela(fonte).map(linha => ({ ...linha, chave: linha.primeiraColuna.trim() }));
  const primeira = primeiraLinhaDeCadaChave(linhas);
  return linhas.flatMap(linha => [...repeticao(linha, primeira), ...citacoesQueNaoExistem(linha, raiz)]);
}

const citadosNoIndice = pasta => new Set(fs.readdirSync(pasta).filter(nomeDoArquivo => ehDoIndice(`${PASTA_DO_INDICE}/${nomeDoArquivo}`))
  .flatMap(nomeDoArquivo => linhasDaTabela(fs.readFileSync(path.join(pasta, nomeDoArquivo), 'utf8')).flatMap(l => itensDe(l.texto))));

function achadosDoArquivo(arquivo, raiz) {
  const pasta = path.join(raiz, PASTA_DO_INDICE);
  if (!fs.existsSync(pasta)) return [];
  const citados = citadosNoIndice(pasta);
  if (citados.has(arquivo) || citados.has(path.posix.basename(arquivo))) return [];
  return [{ linha: 1, detalhe: `${arquivo} não está em nenhuma tabela de ${PASTA_DO_INDICE}/` }];
}

const verificar = (arquivo, fonte, raiz) => (ehDoIndice(arquivo) ? achadosDoIndice(fonte, raiz) : achadosDoArquivo(arquivo, raiz));

module.exports = { id, guarda, conserto, seAplica, verificar };

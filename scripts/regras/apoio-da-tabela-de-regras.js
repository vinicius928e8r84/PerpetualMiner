'use strict';

const SECAO = '## Rules and what enforces them';
const REGRA = /`([a-z0-9]+(?:-[a-z0-9]+)+)`/g;

function secaoDaTabela(texto) {
  const inicio = texto.indexOf(SECAO);
  if (inicio < 0) throw new Error(`falta a seção "${SECAO.slice(3)}"`);
  const resto = texto.slice(inicio + SECAO.length);
  const fim = resto.search(/^## /m);
  return fim < 0 ? resto : resto.slice(0, fim);
}

const regrasDaLinha = linha => [...linha.matchAll(REGRA)].map(achado => achado[1]);

function regrasDaTabela(texto) {
  const linhasDaTabela = secaoDaTabela(texto).split('\n').filter(linha => linha.startsWith('|'));
  return [...new Set(linhasDaTabela.flatMap(regrasDaLinha))];
}

const achado = (regra, detalhe) => ({ regra, detalhe });

const SEM_CITAR = 'existe em scripts/regras/ e a tabela não a cita; ponha a linha na tabela do AGENTS.md ou, com a aprovação do dono, na lista do teste';
const SO_NA_TABELA = 'a tabela cita e não existe em scripts/regras/';
const JA_NA_TABELA = 'já consta na tabela; tire-a da lista de exceções do teste';
const EXCECAO_SUMIDA = 'a exceção é de uma regra que não existe mais em scripts/regras/; tire-a da lista';

function regrasSemLinha(ids, naTabela, semLinha) {
  return ids.filter(id => !naTabela.has(id) && !semLinha.includes(id)).map(id => achado(id, SEM_CITAR));
}

function regrasSoNaTabela(ids, naTabela) {
  return [...naTabela].filter(regra => !ids.includes(regra)).map(regra => achado(regra, SO_NA_TABELA));
}

const detalheDaExcecaoInutil = (regra, naTabela, ids) => {
  if (naTabela.has(regra)) return JA_NA_TABELA;
  return ids.includes(regra) ? null : EXCECAO_SUMIDA;
};

function excecoesInuteis(ids, naTabela, semLinha) {
  return semLinha
    .map(regra => achado(regra, detalheDaExcecaoInutil(regra, naTabela, ids)))
    .filter(excecao => excecao.detalhe !== null);
}

function divergencias(texto, ids, semLinha) {
  const naTabela = new Set(regrasDaTabela(texto));
  return [
    ...regrasSemLinha(ids, naTabela, semLinha),
    ...regrasSoNaTabela(ids, naTabela),
    ...excecoesInuteis(ids, naTabela, semLinha),
  ];
}

module.exports = { regrasDaTabela, divergencias };

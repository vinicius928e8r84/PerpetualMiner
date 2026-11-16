'use strict';

const SECAO = '## Rules and what enforces them';
const REGRA = /`([a-z0-9]+(?:-[a-z0-9]+)+)`/g;

function regrasDaTabela(texto) {
  const inicio = texto.indexOf(SECAO);
  if (inicio < 0) throw new Error(`falta a seção "${SECAO.slice(3)}"`);
  const resto = texto.slice(inicio + SECAO.length);
  const fim = resto.search(/^## /m);
  const secao = fim < 0 ? resto : resto.slice(0, fim);
  const regras = new Set();
  for (const linha of secao.split('\n')) {
    if (!linha.startsWith('|')) continue;
    for (const achado of linha.matchAll(REGRA)) regras.add(achado[1]);
  }
  return [...regras];
}

function divergencias(texto, ids, semLinha) {
  const naTabela = new Set(regrasDaTabela(texto));
  const achados = [];
  for (const id of ids) {
    if (!naTabela.has(id) && !semLinha.includes(id)) achados.push({ regra: id, detalhe: 'existe em scripts/regras/ e a tabela não a cita; ponha a linha na tabela do AGENTS.md ou, com a aprovação do dono, na lista do teste' });
  }
  for (const regra of naTabela) {
    if (!ids.includes(regra)) achados.push({ regra, detalhe: 'a tabela cita e não existe em scripts/regras/' });
  }
  for (const regra of semLinha) {
    if (naTabela.has(regra)) achados.push({ regra, detalhe: 'já consta na tabela; tire-a da lista de exceções do teste' });
    else if (!ids.includes(regra)) achados.push({ regra, detalhe: 'a exceção é de uma regra que não existe mais em scripts/regras/; tire-a da lista' });
  }
  return achados;
}

module.exports = { regrasDaTabela, divergencias };

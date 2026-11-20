'use strict';

const LIMITES = {
  complexidade: 8,
  aninhamento: 3,
  blocos: 1,
  operadores: 1,
  argumentos: 4,
  linhas: 69,
  mediaDoArquivo: 4,
  linhasDoPython: 599,
};

const MEDIDAS_DA_FUNCAO = [
  { medida: 'complexidade', campo: 'cc', nome: 'complexidade' },
  { medida: 'aninhamento', campo: 'aninhamento', nome: 'aninhamento' },
  { medida: 'blocos', campo: 'blocos', nome: 'blocos aninhados' },
  { medida: 'argumentos', campo: 'argumentos', nome: 'argumentos' },
  { medida: 'linhas', campo: 'linhas', nome: 'linhas' },
];

const MEDIDAS_DO_TOPO = MEDIDAS_DA_FUNCAO.filter(({ medida }) => !['argumentos', 'linhas'].includes(medida));

function excessosDaFuncao(unidade, medidas = MEDIDAS_DA_FUNCAO) {
  const excessos = medidas
    .filter(({ medida, campo }) => unidade[campo] > LIMITES[medida])
    .map(({ medida, campo, nome }) => ({
      medida, pontos: unidade[campo] - LIMITES[medida], detalhe: `${nome} ${unidade[campo]} (limite ${LIMITES[medida]})`,
    }));
  for (const operadores of unidade.condicoes) {
    excessos.push({ medida: 'operadores', pontos: operadores - LIMITES.operadores, detalhe: `condição com ${operadores} operadores lógicos (limite ${LIMITES.operadores})` });
  }
  return excessos;
}

function excessoDaMedia(unidades) {
  if (!unidades.length) return [];
  const media = unidades.reduce((soma, unidade) => soma + unidade.cc, 0) / unidades.length;
  if (media < LIMITES.mediaDoArquivo) return [];
  return [{ medida: 'media', pontos: 1, detalhe: `complexidade média das funções ${(Math.floor(media * 10) / 10).toFixed(1)} (abaixo de ${LIMITES.mediaDoArquivo})` }];
}

function excessoDoTamanho(linhasDeCodigo) {
  if (linhasDeCodigo === undefined || linhasDeCodigo <= LIMITES.linhasDoPython) return [];
  return [{ medida: 'tamanho', pontos: linhasDeCodigo - LIMITES.linhasDoPython, detalhe: `${linhasDeCodigo} linhas de código em Python (limite ${LIMITES.linhasDoPython})` }];
}

function pontuar(medicao) {
  if (medicao.erro) return [{ unidade: null, linha: 1, medida: 'leitura', pontos: 1, detalhe: `não deu para medir o arquivo: ${medicao.erro}` }];
  const daFuncao = medicao.unidades.flatMap(unidade => excessosDaFuncao(unidade)
    .map(excesso => ({ unidade: unidade.nome, linha: unidade.linha, ...excesso })));
  const doTopo = excessosDaFuncao(medicao.topo, MEDIDAS_DO_TOPO)
    .map(excesso => ({ unidade: medicao.topo.nome, linha: medicao.topo.linha, ...excesso }));
  const doArquivo = [...excessoDaMedia(medicao.unidades), ...excessoDoTamanho(medicao.linhasDeCodigo)]
    .map(excesso => ({ unidade: null, linha: 1, ...excesso }));
  return [...daFuncao, ...doTopo, ...doArquivo];
}

module.exports = { LIMITES, pontuar };

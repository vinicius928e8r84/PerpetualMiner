'use strict';

const { execFileSync } = require('child_process');

const { arquivosDoRepositorio } = require('./comum');
const { MedidorDoRepositorio, ehPython } = require('./analisador/medir');
const { LIMITES, pontuar } = require('./analisador/pontos');

const id = 'saude-do-codigo';

const conserto = 'Refatore de verdade a função que piorou: separe decidir de fazer (a decisão vira função pura com nome do domínio), '
  + 'dê nome à condição composta, troque a cascata por tabela quando ela é um mapa, agrupe argumentos num objeto que já existe no domínio '
  + 'e, se o arquivo passa do teto, divida-o por responsabilidade. Picar a função sem nome de domínio, trocar argumentos por um saco de opções '
  + 'ou esconder a lógica em closures não conta. Os limites: complexidade até '
  + `${LIMITES.complexidade}, aninhamento até ${LIMITES.aninhamento}, ${LIMITES.blocos} bloco aninhado por função, `
  + `${LIMITES.operadores} operador lógico por condição, ${LIMITES.argumentos} argumentos, ${LIMITES.linhas} linhas por função, `
  + `complexidade média abaixo de ${LIMITES.mediaDoArquivo} e ${LIMITES.linhasDoPython} linhas de código por arquivo Python. `
  + 'Depois de melhorar um arquivo da linha de base, rode `node scripts/regras/verificar.js --atualizar` e versione scripts/regras/linha-de-base.json. '
  + 'Código que sai de um arquivo para um módulo novo leva a folga junto: na mesma PR, passe os pontos do arquivo de origem para o novo '
  + 'em scripts/regras/linha-de-base.json (o total da regra não pode subir).';

const EXTENSOES = /\.(?:js|mjs|cjs|py)$/;
const FORA = /(?:^|\/)(?:node_modules|vendor|third_party|dist)\/|\.min\.[^/]+$/;

const seAplica = arquivo => EXTENSOES.test(arquivo) && !FORA.test(arquivo);

const medidores = new Map();
let ultimaComparacao = { raiz: null, base: null };

function medidorDe(raiz) {
  const chave = raiz || '';
  if (!medidores.has(chave)) {
    const doPython = raiz ? arquivosDoRepositorio(raiz).filter(arquivo => seAplica(arquivo) && ehPython(arquivo)) : [];
    medidores.set(chave, new MedidorDoRepositorio(raiz, doPython));
  }
  return medidores.get(chave);
}

const excessosDe = (arquivo, fonte, raiz) => pontuar(medidorDe(raiz).medir(arquivo, fonte));

function verificar(arquivo, fonte, raiz, base) {
  ultimaComparacao = { raiz, base };
  return excessosDe(arquivo, fonte, raiz).flatMap(excesso => Array.from({ length: excesso.pontos }, () => ({
    linha: excesso.linha, unidade: excesso.unidade, detalhe: excesso.detalhe,
  })));
}

const rotuloDe = ({ unidade, linha }) => (unidade === null ? 'o arquivo' : `${unidade} (linha ${linha})`);

function porUnidade(achados) {
  const grupos = new Map();
  for (const achado of achados) {
    const rotulo = rotuloDe(achado);
    if (!grupos.has(rotulo)) grupos.set(rotulo, { rotulo, unidade: achado.unidade, pontos: 0, detalhes: new Set() });
    const grupo = grupos.get(rotulo);
    grupo.pontos++;
    grupo.detalhes.add(achado.detalhe);
  }
  return [...grupos.values()];
}

function fonteNaBase(arquivo) {
  const { raiz, base } = ultimaComparacao;
  if (!raiz || !base) return null;
  try {
    return execFileSync('git', ['show', `${base}:${arquivo}`], { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return null;
  }
}

function pontosNaBase(arquivo) {
  const fonte = fonteNaBase(arquivo);
  if (fonte === null) return null;
  const pontos = new Map();
  for (const excesso of excessosDe(arquivo, fonte, null)) pontos.set(excesso.unidade, (pontos.get(excesso.unidade) || 0) + excesso.pontos);
  return pontos;
}

function oQuePiorou(grupos, antes) {
  if (!antes) return { titulo: 'onde estão os pontos', grupos };
  const piores = grupos.filter(grupo => grupo.pontos > (antes.get(grupo.unidade) || 0));
  if (!piores.length) return { titulo: 'onde estão os pontos', grupos };
  return { titulo: 'o que piorou em relação à base', grupos: piores, antes };
}

function linhaDoGrupo(arquivo, grupo, antes) {
  const naBase = antes ? `; eram ${antes.get(grupo.unidade) || 0} na base` : '';
  return `    ${arquivo} ${grupo.rotulo}: ${grupo.pontos} ponto(s)${naBase} — ${[...grupo.detalhes].join(', ')}`;
}

function mensagem({ arquivo, tem, pode, achados }) {
  const grupos = porUnidade(achados).sort((a, b) => b.pontos - a.pontos);
  const { titulo, grupos: mostrar, antes } = oQuePiorou(grupos, pontosNaBase(arquivo));
  return [
    `✗ ${id} — ${arquivo}: ${tem} ponto(s) acima dos limites de saúde do código; a linha de base permite ${pode}.`,
    `  ${titulo}:`,
    ...mostrar.slice(0, 12).map(grupo => linhaDoGrupo(arquivo, grupo, antes)),
    ...(mostrar.length > 12 ? [`    … e mais ${mostrar.length - 12}`] : []),
    `  Conserto: ${conserto}`,
  ].join('\n');
}

module.exports = { id, conserto, seAplica, verificar, mensagem, LIMITES };

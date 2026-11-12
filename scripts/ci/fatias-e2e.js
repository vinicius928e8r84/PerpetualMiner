'use strict';

// As fatias da suíte e2e no CI (workflow Testes, job `e2e`): cada fatia é uma lista de specs, montada pela duração
// real de cada um. O `--shard=N/8` do Playwright divide pelo número de testes e deixava uma fatia com 9 minutos e outra
// com 3, porque um teste leva de 0,9 a 9 s; o CI espera a mais lenta (relatório ci-posts-1111, seção 3.4).
//
//   node scripts/ci/fatias-e2e.js <N>             os filtros do Playwright da fatia N (o workflow os passa a `testar.mjs e2e`)
//   node scripts/ci/fatias-e2e.js --gerar         refaz as fatias a partir das durações de fatias-e2e.json
//   node scripts/ci/fatias-e2e.js --medir <log>...  atualiza as durações a partir dos logs das 8 fatias (reporter `list` do Playwright) e refaz as fatias
//
// Um spec novo entra com a estimativa ESTIMATIVA_DO_SPEC_NOVO até alguém rodar `--medir` num log do CI; test_fatias_e2e.js
// falha quando um spec ficou fora das fatias, em duas, ou quando as fatias não são o que `--gerar` faz das durações.

const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..', '..');
const ARQUIVO = path.join(__dirname, 'fatias-e2e.json');
const PASTA_DOS_SPECS = path.join(RAIZ, 'e2e', 'tests');
const NUMERO_DE_FATIAS = 8;
const ESTIMATIVA_DO_SPEC_NOVO = 10;

/** Os specs do disco, como o Playwright os acha em e2e/tests (caminho relativo a essa pasta, com `/`). */
function specsDoDisco(pasta = PASTA_DOS_SPECS) {
  const saida = [];
  const visitar = (diretorio, prefixo) => {
    for (const entrada of fs.readdirSync(diretorio, { withFileTypes: true })) {
      if (entrada.isDirectory()) visitar(path.join(diretorio, entrada.name), `${prefixo}${entrada.name}/`);
      else if (/\.spec\.js$/.test(entrada.name)) saida.push(`${prefixo}${entrada.name}`);
    }
  };
  visitar(pasta, '');
  return saida.sort();
}

/** Do mais longo ao mais curto, cada spec vai para a fatia mais vazia; empate: a de menor número. Dentro da fatia, por nome. */
function montarFatias(duracoes, quantas = NUMERO_DE_FATIAS) {
  const fatias = Array.from({ length: quantas }, () => ({ specs: [], segundos: 0 }));
  const ordem = Object.entries(duracoes).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  for (const [spec, segundos] of ordem) {
    const alvo = fatias.reduce((menor, fatia) => (fatia.segundos < menor.segundos ? fatia : menor));
    alvo.specs.push(spec);
    alvo.segundos += segundos;
  }
  return fatias.map(fatia => fatia.specs.sort());
}

/** O que está errado entre os specs do disco, as durações e as fatias; lista vazia quando está tudo certo. */
function problemas({ duracoes, fatias }, specs) {
  const achados = [];
  const lugares = new Map();
  fatias.forEach((lista, i) => lista.forEach(spec => lugares.set(spec, [...(lugares.get(spec) || []), i + 1])));
  for (const spec of specs) {
    const onde = lugares.get(spec) || [];
    if (onde.length === 0) achados.push(`${spec} não está em nenhuma fatia`);
    if (onde.length > 1) achados.push(`${spec} está em ${onde.length} fatias (${onde.join(', ')})`);
    if (!(spec in duracoes)) achados.push(`${spec} não tem duração`);
  }
  for (const spec of lugares.keys()) if (!specs.includes(spec)) achados.push(`${spec} está numa fatia mas não existe em e2e/tests`);
  for (const spec of Object.keys(duracoes)) if (!specs.includes(spec)) achados.push(`${spec} tem duração mas não existe em e2e/tests`);
  return achados;
}

/** Os filtros do Playwright de uma fatia: o caminho do spec como expressão regular, ancorado no fim e depois de `tests/`. */
function filtros(specs) {
  return specs.map(spec => `tests/${spec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}

/** Soma, por spec, a duração dos testes que passaram numa saída do reporter `list` do Playwright. */
function duracoesDosLogs(textos) {
  const soma = {};
  const linha = /(?:✓|ok)\s+\d+\s+(?:\[[^\]]+\]\s+›\s+)?([\w./-]+\.spec\.js):\d+:\d+ › .*?\((\d+(?:\.\d+)?)(ms|s|m)\)\s*$/;
  for (const texto of textos) {
    for (const bruta of texto.split('\n')) {
      const m = linha.exec(bruta.replace(/\x1b\[[0-9;]*[A-Za-z]/g, ''));
      if (!m) continue;
      const valor = Number(m[2]) * { ms: 0.001, s: 1, m: 60 }[m[3]];
      const spec = m[1].replace(/^tests\//, '');
      soma[spec] = (soma[spec] || 0) + valor;
    }
  }
  return soma;
}

const ler = () => JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));

function gravar(duracoes) {
  const ordenado = Object.fromEntries(Object.keys(duracoes).sort().map(spec => [spec, duracoes[spec]]));
  const fatias = montarFatias(ordenado);
  const linhas = [
    '{',
    '  "descricao": "As fatias da suíte e2e no CI, montadas pela duração (segundos) de cada spec; não edite à mão: node scripts/ci/fatias-e2e.js --gerar (ou --medir <log>...). Ver o cabeçalho de scripts/ci/fatias-e2e.js.",',
    '  "duracoes": {',
    ...Object.keys(ordenado).map((spec, i, todos) => `    ${JSON.stringify(spec)}: ${ordenado[spec]}${i < todos.length - 1 ? ',' : ''}`),
    '  },',
    '  "fatias": [',
    ...fatias.map((lista, i) => `    ${JSON.stringify(lista)}${i < fatias.length - 1 ? ',' : ''}`),
    '  ]',
    '}',
    '',
  ];
  fs.writeFileSync(ARQUIVO, linhas.join('\n'));
}

/** As durações de hoje para os specs do disco: as já medidas, a estimativa para os novos, sem as de spec que sumiu. */
function duracoesParaOsSpecs(duracoes, specs) {
  return Object.fromEntries(specs.map(spec => [spec, spec in duracoes ? duracoes[spec] : ESTIMATIVA_DO_SPEC_NOVO]));
}

module.exports = { ARQUIVO, NUMERO_DE_FATIAS, duracoesDosLogs, duracoesParaOsSpecs, filtros, ler, montarFatias, problemas, specsDoDisco };

if (require.main === module) {
  const [pedido, ...resto] = process.argv.slice(2);
  const specs = specsDoDisco();
  if (pedido === '--gerar') {
    gravar(duracoesParaOsSpecs(ler().duracoes, specs));
  } else if (pedido === '--medir' && resto.length) {
    const medidas = duracoesDosLogs(resto.map(arquivo => fs.readFileSync(arquivo, 'utf8')));
    // Um spec sem teste que passou nos logs (só pulados) custa quase nada: 1 s.
    gravar(Object.fromEntries(specs.map(spec => [spec, Math.max(1, Math.round(medidas[spec] || 0))])));
  } else if (/^\d+$/.test(pedido || '')) {
    const { fatias } = ler();
    const numero = Number(pedido);
    if (numero < 1 || numero > fatias.length) {
      console.error(`fatia ${numero} não existe: são ${fatias.length}`);
      process.exit(2);
    }
    console.log(filtros(fatias[numero - 1]).join(' '));
  } else {
    console.error('uso: node scripts/ci/fatias-e2e.js <N> | --gerar | --medir <log>...');
    process.exit(2);
  }
}

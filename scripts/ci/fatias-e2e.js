'use strict';

// As fatias da suíte e2e no CI (workflow Testes, job `e2e`): cada fatia é uma lista de specs, montada pela duração
// real de cada um. O `--shard=N/8` do Playwright divide pelo número de testes e deixava uma fatia com 9 minutos e outra
// com 3, porque um teste leva de 0,9 a 9 s; o CI espera a mais lenta (relatório ci-posts-1111, seção 3.4).
//
//   node scripts/ci/fatias-e2e.js <N>             os filtros do Playwright da fatia N (o workflow os passa a `testar.mjs e2e`)

const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..', '..');
const ARQUIVO = path.join(__dirname, 'fatias-e2e.json');
const PASTA_DOS_SPECS = process.env.FATIAS_E2E_PASTA || path.join(RAIZ, 'e2e', 'tests');
const NUMERO_DE_FATIAS = 8;
const ESTIMATIVA_DO_SPEC_NOVO = 10;

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

function lugaresDosSpecs(fatias) {
  const lugares = new Map();
  for (const [i, lista] of fatias.entries()) {
    for (const spec of lista) lugares.set(spec, [...(lugares.get(spec) || []), i + 1]);
  }
  return lugares;
}

function achadosDoSpec(spec, onde, duracoes) {
  const achados = [];
  if (onde.length === 0) achados.push(`${spec} não está em nenhuma fatia`);
  if (onde.length > 1) achados.push(`${spec} está em ${onde.length} fatias (${onde.join(', ')})`);
  if (!(spec in duracoes)) achados.push(`${spec} não tem duração`);
  return achados;
}

const semSpecNoDisco = (nomes, specs, descricao) => nomes.filter(nome => !specs.includes(nome)).map(nome => `${nome} ${descricao}`);

function problemas({ duracoes, fatias }, specs) {
  const lugares = lugaresDosSpecs(fatias);
  return [
    ...specs.flatMap(spec => achadosDoSpec(spec, lugares.get(spec) || [], duracoes)),
    ...semSpecNoDisco([...lugares.keys()], specs, 'está numa fatia mas não existe em e2e/tests'),
    ...semSpecNoDisco(Object.keys(duracoes), specs, 'tem duração mas não existe em e2e/tests'),
  ];
}

function filtros(specs) {
  return specs.map(spec => `tests/${spec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}

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

const fatiasDe = (duracoes, specs, quantas = NUMERO_DE_FATIAS) => montarFatias(duracoesParaOsSpecs(duracoes, specs), quantas);

function gravar(duracoes) {
  const ordenado = Object.fromEntries(Object.keys(duracoes).sort().map(spec => [spec, duracoes[spec]]));
  const linhas = [
    '{',
    '  "descricao": "As durações (segundos) de cada spec da suíte e2e no CI, medidas nos logs; as fatias saem delas em scripts/ci/fatias-e2e.js. Não edite à mão: node scripts/ci/fatias-e2e.js --medir <log>... Ver o cabeçalho desse script.",',
    '  "duracoes": {',
    ...Object.keys(ordenado).map((spec, i, todos) => `    ${JSON.stringify(spec)}: ${ordenado[spec]}${i < todos.length - 1 ? ',' : ''}`),
    '  }',
    '}',
    '',
  ];
  fs.writeFileSync(ARQUIVO, linhas.join('\n'));
}

function duracoesParaOsSpecs(duracoes, specs) {
  return Object.fromEntries(specs.map(spec => [spec, spec in duracoes ? duracoes[spec] : ESTIMATIVA_DO_SPEC_NOVO]));
}

module.exports = { ARQUIVO, ESTIMATIVA_DO_SPEC_NOVO, NUMERO_DE_FATIAS, duracoesDosLogs, duracoesParaOsSpecs, fatiasDe, filtros, ler, montarFatias, problemas, specsDoDisco };

function medirNosLogs(arquivos, specs) {
  const medidas = duracoesDosLogs(arquivos.map(arquivo => fs.readFileSync(arquivo, 'utf8')));
  gravar(Object.fromEntries(specs.map(spec => [spec, Math.max(1, Math.round(medidas[spec] || 0))])));
  return 0;
}

function imprimirFatia(numero, specs) {
  const fatias = fatiasDe(ler().duracoes, specs);
  if (numero < 1 || numero > fatias.length) {
    console.error(`fatia ${numero} não existe: são ${fatias.length}`);
    return 2;
  }
  console.log(filtros(fatias[numero - 1]).join(' '));
  return 0;
}

function executar([pedido = '', ...resto], specs) {
  if (pedido === '--medir' && resto.length) return medirNosLogs(resto, specs);
  if (/^\d+$/.test(pedido)) return imprimirFatia(Number(pedido), specs);
  console.error('uso: node scripts/ci/fatias-e2e.js <N> | --medir <log>...');
  return 2;
}

if (require.main === module) {
  const codigo = executar(process.argv.slice(2), specsDoDisco());
  if (codigo !== 0) process.exit(codigo);
}

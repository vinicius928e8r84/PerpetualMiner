import { ESLint } from 'eslint';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '..', '..', '..');
const PROVA = 'docs/design/prova-xstate-v6';

const MEDIDOS = {
  'painel-envio.js': {
    linhas: 491,
    recortes: [
      ['fora', 14, 22], ['fora', 46, 60], ['fora', 85, 89], ['fora', 119, 121], ['fora', 278, 300], ['fora', 321, 328],
      ['fora', 380, 384], ['misto', 386, 430], ['fora', 472, 488],
    ],
    resto: 'ciclo',
  },
  'painel-envio-estado.js': { linhas: 111, recortes: [['fase', 97, 108]], resto: 'reusado' },
  [`${PROVA}/remessa.js`]: { resto: 'maquina' },
  [`${PROVA}/fase-da-remessa-fsm.js`]: { resto: 'fsm' },
};

const eslint = new ESLint({
  cwd: RAIZ,
  overrideConfigFile: true,
  overrideConfig: [{
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'script' },
    rules: { complexity: ['warn', { max: 0, variant: 'classic' }] },
  }],
});

async function medir(arquivo) {
  const { linhas, recortes = [], resto } = MEDIDOS[arquivo];
  const tem = fs.readFileSync(path.join(RAIZ, arquivo), 'utf8').split('\n').length - 1;
  if (linhas && tem !== linhas) throw new Error(`${arquivo} tem ${tem} linhas, e os recortes foram feitos com ${linhas}: refaça os recortes antes de medir`);
  const [resultado] = await eslint.lintFiles([arquivo]);
  if (resultado.fatalErrorCount) throw new Error(`${arquivo}: ${resultado.messages[0].message}`);
  return resultado.messages.filter(m => m.ruleId === 'complexity').map(m => {
    const lido = /^(.*?) has a complexity of (\d+)/.exec(m.message);
    const nome = /'([^']+)'/.exec(lido[1])?.[1] ?? '(anônima)';
    const recorte = recortes.find(([, de, ate]) => m.line >= de && m.line <= ate)?.[0] ?? resto;
    return { arquivo, nome: `${nome}:${m.line}`, complexidade: Number(lido[2]), recorte, linhasDoArquivo: tem };
  });
}

function resumo(funcoes) {
  const valores = funcoes.map(f => f.complexidade);
  const soma = valores.reduce((a, b) => a + b, 0);
  return {
    funcoes: valores.length,
    soma,
    decisoes: soma - valores.length,
    maxima: Math.max(0, ...valores),
    media: valores.length ? Number((soma / valores.length).toFixed(2)) : 0,
    acimaDe10: valores.filter(v => v > 10).length,
  };
}

const todas = (await Promise.all(Object.keys(MEDIDOS).map(medir))).flat();
const de = (...recortes) => todas.filter(f => recortes.includes(f.recorte));
const doArquivo = arquivo => todas.filter(f => f.arquivo === arquivo);
const maiores = lista => [...lista].sort((a, b) => b.complexidade - a.complexidade).slice(0, 5).map(f => `${f.nome}=${f.complexidade}`).join(', ');

const LINHAS = [
  ['ANTES  painel-envio.js inteiro', doArquivo('painel-envio.js')],
  ['ANTES  painel-envio-estado.js inteiro', doArquivo('painel-envio-estado.js')],
  ['antes  (a) FaseDaRemessa feita à mão (estado.js 97-108)', de('fase')],
  ['antes  (b) ciclo da Remessa em painel-envio.js', de('ciclo')],
  ['antes  (c) tentarAbrirResumo: decide e desenha (misto)', de('misto')],
  ['antes  (d) tela e Anki fechado: a prova não refaz', de('fora')],
  ['antes  (e) SituacaoDoEnvio: a prova reusa como está', de('reusado')],
  ['DEPOIS fase-da-remessa-fsm.js    → compara com (a)', de('fsm')],
  ['DEPOIS remessa.js                → compara com (a)+(b)+(c)', de('maquina')],
];

console.log(`ferramenta: eslint ${ESLint.version}, regra complexity, variant classic; "decisões" = soma − funções`);
console.log(`${'recorte'.padEnd(60)} func  soma decisões máxima  média  >10`);
for (const [rotulo, funcoes] of LINHAS) {
  const r = resumo(funcoes);
  console.log(`${rotulo.padEnd(60)} ${String(r.funcoes).padStart(4)} ${String(r.soma).padStart(5)} ${String(r.decisoes).padStart(8)} ${String(r.maxima).padStart(6)} ${String(r.media).padStart(6)} ${String(r.acimaDe10).padStart(4)}`);
}
console.log(`\nmaiores de (b)+(c): ${maiores(de('ciclo', 'misto'))}`);
console.log(`maiores de remessa.js: ${maiores(de('maquina'))}`);
console.log(`linhas: painel-envio.js ${doArquivo('painel-envio.js')[0].linhasDoArquivo}, remessa.js ${de('maquina')[0].linhasDoArquivo}, fase-da-remessa-fsm.js ${de('fsm')[0].linhasDoArquivo}`);
if (process.argv.includes('--json')) console.log(JSON.stringify(todas));

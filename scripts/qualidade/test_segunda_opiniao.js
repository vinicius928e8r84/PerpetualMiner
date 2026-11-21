'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { achadosDoQlty } = require('./achados-do-qlty');
const { achadosDoMedidor } = require('./achados-do-medidor');
const { compararArquivo } = require('./comparar');
const { relatorio } = require('./relatorio');
const { segundaOpiniao, lerArgumentos } = require('./segunda-opiniao');
const { LIMITES } = require('../regras/analisador/pontos');
const { raizTemporaria } = require('../regras/apoio-sem-comentario');

const RAIZ = path.resolve(__dirname, '..', '..');

let total = 0;
const prova = (achado, esperado, porque) => { assert.deepStrictEqual(achado, esperado, porque); total++; };

const resultado = ({ regra, arquivo, linha, fim, texto, valor }) => ({
  ruleId: regra,
  message: { text: texto },
  locations: [{ physicalLocation: { artifactLocation: { uri: arquivo }, region: { startLine: linha, endLine: fim } } }],
  properties: { actual: valor },
});
const sarif = (...resultados) => JSON.stringify({ runs: [{ tool: { driver: { semanticVersion: '9.9.9' } }, results: resultados }] });

const doQlty = achadosDoQlty(sarif(
  resultado({ regra: 'qlty:function-complexity', arquivo: 'a.js', linha: 3, fim: 9, texto: 'Function with high complexity (count = 12): decidir', valor: 12 }),
  resultado({ regra: 'qlty:nested-control-flow', arquivo: 'a.js', linha: 7, texto: 'Deeply nested control flow (level = 4)', valor: 4 }),
  resultado({ regra: 'qlty:identical-code', arquivo: 'b.py', linha: 1, texto: 'Found 20 lines of identical code in 2 locations (mass = 90)', valor: 20 }),
  resultado({ regra: 'qlty:regra-nova', arquivo: 'b.py', linha: 2, texto: 'Algo novo', valor: 1 }),
));
prova(doQlty.versao, '9.9.9', 'a versão do Qlty sai do SARIF');
prova(doQlty.porArquivo.get('a.js').map(({ categoria, funcao, fim, rotulo }) => [categoria, funcao, fim, rotulo]), [
  ['complexidade', 'decidir', 9, '`decidir` (l. 3): complexidade cognitiva 12'],
  ['aninhamento', null, 7, 'l. 7: nível 4'],
], 'o achado do Qlty ganha a categoria comum, o nome da função que a mensagem traz, o valor e a última linha (a primeira, se o SARIF não diz)');
prova(doQlty.porArquivo.get('b.py').map(({ categoria, rotulo }) => [categoria, rotulo]), [
  ['duplicacao', 'l. 1: linhas idênticas 20'],
  ['outra-do-qlty', 'l. 2: Algo novo'],
], 'a duplicação é uma categoria; uma regra que o Qlty acrescentar entra como "outra regra do Qlty", com a mensagem dele');

const achado = (categoria, linha, funcao, rotulo) => ({ categoria, linha, funcao, rotulo, pontos: 1 });
const medicao = (achados, linhas) => ({ achados, linhasDasFuncoes: new Set(linhas) });
const motivos = comparacao => comparacao.motivos.map(({ categoria, quem, onde }) => [categoria, quem, onde]);

const fabrica = { ...achado('complexidade', 50, 'fabrica', 'q-fabrica'), fim: 60 };
let c = compararArquivo({
  arquivo: 'a.js',
  medicao: medicao([achado('complexidade', 3, 'decidir', 'm-decidir'), achado('complexidade', 20, 'plana', 'm-plana')], [3, 20, 30, 50, 52]),
  doQlty: [achado('complexidade', 3, 'decidir', 'q-decidir'), { ...achado('complexidade', 30, 'funda', 'q-funda'), fim: 35 }, achado('complexidade', 40, 'cb', 'q-cb'), fabrica],
});
prova(c.contagem.complexidade, { ambos: 1, soMedidor: 1, soQlty: 3 }, 'a complexidade é comparada função a função, pela linha em que a função começa');
prova(motivos(c), [
  ['complexidade', 'medidor', ['m-plana']],
  ['complexidade', 'qlty', ['q-funda']],
  ['complexidade', 'qlty', ['q-cb']],
  ['complexidade', 'qlty', ['q-fabrica']],
], 'cada lado diz onde só ele acusa, e o que só o Qlty acusa se agrupa pelo motivo');
prova(c.motivos.slice(1).map(item => item.porque.slice(0, 40)), [
  'a cognitiva do Qlty multiplica o peso do',
  'o medidor, como o CodeScene, não mede es',
  'o Qlty soma à função a complexidade das ',
], 'a função que o medidor não mede sozinha e a que tem funções com nome dentro têm o próprio porquê');
prova([c.quemDiscorda, c.pontos, c.achadosDoQlty], ['ninguém', 2, 4], 'os dois acusam o arquivo: concordam no veredito, e as diferenças ficam nos motivos');

c = compararArquivo({ arquivo: 'a.js', medicao: medicao([achado('aninhamento', 1, 'f', 'm')], [1]), doQlty: [achado('aninhamento', 5, null, 'q')] });
prova([c.contagem.aninhamento, c.motivos], [{ ambos: 1, soMedidor: 0, soQlty: 0 }, []], 'o aninhamento é comparado no arquivo: os dois acusam, não há motivo');
c = compararArquivo({ arquivo: 'a.js', doQlty: [achado('condicao', 5, null, 'q'), achado('retornos', 9, 'f', 'r')] });
prova([c.quemDiscorda, motivos(c)], ['só o Qlty acusa', [['condicao', 'qlty', ['q']], ['retornos', 'qlty', ['r']]]],
  'sem nota do CodeScene e sem medição, o Qlty acusa sozinho, e o que só ele mede aparece também');
c = compararArquivo({ arquivo: 'a.js', medicao: medicao([achado('funcao-longa', 1, 'f', 'm')], [1]) });
prova([c.quemDiscorda, motivos(c)], ['só o medidor acusa', [['funcao-longa', 'medidor', ['m']]]], 'o medidor acusa sozinho o que o Qlty não mede');

const comNota = (nota, achadosDoMedidor, achadosDoQltyNoArquivo) => compararArquivo({
  arquivo: 'a.js', nota, medicao: medicao(achadosDoMedidor, [1]), doQlty: achadosDoQltyNoArquivo,
});
const longa = [achado('funcao-longa', 1, 'f', 'm')];
const retornos = [achado('retornos', 1, 'f', 'q')];
const doCodeScene = comparacao => comparacao.motivos.filter(item => item.categoria === 'codescene').map(item => [item.quem, item.porque.slice(0, 30)]);
c = comNota(7.5, longa, []);
prova([c.quemDiscorda, doCodeScene(c)], ['o Qlty', [['qlty', 'o Qlty não acusa nada do que o']]], 'com nota abaixo de 10, quem não acusa nada discorda do CodeScene');
c = comNota(7.5, [], retornos);
prova([c.quemDiscorda, doCodeScene(c)], ['o medidor', [['medidor', 'o CodeScene acusa o que o medi']]], 'o medidor limpo discorda da nota baixa');
c = comNota(10, longa, retornos);
prova([c.quemDiscorda, doCodeScene(c).map(([quem]) => quem)], ['o medidor e o Qlty', ['medidor', 'qlty']], 'com nota 10, quem acusa discorda');
c = comNota(10, [], []);
prova([c.quemDiscorda, c.motivos], ['ninguém', []], 'nota 10 e nada acusado: todos concordam');

const texto = relatorio({
  commit: 'abc1234',
  versaoDoQlty: '9.9.9',
  notas: { fonte: 'os prints', commit: '351523da' },
  comparacoes: [
    compararArquivo({ arquivo: 'muda.js', medicao: medicao([achado('condicao', 2, 'f', 'a || b')], [2]) }),
    comNota(7.5, longa, []),
    compararArquivo({ arquivo: 'parado.js' }),
  ],
  arquivosDaPr: ['muda.js', 'leia.md'],
});
prova(texto.includes('### Os arquivos desta PR (1)\n'), true, 'a seção da PR só tem os arquivos medidos que a PR muda');
prova(texto.includes('| `muda.js` | — | 1 | 0 | só o medidor acusa | **condição composta**, só o medidor acusa (a \\|\\| b): '), true,
  'a linha do arquivo diz quem discorda e por quê, e o `|` do conteúdo não quebra a tabela');
prova(texto.includes('| `a.js` | 7,50 | 1 | 0 | o Qlty | **função longa**, só o medidor mede (m): o Qlty não mede o tamanho da função<br>**nota do CodeScene**: '), true,
  'o arquivo com nota aparece na seção do CodeScene, com a nota em vírgula');
prova(texto.includes('| só o medidor | 2 |'), true, 'o resumo do repositório conta os arquivos que cada ferramenta acusa sozinha');
prova(texto.includes('commit `351523da`'), true, 'o cabeçalho diz de onde vêm as notas do CodeScene');

const vazio = relatorio({ commit: 'abc1234', versaoDoQlty: '9.9.9', notas: { fonte: 'x', commit: 'y' }, comparacoes: [], arquivosDaPr: [] });
prova(['A PR não muda nenhum', 'Nenhum arquivo medido tem nota', 'não discordam em nenhum arquivo'].map(frase => vazio.includes(frase)), [true, true, true],
  'cada seção vazia diz que está vazia');

const toml = fs.readFileSync(path.join(RAIZ, '.qlty', 'qlty.toml'), 'utf8');
const limiarDoQlty = secao => Number(new RegExp(`\\[smells\\.${secao}\\]\\s*threshold = (\\d+)`).exec(toml)[1]);
prova(
  ['function_complexity', 'function_parameters', 'nested_control_flow', 'boolean_logic'].map(limiarDoQlty),
  [LIMITES.complexidade + 1, LIMITES.argumentos + 1, LIMITES.aninhamento + 1, LIMITES.operadores + 1],
  'o Qlty acusa a partir do primeiro valor que o medidor pontua, então uma diferença vem da forma de contar, não do limite',
);

const { raiz, gravar, commit } = raizTemporaria();
const OITO_DESVIOS = ['a', 'b', 'a > 1', 'b > 1', 'a > 2', 'b > 2', 'a > 3', 'b > 3'];
gravar({ 'parado.py': 'def f(a):\n    return a\n', 'leia.md': 'oi\n' });
commit('base');
gravar({ 'novo.js': `function decidir(a, b) {\n${OITO_DESVIOS.map(teste => `  if (${teste}) return 1;`).join('\n')}\n  return 0;\n}\n` });
commit('mudança');
const medidas = achadosDoMedidor(raiz);
prova([...medidas.keys()], ['novo.js', 'parado.py'], 'o medidor mede os arquivos .js e .py do repositório, com o analisador da regra saude-do-codigo');
prova(medidas.get('novo.js').achados.map(({ categoria, rotulo }) => [categoria, rotulo]),
  [['complexidade', '`decidir` (l. 1): complexidade 9 (limite 8)'], ['arquivo', 'complexidade média das funções 9.0 (abaixo de 4)']],
  'o excesso da regra vira achado com a categoria comum');

const arquivoSarif = path.join(raiz, 'qlty.sarif');
fs.writeFileSync(arquivoSarif, sarif(resultado({
  regra: 'qlty:return-statements', arquivo: 'novo.js', linha: 1, texto: 'Function with many returns (count = 9): decidir', valor: 9,
})));
const opiniao = segundaOpiniao({ raiz, sarif: arquivoSarif, notas: path.join(__dirname, 'notas-do-codescene.json'), base: 'HEAD~1' });
prova(opiniao.comparacoes.map(({ arquivo, pontos, achadosDoQlty: n }) => [arquivo, pontos, n]), [['novo.js', 2, 1], ['parado.py', 0, 0]],
  'a segunda opinião junta o medidor e o SARIF do Qlty por arquivo');
prova(opiniao.texto.includes('### Os arquivos desta PR (1)\n'), true, 'a seção da PR vem do diff contra a base');

const pelaLinha = spawnSync('node', [path.join(__dirname, 'segunda-opiniao.js'), '--sarif'], { encoding: 'utf8' });
prova([pelaLinha.status !== 0, /argumento desconhecido ou sem valor: --sarif/.test(pelaLinha.stderr)], [true, true], 'uma opção sem valor falha e mostra o uso');
prova(lerArgumentos(['--sarif', 'x', '--base', 'origin/main']).base, 'origin/main', 'as opções viram campos');
assert.throws(() => lerArgumentos([]), /uso:/, 'sem --sarif, mostra o uso');
total++;

fs.rmSync(raiz, { recursive: true, force: true });
console.log(`segunda opinião: ${total} provas passaram`);

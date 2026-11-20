'use strict';

const assert = require('assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const regra = require('./saude-do-codigo');
const { medirJs } = require('./analisador/medir-js');
const { rodarOPython } = require('./analisador/medir');
const { pontuar } = require('./analisador/pontos');
const { raizTemporaria } = require('./apoio-sem-comentario');

const RAIZ = path.resolve(__dirname, '..', '..');
const COMMIT_DA_ANALISE_DO_CODESCENE = '351523da';

let total = 0;
const prova = (achado, esperado, porque) => { assert.deepStrictEqual(achado, esperado, porque); total++; };

const js = (...linhas) => `${linhas.join('\n')}\n`;
const unidadeJs = (fonte, nome) => medirJs(fonte).unidades.find(unidade => unidade.nome === nome);
const medidaJs = (fonte, nome, campo) => unidadeJs(fonte, nome)[campo];
const py = (...linhas) => `${linhas.join('\n')}\n`;
const medirPy = fonte => rodarOPython({ 'a.py': fonte })['a.py'];
const unidadePy = (fonte, nome) => medirPy(fonte).unidades.find(unidade => unidade.nome === nome);
const pontosDe = medicao => pontuar(medicao).map(({ unidade, medida, pontos }) => `${unidade} ${medida} ${pontos}`);
const pontosDasFuncoes = medicao => pontosDe(medicao).filter(pontos => !pontos.startsWith('null media'));

const TODOS_OS_DESVIOS = js(
  'function escolher(a, b, lista) {',
  '  if (a) return 1;',
  '  const x = a ? b : null;',
  '  const y = a && b;',
  '  const z = a ?? b;',
  '  const w = a?.b;',
  '  for (const item of lista) b(item);',
  '  try { b(); } catch { b(); }',
  '  switch (a) { case 1: break; default: break; }',
  '  return [x, y, z, w];',
  '}',
);
prova(medidaJs(TODOS_OS_DESVIOS, 'escolher', 'cc'), 9, 'if, ?:, &&, ??, ?., laço, catch e case somam um cada, como o CodeScene conta campo em painel-anki-estilo.js');
prova(pontosDasFuncoes(medirJs(TODOS_OS_DESVIOS)), ['escolher complexidade 1'], 'complexidade 9 passa um ponto do limite 8');
prova(medidaJs(js('function f(lista) {', '  return lista.map(x => {', '    if (x) return 1;', '    return x ? 2 : 3;', '  });', '}'), 'f', 'cc'), 3,
  'o callback anônimo conta dentro da função que o contém');
prova(medirJs(js('const dobro = x => x * 2;', 'const soma = (a, b) =>', '  a + b;')).unidades, [], 'a seta de uma ou duas linhas não é função à parte');

const ANINHADA = js('function fora() {', '  function dentro(a) {', '    if (a) return 1;', '    return 2;', '  }', '  return dentro;', '}');
prova(medirJs(ANINHADA).unidades.map(({ nome, cc, linhas }) => [nome, cc, linhas]), [['fora', 1, 3], ['dentro', 2, 4]],
  'a função com nome dentro de outra é medida à parte, e as linhas dela saem das do pai');
const corpo = n => Array.from({ length: n }, (_, i) => `  const v${i} = ${i};`);
prova(pontosDe(medirJs(js('function longa() {', ...corpo(67), '}'))), [], '69 linhas cabem');
prova(pontosDe(medirJs(js('function longa() {', ...corpo(68), '}'))), ['longa linhas 1'], '70 linhas passam um ponto');

const FUNDA = js('function funda(a) {', '  if (a) {', '    for (const b of a) {', '      if (b) {', '        while (b.c) b.c--;', '      }', '    }', '  }', '}');
prova(medidaJs(FUNDA, 'funda', 'aninhamento'), 4, 'if, for, if e while: profundidade 4');
prova(pontosDasFuncoes(medirJs(FUNDA)), ['funda aninhamento 1'], 'profundidade 4 passa um ponto do limite 3');
const CADEIA = js('function rota(a) {', '  if (a === 1) return 1;', '  else if (a === 2) return 2;', '  else if (a === 3) return 3;', '  else return 4;', '}');
prova(medidaJs(CADEIA, 'rota', 'aninhamento'), 1, 'o else if fica no nível do if');
const ESBURACADA = js('function estrada(a, b) {', '  if (a) {', '    if (b) a();', '  }', '  for (const c of b) {', '    if (c) b(c);', '  }', '}');
prova(medidaJs(ESBURACADA, 'estrada', 'blocos'), 2, 'dois blocos com lógica aninhada');
prova(pontosDasFuncoes(medirJs(ESBURACADA)), ['estrada blocos 1'], 'o segundo bloco aninhado é um ponto');

const CONDICOES = js(
  'function decidir(a, b, c, d) {',
  '  if (a && b || c) return 1;',
  '  if (a && b && c && d) return 2;',
  '  if (a && [b, c].some(x => x && d)) return 3;',
  '  return a || b ? c : d;',
  '}',
);
prova(medidaJs(CONDICOES, 'decidir', 'condicoes'), [2, 3], 'conta os && e || de cada condição, não os do callback; a condição de um operador não conta');
prova(pontosDasFuncoes(medirJs(CONDICOES)).filter(p => p.includes('operadores')), ['decidir operadores 1', 'decidir operadores 2'],
  'cada operador além do primeiro numa condição é um ponto');
prova(pontosDe(medirJs(js('function cinco(a, b, c, d, e) {', '  return [a, b, c, d, e];', '}'))), ['cinco argumentos 1'], 'cinco argumentos passam um');
prova(pontosDe(medirJs(js('function quatro(a, b, c, d) {', '  return [a, b, c, d];', '}'))), [], 'quatro argumentos cabem');

const NOMES = js(
  '(function () {',
  '  function noModulo() {',
  '    return 1;',
  '  }',
  '  class Fila {',
  '    andar() {',
  '      return 2;',
  '    }',
  '  }',
  '  const objeto = {',
  '    guardar() {',
  '      return 3;',
  '    },',
  '  };',
  '  objeto.ler = function () {',
  '    return 4;',
  '  };',
  '  return [noModulo, Fila, objeto];',
  '})();',
);
prova(medirJs(NOMES).unidades.map(unidade => unidade.nome), ['noModulo', 'andar', 'guardar', 'ler'],
  'o invólucro (function () { … })() do módulo é transparente; métodos e funções atribuídas levam o nome');
const MEDIA = js(
  'function a(x) {', '  if (x) return 1;', '  if (x > 1) return 2;', '  return x ? 3 : 4;', '}',
  'function b(x) {', '  if (x) return 1;', '  if (x > 1) return 2;', '  return x ? 3 : 4;', '}',
);
prova(pontosDe(medirJs(MEDIA)), ['null media 1'], 'complexidade média 4,0 é um ponto, como o Overall Code Complexity do CodeScene, uma vez por arquivo');
prova(pontosDe(medirJs(TODOS_OS_DESVIOS)), ['escolher complexidade 1', 'null media 1'], 'a média 9 de uma função só também é um ponto: dividir o arquivo não multiplica a média');
prova(pontosDe(medirJs(`${MEDIA}function c(x) {\n  return x;\n}\n`)), [], 'média abaixo de 4 não pontua');
prova(medirJs('function (').erro !== undefined, true, 'o JavaScript que não se lê vira erro, não silêncio');
prova(pontosDe(medirJs('function (')), ['null leitura 1'], 'e o arquivo que não se lê pontua');

const PY_ANINHADA = py(
  'def fora(a):', '    def dentro(b):', '        if b:', '            return 1', '        return 2', '    if a:', '        return dentro(a)', '    return 0',
);
prova(medirPy(PY_ANINHADA).unidades.map(({ nome, cc }) => [nome, cc]), [['fora', 3]], 'no Python o def aninhado conta dentro do pai, como no Bumpy Road de envio.py');
const PY_CADEIA = py('def rota(a):', '    if a == 1:', '        return 1', '    elif a == 2:', '        return 2', '    elif a == 3 and a or a:', '        return 3', '    return 4');
prova(['cc', 'aninhamento', 'condicoes'].map(campo => unidadePy(PY_CADEIA, 'rota')[campo]), [6, 1, [2]], 'o elif soma e não aninha; o and e o or contam');
const PY_CLASSE = py(
  'class Fila:', '    def __init__(self, a, b, c, d, *resto, **nomeados):', '        self.a = [x for x in a if x if b]',
  '    @classmethod', '    def criar(cls, a):', '        return cls(a, 1, 2, 3)',
);
prova(medirPy(PY_CLASSE).unidades.map(({ nome, argumentos, cc }) => [nome, argumentos, cc]), [['Fila.__init__', 6, 4], ['Fila.criar', 1, 1]],
  'o método leva o nome da classe; self e cls não contam, *resto e **nomeados contam; o for e os ifs da compreensão somam');
prova(pontosDasFuncoes(medirPy(PY_CLASSE)), ['Fila.__init__ argumentos 2'], 'seis argumentos passam dois');
prova(pontosDe(medirPy(py(...Array.from({ length: 601 }, (_, i) => `v${i} = ${i}`)))), ['null tamanho 2'], 'Python com 601 linhas de código passa dois do limite 599');
prova(pontosDe(medirPy(py('# comentário', '', ...Array.from({ length: 599 }, (_, i) => `v${i} = ${i}`)))), [], 'comentário e linha em branco não contam');
prova(pontosDe(medirPy('def (:\n')), ['null leitura 1'], 'o Python que não se lê pontua');

for (const arquivo of ['background.js', 'lib/x.mjs', 'scripts/a.cjs', 'complemento/envio.py', 'e2e/tests/a.spec.js', '.agents/skills/x/y.js']) {
  prova(regra.seAplica(arquivo), true, `${arquivo} é código medido`);
}
for (const arquivo of ['e2e/node_modules/x.js', 'lib/vendor/x.js', 'lib/marked.min.js', 'dist/a.js', 'painel.css', 'dados.json', 'scripts/ganchos/pre-push']) {
  prova(regra.seAplica(arquivo), false, `${arquivo} fica de fora`);
}
const achados = regra.verificar('a.js', js('', 'function cinco(a, b, c, d, e, f) {', '  return a;', '}'), null, null);
prova(achados.map(({ linha, detalhe }) => [linha, detalhe]), [[2, 'argumentos 6 (limite 4)'], [2, 'argumentos 6 (limite 4)']],
  'uma ocorrência por ponto, na linha da função (a exceção vai nela)');

const naAnaliseDoCodeScene = arquivo => execFileSync('git', ['show', `${COMMIT_DA_ANALISE_DO_CODESCENE}:${arquivo}`], { cwd: RAIZ, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const medidasNoCommit = arquivo => [...new Set(regra.verificar(arquivo, naAnaliseDoCodeScene(arquivo), null, null)
  .map(achado => achado.detalhe.split(/ \d| com /)[0]))].sort();
const DO_PAINEL = {
  'painel-anki-estilo.js': ['complexidade'],
  'complemento/test_pacote.py': [],
  'complemento/test_servidor.py': ['condição'],
  'complemento/empacotar.py': ['complexidade', 'condição'],
  'lib/pedido-ao-anki.js': ['argumentos', 'complexidade', 'condição'],
  'complemento/no_anki.py': ['argumentos', 'complexidade', 'condição'],
  'complemento/servidor.py': ['argumentos', 'complexidade', 'condição'],
  'painel-envio.js': ['blocos aninhados', 'complexidade', 'complexidade média das funções', 'condição'],
  'background.js': ['argumentos', 'blocos aninhados', 'complexidade', 'complexidade média das funções', 'condição'],
  'complemento/envio.py': ['aninhamento', 'argumentos', 'blocos aninhados', 'complexidade', 'complexidade média das funções', 'condição'],
};
for (const [arquivo, medidas] of Object.entries(DO_PAINEL)) {
  prova(medidasNoCommit(arquivo), medidas, `${arquivo} em ${COMMIT_DA_ANALISE_DO_CODESCENE}: as causas que o painel do CodeScene listou (o painel mostra no máximo 4)`);
}

const { raiz, git, gravar, commit } = raizTemporaria();
const semBaseDoAmbiente = () => {
  const env = { ...process.env };
  delete env.REGRAS_BASE;
  return env;
};
const rodar = (env = {}) => spawnSync('node', [path.join(__dirname, 'verificar.js'), '--raiz', raiz, '--base', 'main'], {
  encoding: 'utf8', env: { ...semBaseDoAmbiente(), ...env },
});
const LINHA_DE_BASE = 'scripts/regras/linha-de-base.json';
const comPontos = porArquivo => `${JSON.stringify({ 'saude-do-codigo': porArquivo }, null, 2)}\n`;
const SIMPLES = ['um', 'dois', 'tres'].flatMap(nome => [`function ${nome}() {`, '  return 1;', '}']);
const ramos = condicoes => js('function decidir(a, b) {', ...condicoes.map((c, i) => `  if (${c}) return ${i};`), '  return b;', '}', ...SIMPLES);
const OITO_DESVIOS = ['a', 'b', 'a > 1', 'b > 1', 'a > 2', 'b > 2', 'a > 3'];
const PY_COM_CINCO = py('def gravar(a, b, c, d, e):', '    return a');

gravar({ 'ferramenta/a.js': ramos([...OITO_DESVIOS, 'b > 3', 'a > 4']), 'ferramenta/b.py': PY_COM_CINCO, [LINHA_DE_BASE]: comPontos({ 'ferramenta/a.js': 2, 'ferramenta/b.py': 1 }) });
commit('base');
let r = rodar();
prova([r.status, /regras ok/.test(r.stdout)], [0, true], `na linha de base, passa:\n${r.stdout}`);

git('checkout', '-q', '-b', 'ramo');
gravar({ 'ferramenta/a.js': ramos([...OITO_DESVIOS, 'b > 3', 'a > 4', 'b > 4']) });
r = rodar();
prova(r.status, 1, `um ponto a mais que a linha de base falha:\n${r.stdout}`);
prova([/✗ saude-do-codigo — ferramenta\/a\.js: 3 ponto\(s\) acima dos limites de saúde do código; a linha de base permite 2\./.test(r.stdout),
  /o que piorou em relação à base:\n {4}ferramenta\/a\.js decidir \(linha 1\): 3 ponto\(s\); eram 2 na base — complexidade 11 \(limite 8\)/.test(r.stdout),
  /Conserto: Refatore de verdade/.test(r.stdout)], [true, true, true], `a mensagem diz o arquivo, a função, o antes e o conserto:\n${r.stdout}`);

gravar({ 'ferramenta/a.js': ramos([...OITO_DESVIOS, 'b > 3']) });
r = rodar();
prova([r.status, /a linha de base pode descer[^]*saude-do-codigo ferramenta\/a\.js: 2 → 1/.test(r.stdout)], [0, true],
  `melhorar passa e avisa que a linha de base pode descer (a PR aberta que melhora não é barrada):\n${r.stdout}`);

gravar({ 'ferramenta/a.js': ramos([...OITO_DESVIOS, 'b > 3', 'a > 4']), 'ferramenta/b.py': py('def gravar(a, b, c, d, e, f):', '    return a') });
r = rodar();
prova([r.status, /ferramenta\/b\.py: 2 ponto\(s\)/.test(r.stdout)], [1, true], `o Python que piora também falha:\n${r.stdout}`);

gravar({ 'ferramenta/b.py': PY_COM_CINCO, 'ferramenta/nova.js': js('function nova(a, b, c, d, e) {', '  return a;', '}') });
r = rodar();
prova([r.status, /ferramenta\/nova\.js: 1 ponto\(s\)[^]*a linha de base permite 0/.test(r.stdout)], [1, true], `arquivo novo nasce dentro dos limites:\n${r.stdout}`);

gravar({ [LINHA_DE_BASE]: comPontos({ 'ferramenta/a.js': 1, 'ferramenta/b.py': 1, 'ferramenta/nova.js': 1 }) });
r = rodar();
prova([r.status, /ferramenta\/a\.js: 2 ponto\(s\)[^]*a linha de base permite 1/.test(r.stdout)], [1, true], `a folga não sai de um arquivo que ainda a usa:\n${r.stdout}`);
gravar({ 'ferramenta/a.js': ramos([...OITO_DESVIOS, 'b > 3']) });
r = rodar();
prova(r.status, 0, `o código que vai para um módulo novo leva a folga junto, e o total não sobe:\n${r.stdout}`);

gravar({ 'ferramenta/nova.js': null, 'ferramenta/a.js': ramos([...OITO_DESVIOS, 'b > 3', 'a > 4']), [LINHA_DE_BASE]: comPontos({ 'ferramenta/a.js': 2, 'ferramenta/b.py': 1 }) });
git('mv', 'ferramenta/a.js', 'ferramenta/movida.js');
r = rodar();
prova([r.status, /regras ok/.test(r.stdout)], [0, true], `o arquivo movido herda a linha de base do nome antigo:\n${r.stdout}`);
git('mv', 'ferramenta/movida.js', 'ferramenta/a.js');

const EXCECAO = '// exceção saude-do-codigo até 2099-01-01, aprovada por Vinicius: teste';
gravar({ 'ferramenta/a.js': ramos([...OITO_DESVIOS, 'b > 3', 'a > 4', 'b > 4']).replace('function decidir(a, b) {', `function decidir(a, b) { ${EXCECAO}`) });
r = rodar();
prova(r.status, 0, `a exceção na linha da função isenta a função:\n${r.stdout}`);

gravar({ 'ferramenta/a.js': ramos([...OITO_DESVIOS, 'b > 3', 'a > 4']), [LINHA_DE_BASE]: comPontos({ 'ferramenta/a.js': 3, 'ferramenta/b.py': 1 }) });
r = rodar();
prova([r.status, /saude-do-codigo tem 4, mais que os 3 de main/.test(r.stdout)], [1, true], `a linha de base do ramo não sobe:\n${r.stdout}`);

gravar({ [LINHA_DE_BASE]: comPontos({ 'ferramenta/a.js': 2, 'ferramenta/b.py': 1 }) });
r = rodar({ PYTHON: path.join(raiz, 'sem-python') });
prova([r.status, /instale o Python 3 ou aponte PYTHON=/.test(r.stdout)], [1, true], `sem Python a regra falha e diz o que fazer:\n${r.stdout}`);

fs.rmSync(raiz, { recursive: true, force: true });
console.log(`saude-do-codigo: ${total} provas passaram`);

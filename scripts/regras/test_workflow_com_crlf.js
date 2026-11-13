'use strict';

// A prova de que a regra testes-no-portao lê um workflow com CRLF como lê o mesmo com LF (scripts/yaml-de-workflow.js).
// Num clone com core.autocrlf=true (o padrão do Git for Windows) os arquivos chegam com CRLF. O leitor parava num `run: |`
// com CRLF e escondia os passos seguintes do job: o grupo complemento "sumia" do testes.yml, o verificador acusava
// scripts/testes.json e o gancho pre-push barrava todo push feito do Windows (o CI, em Linux, passava).

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const regra = require('./verificar').REGRAS.find(r => r.id === 'testes-no-portao');
const { comandos, lerYaml } = require('../yaml-de-workflow');
const { repositorioDeTestes } = require('./apoio-de-testes');
const RAIZ = path.resolve(__dirname, '..', '..');

const comCRLF = texto => texto.replace(/\r?\n/g, '\r\n');
const comLF = texto => texto.replace(/\r\n/g, '\n');

const CADASTRO = JSON.stringify({
  grupos: {
    node: { executor: 'node', arquivos: ['test_sync.js'] },
    complemento: { executor: 'unittest', pasta: 'complemento', padrao: 'test_*.py' },
  },
  fora: [],
}, null, 2);
// A forma do job do testes.yml que quebrava: um passo com bloco `|` antes do passo que chama o grupo.
const WORKFLOW = [
  'on:', '  pull_request:', 'jobs:',
  '  node:', '    steps:', '      - run: node scripts/testar.mjs node',
  '  complemento:', '    steps:',
  '      - name: Instalar o pwsh (se faltar)', '        run: |', '          if ! command -v pwsh >/dev/null; then', '            exit 1', '          fi',
  '      - run: node scripts/testar.mjs complemento', '        env:', '          PYTHON: python', '',
].join('\n');

function achados(arquivos, arquivo) {
  const pasta = repositorioDeTestes(arquivos);
  try {
    return regra.verificar(arquivo, arquivos[arquivo], pasta);
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
}
const repositorio = (workflow, cadastro = CADASTRO) => ({
  'scripts/testes.json': cadastro, 'test_sync.js': '', 'complemento/test_servidor.py': '', '.github/workflows/testes.yml': workflow,
});

let total = 0;
const nenhum = (lista, porque) => { assert.deepStrictEqual(lista, [], porque); total++; };

nenhum(achados(repositorio(WORKFLOW), 'scripts/testes.json'), 'com LF, todo grupo é chamado');
nenhum(achados(repositorio(comCRLF(WORKFLOW)), 'scripts/testes.json'), 'com CRLF no workflow, todo grupo continua chamado');
nenhum(achados(repositorio(comCRLF(WORKFLOW), comCRLF(CADASTRO)), 'scripts/testes.json'), 'com CRLF no workflow e no cadastro');
nenhum(achados(repositorio(comCRLF(WORKFLOW), comCRLF(CADASTRO)), '.github/workflows/testes.yml'), 'o workflow com CRLF não é acusado');

// O CRLF não afrouxa a regra: o que ela acusa com LF, acusa igual, na mesma linha.
const SO_ECHO = WORKFLOW.replace('- run: node scripts/testar.mjs complemento', '- run: echo node scripts/testar.mjs complemento');
for (const arquivo of ['scripts/testes.json', '.github/workflows/testes.yml']) {
  const esperado = achados(repositorio(SO_ECHO), arquivo);
  assert.strictEqual(esperado.length, 1, `com LF, o echo é acusado em ${arquivo}`);
  assert.deepStrictEqual(achados(repositorio(comCRLF(SO_ECHO)), arquivo), esperado, `com CRLF, o mesmo achado em ${arquivo}`);
  total++;
}

// Os workflows de verdade deste repositório: com CRLF, os mesmos comandos, nas mesmas linhas, com o mesmo veredito.
const pasta = path.join(RAIZ, '.github', 'workflows');
const workflows = fs.readdirSync(pasta).filter(nome => /\.ya?ml$/.test(nome));
assert(workflows.includes('testes.yml'), 'o testes.yml está entre os workflows lidos');
for (const nome of workflows) {
  const texto = comLF(fs.readFileSync(path.join(pasta, nome), 'utf8'));
  const esperados = comandos(lerYaml(texto));
  assert(esperados.length > 0, `${nome} tem comandos`);
  assert.deepStrictEqual(comandos(lerYaml(comCRLF(texto))), esperados, `${nome} com CRLF`);
  total++;
}

console.log(`workflow com CRLF: ${total} provas passaram`);

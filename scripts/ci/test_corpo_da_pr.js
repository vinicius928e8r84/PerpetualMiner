'use strict';

const assert = require('assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { conferirCorpo } = require('./corpo-da-pr.js');
const { conferir } = require('./registro-da-pr.js');

const RAIZ = path.resolve(__dirname, '..', '..');
const CONFERIDOR = path.join(__dirname, 'corpo-da-pr.js');
const MAPA = '.agents/skills/verify-perpetualminer/scripts/mapa-de-features.sh';
const REPOSITORIO = 'dono/repo';

const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-corpo-da-pr-'));
const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: repo, encoding: 'utf8' }).trim();
const escrever = (arquivo, texto) => {
  fs.mkdirSync(path.dirname(path.join(repo, arquivo)), { recursive: true });
  fs.writeFileSync(path.join(repo, arquivo), texto);
};
const ramo = (nome, arquivo, texto) => {
  git('checkout', '-q', '-b', nome, 'main');
  escrever(arquivo, texto);
  git('add', '-A');
  git('commit', '-q', '-m', nome);
};

git('init', '-q', '-b', 'main');
escrever(MAPA, fs.readFileSync(path.join(RAIZ, MAPA), 'utf8'));
escrever('popup/popup.js', "'use strict';\n");
escrever('manifest.json', '{ "permissions": ["storage"] }\n');
escrever('docs/leia.md', 'um\n');
git('add', '-A');
git('commit', '-q', '-m', 'base');
ramo('so-docs', 'docs/leia.md', 'dois\n');
ramo('superficie', 'popup/popup.js', "'use strict';\nconst a = 1;\n");
ramo('dados', 'manifest.json', '{ "permissions": ["storage", "history"] }\n');
ramo('sensivel', '.github/workflows/novo.yml', 'on: push\n');

const MODELO = ['## Summary', '', 'O que mudou.', '', '## Evidence', '', 'Rodei.', '', '## Merge Danger', '', '**Door:** two-way', '', '**Blast Radius:** CI', ''];
const corpoCom = (...linhas) => [...MODELO, ...linhas].join('\n');
const COMPLETO = corpoCom('**Atenção:** BAIXA', '', '**Política:** sem mudança', '', 'Sem issue');
const faltas = (nome, corpo) => {
  git('checkout', '-q', nome);
  return conferirCorpo({ corpo, raiz: repo, base: 'main', repositorio: REPOSITORIO });
};

assert.deepStrictEqual(faltas('so-docs', COMPLETO), [], 'o corpo completo de uma PR que não toca superfície nem dados passa');

const doModeloDoSkill = faltas('so-docs', corpoCom());
assert.strictEqual(doModeloDoSkill.length, 3, doModeloDoSkill.join('\n'));
assert.match(doModeloDoSkill[0], /falta o campo "Política:" preenchido/);
assert.match(doModeloDoSkill[1], /não tem o campo de atenção preenchido/);
assert.match(doModeloDoSkill[2], /não diz a issue/);

assert.match(faltas('so-docs', COMPLETO.replace('Sem issue', 'Refs https://github.com/dono/repo/issues/7')).join('\n'), /"Refs" sem a linha "Prova que falta: <texto>"/);
assert.match(faltas('so-docs', COMPLETO.replace('Sem issue', 'Closes #7')).join('\n'), /não tem a URL completa da issue \(https:\/\/github\.com\/dono\/repo\/issues\/<N>/);

const emCaminhoSensivel = faltas('sensivel', COMPLETO);
assert.strictEqual(emCaminhoSensivel.length, 1, emCaminhoSensivel.join('\n'));
assert.match(emCaminhoSensivel[0], /^caminho sensível \([^)]*\.github\/[^)]*\): o corpo não tem a seção "Prova real"/, 'a PR que mexe em .github/ e diz BAIXA pede a prova antes de abrir');

const semMapa = faltas('superficie', COMPLETO);
assert.strictEqual(semMapa.length, 1, semMapa.join('\n'));
assert.match(semMapa[0], /feature map: this PR changes user-facing files:\n {2}popup\/popup\.js\n[^]*"feature map unchanged"/);
assert.deepStrictEqual(faltas('superficie', `${COMPLETO}\n\nfeature map unchanged`), [], 'a declaração do mapa de features no corpo passa');

const semPolitica = faltas('dados', `${COMPLETO}\n\nfeature map unchanged`);
assert.strictEqual(semPolitica.length, 1, semPolitica.join('\n'));
assert.match(semPolitica[0], /política do site: esta PR muda o que o produto faz com dados:\n {2}manifest\.json/);
assert.deepStrictEqual(faltas('dados', `${COMPLETO.replace('sem mudança', 'sem mudança: a permissão nova não lê dados')}\n\nfeature map unchanged`), []);

const altaSemProva = faltas('so-docs', COMPLETO.replace('BAIXA', 'ALTA'));
assert.match(altaSemProva.join('\n'), /atenção ALTA: o corpo não tem a seção "Prova real"/);
const comProva = `${COMPLETO.replace('BAIXA', 'ALTA')}\n\n## Prova real\n\nPROVADO 100% REAL\nHead: ${git('rev-parse', 'HEAD')}\n`;
assert.deepStrictEqual(faltas('so-docs', comProva), [], 'a prova real vale com o HEAD local');

const rodar = (argumentos, entrada) => spawnSync('node', [CONFERIDOR, ...argumentos], { cwd: repo, encoding: 'utf8', input: entrada });
git('checkout', '-q', 'superficie');
const arquivo = path.join(repo, 'corpo.md');
fs.writeFileSync(arquivo, COMPLETO);
let r = rodar([arquivo, '--base', 'main']);
assert.strictEqual(r.status, 1, r.stdout);
assert.match(r.stdout, /seria barrado pelo CI \(1 falta\(s\)\)[^]*feature map[^]*PULL_REQUEST_TEMPLATE\.md/);
r = rodar(['-', '--base', 'main'], `${COMPLETO}\n\nfeature map unchanged`);
assert.strictEqual(r.status, 0, r.stdout);
assert.match(r.stdout, /corpo da PR ok contra main/);
assert.strictEqual(rodar([]).status, 2, 'sem o arquivo, mostra o uso');
assert.strictEqual(rodar(['--help']).status, 0, 'pedir ajuda mostra o uso e sai bem');
assert.strictEqual(rodar([arquivo, '--base']).status, 2, 'a base sem valor mostra o uso');
assert.strictEqual(rodar([arquivo, 'outro', '--base', 'main']).status, 2, 'argumento de sobra mostra o uso');
assert.strictEqual(rodar([arquivo, '--base', 'nao-existe']).status, 2, 'a base que não existe não passa em silêncio');
assert.strictEqual(rodar([path.join(repo, 'nao-existe.md'), '--base', 'main']).status, 2, 'o arquivo que não existe não passa em silêncio');

assert.match(conferir({ corpo: corpoCom(), rotulos: [], registros: [], head: '0'.repeat(40), repositorio: REPOSITORIO }).mensagem,
  /node scripts\/ci\/corpo-da-pr\.js <arquivo do corpo>/, 'a falha do Registro da PR diz o comando que confere o corpo antes de abrir a PR');

fs.rmSync(repo, { recursive: true, force: true });
console.log('test_corpo_da_pr: ok');

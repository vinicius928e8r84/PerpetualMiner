'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { achadosDoMedidor } = require('./achados-do-medidor');
const { achadosDoQlty } = require('./achados-do-qlty');
const { compararRepositorio } = require('./comparar');
const { relatorio } = require('./relatorio');

const RAIZ = path.resolve(__dirname, '..', '..');
const NOTAS_PADRAO = path.join(__dirname, 'notas-do-codescene.json');

const USO = 'uso: node scripts/qualidade/segunda-opiniao.js --sarif <saída de `qlty smells --all --include-tests --sarif`> '
  + '[--base <ref>] [--notas <json>] [--saida <md>] [--json <arquivo>]';

const OPCOES = new Set(['--sarif', '--base', '--notas', '--saida', '--json']);

function lerArgumentos(argv) {
  const opcoes = { notas: NOTAS_PADRAO };
  for (let i = 0; i < argv.length; i += 2) {
    if (!OPCOES.has(argv[i]) || argv[i + 1] === undefined) throw new Error(`argumento desconhecido ou sem valor: ${argv[i]}\n${USO}`);
    opcoes[argv[i].slice(2)] = argv[i + 1];
  }
  if (!opcoes.sarif) throw new Error(USO);
  return opcoes;
}

const git = (raiz, ...args) => execFileSync('git', args, { cwd: raiz, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();

function arquivosDaPr(raiz, base) {
  if (!base) return [];
  return git(raiz, 'diff', '--name-only', '--diff-filter=AMR', `${base}...HEAD`).split('\n').filter(Boolean);
}

function lerNotas(arquivo) {
  const lidas = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  return { fonte: lidas.fonte, commit: lidas.commit, porArquivo: new Map(Object.entries(lidas.notas)) };
}

function segundaOpiniao({ raiz, sarif, notas, base }) {
  const doQlty = achadosDoQlty(fs.readFileSync(sarif, 'utf8'));
  const lidas = lerNotas(notas);
  const comparacoes = compararRepositorio({ medicoes: achadosDoMedidor(raiz), doQlty: doQlty.porArquivo, notas: lidas.porArquivo });
  const texto = relatorio({
    commit: git(raiz, 'rev-parse', '--short', 'HEAD'),
    versaoDoQlty: doQlty.versao,
    notas: lidas,
    comparacoes,
    arquivosDaPr: arquivosDaPr(raiz, base),
  });
  return { texto, comparacoes };
}

function principal(argv) {
  const opcoes = lerArgumentos(argv);
  const { texto, comparacoes } = segundaOpiniao({ raiz: RAIZ, ...opcoes });
  if (opcoes.json) fs.writeFileSync(opcoes.json, `${JSON.stringify(comparacoes, null, 1)}\n`);
  if (opcoes.saida) fs.writeFileSync(opcoes.saida, `${texto}\n`);
  else process.stdout.write(`${texto}\n`);
}

if (require.main === module) principal(process.argv.slice(2));

module.exports = { segundaOpiniao, lerArgumentos };

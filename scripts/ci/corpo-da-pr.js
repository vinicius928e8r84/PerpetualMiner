#!/usr/bin/env node
'use strict';

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { faltasDoCorpo, lotesQueContemOHead } = require('./registro-da-pr.js');
const politicaDoSite = require('./politica-do-site.js');
const { caminhosDaPrNoGit } = require('./caminhos-sensiveis.js');

const MAPA_DE_FEATURES = '.agents/skills/verify-perpetualminer/scripts/mapa-de-features.sh';
const BASE_PADRAO = 'origin/main';
const USO = `uso: node scripts/ci/corpo-da-pr.js <arquivo do corpo> [--base <ref>]

Confere o corpo de uma PR antes de abri-la (ou de editá-lo), sem o GitHub, contra o HEAD e a base (padrão: ${BASE_PADRAO}):
o modelo, a atenção e a issue (check "Registro da PR"), o mapa de features e a política do site (job "Regras").
"-" no lugar do arquivo lê o corpo da entrada padrão. O registro do /code-review não é do corpo e não é conferido aqui.`;

const git = (raiz, ...args) => execFileSync('git', args, { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

function repositorioDoRemoto(raiz) {
  try {
    const achado = /github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(git(raiz, 'remote', 'get-url', 'origin'));
    return achado ? achado[1] : null;
  } catch {
    return null;
  }
}

function faltasDoMapaDeFeatures({ raiz, base, corpo }) {
  const feito = spawnSync('bash', [path.join(raiz, MAPA_DE_FEATURES), base], { cwd: raiz, encoding: 'utf8', env: { ...process.env, PR_BODY: corpo } });
  if (feito.status === 0) return [];
  return [(feito.stderr || feito.stdout || `${MAPA_DE_FEATURES} saiu com ${feito.status}`).trim()];
}

function conferirCorpo({ corpo, raiz, base, repositorio = repositorioDoRemoto(raiz) }) {
  const head = git(raiz, 'rev-parse', 'HEAD');
  const daPolitica = politicaDoSite.conferir({ raiz, base, ponta: 'HEAD', corpo });
  return [
    ...faltasDoCorpo({ corpo, rotulos: [], head, repositorio, lotes: lotesQueContemOHead({ corpo, head, raiz }), caminhosSensiveis: caminhosDaPrNoGit({ raiz, base, head }) }),
    ...faltasDoMapaDeFeatures({ raiz, base, corpo }),
    ...(daPolitica.codigo ? [daPolitica.mensagem] : []),
  ];
}

function lerPedido(argv) {
  const posicaoDaBase = argv.indexOf('--base');
  const base = posicaoDaBase >= 0 ? argv[posicaoDaBase + 1] : BASE_PADRAO;
  const [arquivo, ...sobra] = argv.filter((_, i) => posicaoDaBase < 0 || (i !== posicaoDaBase && i !== posicaoDaBase + 1));
  return { arquivo, base, sobra };
}

const pedidoCompleto = ({ arquivo, base, sobra }) => [arquivo, base].every(Boolean) && !sobra.length;

const pedeUso = pedido => pedido.arquivo === '--help' || !pedidoCompleto(pedido);

function lerEntradas({ arquivo, base }, pasta) {
  const corpo = fs.readFileSync(arquivo === '-' ? 0 : arquivo, 'utf8');
  const raiz = git(pasta, 'rev-parse', '--show-toplevel');
  git(raiz, 'rev-parse', '--verify', '--quiet', `${base}^{commit}`);
  return { corpo, raiz };
}

const relatorioDeFaltas = faltas => [
  `✗ O corpo da PR seria barrado pelo CI (${faltas.length} falta(s)):`,
  ...faltas.map(falta => `    - ${falta.split('\n').join('\n      ')}`),
  '  Conserto: o formato de cada parte está em .github/PULL_REQUEST_TEMPLATE.md.',
].join('\n');

const relatorioDoCorpoOk = base => `corpo da PR ok contra ${base} (falta só o que não é do corpo: o registro do /code-review do head)`;

function main(argv, pasta) {
  const pedido = lerPedido(argv);
  if (pedeUso(pedido)) {
    console.log(USO);
    return pedido.arquivo === '--help' ? 0 : 2;
  }
  let entradas;
  try {
    entradas = lerEntradas(pedido, pasta);
  } catch (erro) {
    console.log(`✗ Não consegui ler o corpo "${pedido.arquivo}" ou a base "${pedido.base}" (git fetch origin main): ${erro.message.split('\n')[0]}`);
    return 2;
  }
  const faltas = conferirCorpo({ ...entradas, base: pedido.base });
  console.log(faltas.length ? relatorioDeFaltas(faltas) : relatorioDoCorpoOk(pedido.base));
  return faltas.length ? 1 : 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2), process.cwd());

module.exports = { conferirCorpo };

#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { arquivosDoGrupo, baseDaVersao, dicaDeModulo, escolherPython, lerRegistro, trabalhadoresDoGrupo, tetoEmSegundos, estourouOTeto } = require('./grupos-de-teste.js');
const { rodarEmParalelo } = require('./unittest-em-paralelo.js');
const { rodarArquivosEmParalelo } = require('./arquivos-em-paralelo.js');
const { arquivosDoRepositorio } = require('./regras/comum.js');

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const AJUDA = `uso: node scripts/testar.mjs [--listar] [<grupo>...] [-- <argumentos do comando>]

Roda os grupos de teste de scripts/testes.json. Sem grupo, roda os leves (o e2e é "pesado": peça por nome).
O Python é o de $PYTHON, senão o do .venv (scripts/preparar-python.sh o cria), senão python3.`;

const COMANDOS_DO_EXECUTOR = {
  node: (grupo, arquivos) => arquivos.map(arquivo => ({ comando: 'node', argumentos: [arquivo], cwd: RAIZ })),
  unittest: (grupo, arquivos, extras) => [{
    comando: escolherPython(process.env, RAIZ).comando,
    argumentos: ['-m', 'unittest', 'discover', '-s', grupo.pasta, '-p', grupo.padrao, ...extras],
    cwd: RAIZ,
  }],
  playwright: (grupo, arquivos, extras) => [{ comando: 'npx', argumentos: ['playwright', 'test', ...extras], cwd: path.join(RAIZ, grupo.pasta) }],
};

function comandosDoGrupo(grupo, arquivos, extras) {
  if (!Object.hasOwn(COMANDOS_DO_EXECUTOR, grupo.executor)) throw new Error(`executor desconhecido: ${grupo.executor}`);
  return COMANDOS_DO_EXECUTOR[grupo.executor](grupo, arquivos, extras);
}

function rodar(comando, argumentos, cwd, copiarErro) {
  return new Promise(resolve => {
    const filho = spawn(comando, argumentos, { cwd, stdio: ['inherit', 'inherit', copiarErro ? 'pipe' : 'inherit'] });
    let stderr = '';
    filho.stderr?.on('data', pedaco => {
      process.stderr.write(pedaco);
      stderr += pedaco;
    });
    filho.on('error', error => resolve({ error, stderr }));
    filho.on('close', status => resolve({ status, stderr }));
  });
}

function separarArgumentos(argv) {
  const aoPassar = argv.indexOf('--');
  if (aoPassar < 0) return { pedidos: argv, extras: [] };
  return { pedidos: argv.slice(0, aoPassar), extras: argv.slice(aoPassar + 1) };
}

function pediuAjuda(pedidos) {
  return pedidos.includes('--help') || pedidos.includes('-h');
}

function gruposPesados(grupos) {
  return Object.keys(grupos).filter(nome => grupos[nome].pesado);
}

function gruposLeves(grupos) {
  return Object.keys(grupos).filter(nome => !grupos[nome].pesado);
}

function recusarGrupoDesconhecido(desconhecido, grupos) {
  console.log(`error: grupo desconhecido: ${desconhecido}\nhelp: os grupos são ${Object.keys(grupos).join(', ')} (scripts/testes.json)`);
  return 2;
}

function listarGrupos(grupos, arquivos) {
  for (const nome of Object.keys(grupos)) {
    console.log(`${nome}${grupos[nome].pesado ? ' (pesado)' : ''}: ${arquivosDoGrupo(grupos[nome], arquivos).join(' ')}`);
  }
  return 0;
}

function avisarDosPesadosDeFora(grupos) {
  const deFora = gruposPesados(grupos);
  if (deFora.length) console.log(`(sem ${deFora.join(', ')}: pesado; rode \`node scripts/testar.mjs ${deFora[0]}\`)`);
}

function apontarBaseDaVersao() {
  const git = (...args) => spawnSync('git', args, { cwd: RAIZ, encoding: 'utf8' });
  const ramo = git('rev-parse', '--abbrev-ref', 'HEAD').stdout.trim();
  const temOrigemMain = git('rev-parse', '--verify', '--quiet', 'origin/main').status === 0;
  const baseDaPr = baseDaVersao(process.env, ramo, temOrigemMain);
  if (baseDaPr) process.env.PM_VERSAO_BASE = baseDaPr;
}

async function rodarNodeEmParalelo(nome, comandos, trabalhadores) {
  const vermelhos = await rodarArquivosEmParalelo({ nome, comandos, trabalhadores });
  return { status: vermelhos.length ? 1 : 0, stderr: '' };
}

const EM_PARALELO = {
  node: (nome, grupo, doGrupo, trabalhadores) => ({
    comando: 'node',
    argumentos: ['<um arquivo por vez>'],
    emParalelo: () => rodarNodeEmParalelo(nome, comandosDoGrupo(grupo, doGrupo, []), trabalhadores),
  }),
  unittest: (nome, grupo, doGrupo, trabalhadores) => {
    const python = escolherPython(process.env, RAIZ).comando;
    return {
      comando: python,
      argumentos: ['-m', 'unittest', '<um módulo por vez>'],
      emParalelo: () => rodarEmParalelo({ python, pasta: grupo.pasta, arquivos: doGrupo, trabalhadores, cwd: RAIZ }),
    };
  },
};

function trabalhadoresPara(grupo, extras) {
  if (extras.length || !Object.hasOwn(EM_PARALELO, grupo.executor)) return 1;
  return trabalhadoresDoGrupo(grupo, process.env);
}

function execucaoEmParalelo(nome, grupo, doGrupo, trabalhadores) {
  return { paralelo: true, trabalhadores, ...EM_PARALELO[grupo.executor](nome, grupo, doGrupo, trabalhadores) };
}

function execucoesDoGrupo(nome, grupo, doGrupo, extras) {
  const trabalhadores = trabalhadoresPara(grupo, extras);
  if (trabalhadores <= 1) return comandosDoGrupo(grupo, doGrupo, extras);
  return [execucaoEmParalelo(nome, grupo, doGrupo, trabalhadores)];
}

function anunciarExecucao(nome, { comando, argumentos, paralelo, trabalhadores }) {
  console.log(`\n▶ ${nome}: ${[comando, ...argumentos].join(' ')}${paralelo ? ` (${trabalhadores} em paralelo)` : ''}`);
}

function executar(grupo, { comando, argumentos, cwd, paralelo, emParalelo }) {
  if (paralelo) return emParalelo();
  return rodar(comando, argumentos, cwd, grupo.executor !== 'playwright');
}

function oQueOGrupoPrecisa(grupo) {
  return grupo.precisa ? `; o grupo precisa de: ${grupo.precisa}` : '';
}

function passouNaExecucao(nome, grupo, comando, resultado) {
  if (resultado.error) {
    console.log(`✗ ${nome}: não consegui rodar ${comando} (${resultado.error.message})${oQueOGrupoPrecisa(grupo)}`);
    return false;
  }
  if (resultado.status === 0) return true;
  const dica = dicaDeModulo(nome, grupo, resultado.stderr, escolherPython(process.env, RAIZ));
  if (dica) console.log(dica);
  return false;
}

async function rodarGrupo(nome, grupo, arquivos, extras) {
  const doGrupo = arquivosDoGrupo(grupo, arquivos);
  if (!doGrupo.length) {
    console.log(`✗ ${nome}: nenhum arquivo de teste casa com o grupo; conserte scripts/testes.json`);
    return false;
  }
  const passaram = [];
  for (const execucao of execucoesDoGrupo(nome, grupo, doGrupo, extras)) {
    anunciarExecucao(nome, execucao);
    passaram.push(passouNaExecucao(nome, grupo, execucao.comando, await executar(grupo, execucao)));
  }
  return passaram.every(Boolean);
}

async function rodarGrupos(escolhidos, grupos, arquivos, extras) {
  const falhas = [];
  for (const nome of escolhidos) {
    if (!await rodarGrupo(nome, grupos[nome], arquivos, extras)) falhas.push(nome);
  }
  return falhas;
}

function passouDoTeto(escolhidos, exatos, houveFalha) {
  const teto = tetoEmSegundos(process.env);
  if (teto === null) return false;
  const segundos = exatos.toFixed(1);
  const linha = `${escolhidos.join(', ')}: ${segundos} s (teto ${teto} s)`;
  console.log(`\n${linha}`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- ${linha}\n`);
  if (houveFalha || !estourouOTeto(exatos, teto)) return false;
  console.log(`::error title=Teto de tempo::${escolhidos.join(', ')} levou ${segundos} s, o teto é ${teto} s`);
  return true;
}

function veredito(escolhidos, falhas, exatos) {
  if (passouDoTeto(escolhidos, exatos, falhas.length > 0)) return 1;
  if (falhas.length) {
    console.log(`\nerror: falharam: ${[...new Set(falhas)].join(', ')}`);
    return 1;
  }
  console.log(`\ntestes ok: ${escolhidos.join(', ')}`);
  return 0;
}

async function main(argv) {
  const { pedidos, extras } = separarArgumentos(argv);
  if (pediuAjuda(pedidos)) {
    console.log(AJUDA);
    return 0;
  }
  const { grupos } = lerRegistro(RAIZ);
  const arquivos = arquivosDoRepositorio(RAIZ);
  const nomes = pedidos.filter(p => p !== '--listar');
  const desconhecido = nomes.find(nome => !grupos[nome]);
  if (desconhecido) return recusarGrupoDesconhecido(desconhecido, grupos);
  if (pedidos.includes('--listar')) return listarGrupos(grupos, arquivos);
  if (!nomes.length) avisarDosPesadosDeFora(grupos);
  const escolhidos = nomes.length ? nomes : gruposLeves(grupos);
  apontarBaseDaVersao();
  const inicio = Date.now();
  const falhas = await rodarGrupos(escolhidos, grupos, arquivos, extras);
  return veredito(escolhidos, falhas, (Date.now() - inicio) / 1000);
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (erro) {
  console.log(`error: ${erro.message}\nhelp: node scripts/testar.mjs --help; os grupos estão em scripts/testes.json`);
  process.exitCode = 1;
}

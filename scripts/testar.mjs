#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { arquivosDoGrupo, baseDaVersao, dicaDeModulo, escolherPython, lerRegistro, trabalhadoresDoGrupo, tetoEmSegundos, estourouOTeto } = require('./grupos-de-teste.js');
const { rodarEmParalelo } = require('./unittest-em-paralelo.js');
const { arquivosDoRepositorio } = require('./regras/comum.js');

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const AJUDA = `uso: node scripts/testar.mjs [--listar] [<grupo>...] [-- <argumentos do comando>]

Roda os grupos de teste de scripts/testes.json. Sem grupo, roda os leves (o e2e é "pesado": peça por nome).
O Python é o de $PYTHON, senão o do .venv (scripts/preparar-python.sh o cria), senão python3.`;

function comandosDoGrupo(grupo, arquivos, extras) {
  const python = escolherPython(process.env, RAIZ).comando;
  if (grupo.executor === 'node') return arquivos.map(arquivo => ({ comando: 'node', argumentos: [arquivo], cwd: RAIZ }));
  if (grupo.executor === 'unittest') {
    return [{ comando: python, argumentos: ['-m', 'unittest', 'discover', '-s', grupo.pasta, '-p', grupo.padrao, ...extras], cwd: RAIZ }];
  }
  if (grupo.executor === 'playwright') {
    return [{ comando: 'npx', argumentos: ['playwright', 'test', ...extras], cwd: path.join(RAIZ, grupo.pasta) }];
  }
  throw new Error(`executor desconhecido: ${grupo.executor}`);
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

async function main(argv) {
  const aoPassar = argv.indexOf('--');
  const extras = aoPassar < 0 ? [] : argv.slice(aoPassar + 1);
  const pedidos = aoPassar < 0 ? argv : argv.slice(0, aoPassar);
  if (pedidos.includes('--help') || pedidos.includes('-h')) {
    console.log(AJUDA);
    return 0;
  }
  const registro = lerRegistro(RAIZ);
  const arquivos = arquivosDoRepositorio(RAIZ);
  const listar = pedidos.includes('--listar');
  const nomes = pedidos.filter(p => p !== '--listar');
  const desconhecido = nomes.find(nome => !registro.grupos[nome]);
  if (desconhecido) {
    console.log(`error: grupo desconhecido: ${desconhecido}\nhelp: os grupos são ${Object.keys(registro.grupos).join(', ')} (scripts/testes.json)`);
    return 2;
  }
  const escolhidos = nomes.length ? nomes : Object.keys(registro.grupos).filter(nome => !registro.grupos[nome].pesado);

  if (listar) {
    for (const nome of Object.keys(registro.grupos)) {
      console.log(`${nome}${registro.grupos[nome].pesado ? ' (pesado)' : ''}: ${arquivosDoGrupo(registro.grupos[nome], arquivos).join(' ')}`);
    }
    return 0;
  }
  if (!nomes.length) {
    const deFora = Object.keys(registro.grupos).filter(nome => registro.grupos[nome].pesado);
    if (deFora.length) console.log(`(sem ${deFora.join(', ')}: pesado; rode \`node scripts/testar.mjs ${deFora[0]}\`)`);
  }

  const git = (...args) => spawnSync('git', args, { cwd: RAIZ, encoding: 'utf8' });
  const baseDaPr = baseDaVersao(process.env, git('rev-parse', '--abbrev-ref', 'HEAD').stdout.trim(), git('rev-parse', '--verify', '--quiet', 'origin/main').status === 0);
  if (baseDaPr) process.env.PM_VERSAO_BASE = baseDaPr;

  const falhas = [];
  const inicioDosGrupos = Date.now();
  for (const nome of escolhidos) {
    const grupo = registro.grupos[nome];
    const doGrupo = arquivosDoGrupo(grupo, arquivos);
    if (!doGrupo.length) {
      console.log(`✗ ${nome}: nenhum arquivo de teste casa com o grupo; conserte scripts/testes.json`);
      falhas.push(nome);
      continue;
    }
    const trabalhadores = grupo.executor === 'unittest' && !extras.length ? trabalhadoresDoGrupo(grupo, process.env) : 1;
    const comandos = trabalhadores > 1
      ? [{ paralelo: true, comando: escolherPython(process.env, RAIZ).comando, cwd: RAIZ, argumentos: ['-m', 'unittest', '<um módulo por vez>'] }]
      : comandosDoGrupo(grupo, doGrupo, extras);
    for (const { comando, argumentos, cwd, paralelo } of comandos) {
      console.log(`\n▶ ${nome}: ${[comando, ...argumentos].join(' ')}${paralelo ? ` (${trabalhadores} em paralelo)` : ''}`);
      const resultado = paralelo
        ? await rodarEmParalelo({ python: comando, pasta: grupo.pasta, arquivos: doGrupo, trabalhadores, cwd })
        : await rodar(comando, argumentos, cwd, grupo.executor !== 'playwright');
      if (resultado.error) {
        console.log(`✗ ${nome}: não consegui rodar ${comando} (${resultado.error.message})${grupo.precisa ? `; o grupo precisa de: ${grupo.precisa}` : ''}`);
        falhas.push(nome);
      } else if (resultado.status !== 0) {
        const dica = dicaDeModulo(nome, grupo, resultado.stderr, escolherPython(process.env, RAIZ));
        if (dica) console.log(dica);
        falhas.push(nome);
      }
    }
  }
  const exatos = (Date.now() - inicioDosGrupos) / 1000;
  const segundos = Math.round(exatos);
  const teto = tetoEmSegundos(process.env);
  if (teto !== null) {
    const linha = `${escolhidos.join(', ')}: ${segundos} s (teto ${teto} s)`;
    console.log(`\n${linha}`);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- ${linha}\n`);
    if (!falhas.length && estourouOTeto(exatos, teto)) {
      console.log(`::error title=Teto de tempo::${escolhidos.join(', ')} levou ${segundos} s, o teto é ${teto} s`);
      return 1;
    }
  }
  if (falhas.length) {
    console.log(`\nerror: falharam: ${[...new Set(falhas)].join(', ')}`);
    return 1;
  }
  console.log(`\ntestes ok: ${escolhidos.join(', ')}`);
  return 0;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (erro) {
  console.log(`error: ${erro.message}\nhelp: node scripts/testar.mjs --help; os grupos estão em scripts/testes.json`);
  process.exitCode = 1;
}

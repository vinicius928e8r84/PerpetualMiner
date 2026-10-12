#!/usr/bin/env node
// O único jeito de rodar os testes do repositório, aqui e no CI: cada workflow chama
// `node scripts/testar.mjs <grupo>` e a lista de grupos é scripts/testes.json. Um teste
// novo só entra no portão ao entrar num grupo; `node scripts/regras/verificar.js`
// (regra `testes-no-portao`) falha quando um teste ou um grupo ficou de fora.
//
//   node scripts/testar.mjs                 os grupos leves, na ordem do cadastro
//   node scripts/testar.mjs <grupo>...      só esses grupos
//   node scripts/testar.mjs <grupo> -- ...  o que vem depois do `--` vai ao comando do grupo
//                                           (unittest e Playwright: `-- --shard=1/8`, um spec)
//   node scripts/testar.mjs --listar        os grupos e os arquivos que cada um roda

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { arquivosDoGrupo, lerRegistro } = require('./grupos-de-teste.js');
const { arquivosDoRepositorio } = require('./regras/comum.js');

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const AJUDA = `uso: node scripts/testar.mjs [--listar] [<grupo>...] [-- <argumentos do comando>]

Roda os grupos de teste de scripts/testes.json. Sem grupo, roda os leves (o e2e é "pesado": peça por nome).
O Python é o de $PYTHON, senão o do .venv (scripts/preparar-python.sh o cria), senão python3.`;

const VENV_PYTHON = path.join('.venv', 'bin', 'python');

/** O Python dos testes: $PYTHON (o CI passa o seu), senão o do .venv da raiz, senão python3. */
export function escolherPython(env = process.env, raiz = RAIZ) {
  if (env.PYTHON) return env.PYTHON;
  const doVenv = path.join(raiz, VENV_PYTHON);
  return fs.existsSync(doVenv) ? doVenv : 'python3';
}

/** O que dizer quando um grupo falhou por falta de um módulo do Python; '' quando não foi isso. */
export function dicaDeModulo(nome, grupo, saidaDeErro, python = escolherPython()) {
  if (!/ModuleNotFoundError/.test(saidaDeErro)) return '';
  const falta = /No module named '([^']+)'/.exec(saidaDeErro);
  const preparo = python === 'python3'
    ? '\n  numa worktree nova: scripts/preparar-python.sh cria o .venv e instala tudo; este comando passa a usá-lo sozinho'
    : '';
  return `✗ ${nome}: falta o módulo ${falta ? falta[1] : 'do Python'}`
    + (grupo.precisa ? `; o grupo precisa de: ${grupo.precisa}` : '') + preparo;
}

/** Os comandos de um grupo: [{ comando, argumentos, cwd }]. */
function comandosDoGrupo(grupo, arquivos, extras) {
  const python = escolherPython();
  if (grupo.executor === 'node') return arquivos.map(arquivo => ({ comando: 'node', argumentos: [arquivo], cwd: RAIZ }));
  if (grupo.executor === 'unittest') {
    return [{ comando: python, argumentos: ['-m', 'unittest', 'discover', '-s', grupo.pasta, '-p', grupo.padrao, ...extras], cwd: RAIZ }];
  }
  if (grupo.executor === 'playwright') {
    return [{ comando: 'npx', argumentos: ['playwright', 'test', ...extras], cwd: path.join(RAIZ, grupo.pasta) }];
  }
  throw new Error(`executor desconhecido: ${grupo.executor}`);
}

function main(argv) {
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

  const falhas = [];
  for (const nome of escolhidos) {
    const grupo = registro.grupos[nome];
    const doGrupo = arquivosDoGrupo(grupo, arquivos);
    if (!doGrupo.length) {
      console.log(`✗ ${nome}: nenhum arquivo de teste casa com o grupo; conserte scripts/testes.json`);
      falhas.push(nome);
      continue;
    }
    for (const { comando, argumentos, cwd } of comandosDoGrupo(grupo, doGrupo, extras)) {
      console.log(`\n▶ ${nome}: ${[comando, ...argumentos].join(' ')}`);
      // O erro padrão passa por aqui para reconhecer o ModuleNotFoundError; o Playwright não o precisa.
      const lerErro = grupo.executor !== 'playwright';
      const resultado = spawnSync(comando, argumentos, { cwd, stdio: ['inherit', 'inherit', lerErro ? 'pipe' : 'inherit'], encoding: 'utf8', maxBuffer: 1 << 28 });
      if (resultado.stderr) process.stderr.write(resultado.stderr);
      if (resultado.error) {
        console.log(`✗ ${nome}: não consegui rodar ${comando} (${resultado.error.message})${grupo.precisa ? `; o grupo precisa de: ${grupo.precisa}` : ''}`);
        falhas.push(nome);
      } else if (resultado.status !== 0) {
        const dica = dicaDeModulo(nome, grupo, resultado.stderr || '');
        if (dica) console.log(dica);
        falhas.push(nome);
      }
    }
  }
  if (falhas.length) {
    console.log(`\nerror: falharam: ${[...new Set(falhas)].join(', ')}`);
    return 1;
  }
  console.log(`\ntestes ok: ${escolhidos.join(', ')}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (erro) {
    console.log(`error: ${erro.message}\nhelp: node scripts/testar.mjs --help; os grupos estão em scripts/testes.json`);
    process.exitCode = 1;
  }
}

'use strict';

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { arquivosComLinhasNovas, linhasNovas } = require('../regras/apoio-linhas-novas');

const RAIZ = path.resolve(__dirname, '..', '..');
const CONFIGURACAO_DO_ESLINT = path.join(RAIZ, 'scripts', 'regras', 'eslint.config.mjs');
const REGRAS_DO_RUFF = 'F,E9';
const SO_AVISAM = new Set(['no-unused-vars', 'F401', 'F841']);
const EH_JS = /\.(?:js|mjs|cjs)$/;
const EH_PY = /\.py$/;
const FORA = /(?:^|\/)(?:node_modules|dist)\//;

function argumentos(argv, env) {
  const valor = nome => (argv.includes(nome) ? argv[argv.indexOf(nome) + 1] : undefined);
  return { raiz: path.resolve(valor('--raiz') || RAIZ), base: valor('--base') || env.REGRAS_BASE || 'origin/main' };
}

function procurar(comando, args) {
  const achou = spawnSync(comando, args, { encoding: 'utf8', shell: false });
  return !achou.error && achou.status === 0;
}

const comandoDe = binario => (/\.m?js$/.test(binario) ? [process.execPath, [binario]] : [binario, []]);

function comandoDoEslint(env) {
  if (env.ESLINT_BIN) return comandoDe(env.ESLINT_BIN);
  if (procurar('npx', ['--no-install', 'eslint', '--version'])) return ['npx', ['--no-install', 'eslint']];
  return null;
}

function comandoDoRuff(env) {
  if (env.RUFF_BIN) return comandoDe(env.RUFF_BIN);
  if (procurar('ruff', ['--version'])) return ['ruff', []];
  return null;
}

function rodar([comando, fixos], args, raiz) {
  const r = spawnSync(comando, [...fixos, ...args], { cwd: raiz, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.error) throw r.error;
  return r;
}

function lerJson(r, ferramenta) {
  try {
    return JSON.parse(r.stdout);
  } catch {
    throw new Error(`${ferramenta} não devolveu um JSON legível (status ${r.status}): ${(r.stderr || r.stdout).slice(0, 400)}`);
  }
}

function achadosDoEslint(comando, arquivos, raiz) {
  const r = rodar(comando, ['--config', CONFIGURACAO_DO_ESLINT, '--format', 'json', '--no-warn-ignored', ...arquivos], raiz);
  return lerJson(r, 'eslint').flatMap(item => item.messages.map(m => ({
    arquivo: path.relative(raiz, item.filePath).split(path.sep).join('/'), linha: m.line, regra: m.ruleId || 'sintaxe', texto: m.message, fatal: m.fatal === true,
  })));
}

function achadosDoRuff(comando, arquivos, raiz) {
  const r = rodar(comando, ['check', '--isolated', '--no-cache', '--select', REGRAS_DO_RUFF, '--target-version', 'py39', '--output-format', 'json', ...arquivos], raiz);
  return lerJson(r, 'ruff').map(m => ({
    arquivo: path.relative(raiz, m.filename).split(path.sep).join('/'), linha: m.location.row, regra: m.code || 'sintaxe', texto: m.message, fatal: m.code === null,
  }));
}

function doQueMudou(achados, raiz, base) {
  return achados.filter(a => a.fatal || linhasNovas(a.arquivo, raiz, base).has(a.linha));
}

function ferramentaAusente(nome, env) {
  const exige = env.REGRAS_EXIGE_FERRAMENTAS === '1';
  const texto = `${nome} não está instalado${exige ? '' : ' (aqui a conferência é pulada; o CI exige)'}`;
  (exige ? console.error : console.warn)(`${exige ? '✗' : 'aviso:'} ${texto}`);
  return exige;
}

function conferir({ raiz, base, env }) {
  const tocados = arquivosComLinhasNovas(raiz, base).filter(a => !FORA.test(a) && fs.existsSync(path.join(raiz, a)));
  const grupos = [
    ['eslint', tocados.filter(a => EH_JS.test(a)), comandoDoEslint(env), achadosDoEslint],
    ['ruff', tocados.filter(a => EH_PY.test(a)), comandoDoRuff(env), achadosDoRuff],
  ];
  let falhou = false;
  const achados = [];
  for (const [nome, arquivos, comando, ler] of grupos) {
    if (!arquivos.length) continue;
    if (!comando) falhou = ferramentaAusente(nome, env) || falhou;
    else achados.push(...doQueMudou(ler(comando, arquivos, raiz), raiz, base));
  }
  return { achados, falhou, tocados };
}

function relatorio({ achados: todos, falhou, tocados }) {
  const avisos = todos.filter(a => SO_AVISAM.has(a.regra));
  const achados = todos.filter(a => !SO_AVISAM.has(a.regra));
  for (const a of avisos) console.warn(`aviso: ${a.arquivo}:${a.linha}: ${a.regra}: ${a.texto}`);
  for (const a of achados) console.error(`✗ ${a.arquivo}:${a.linha}: ${a.regra}: ${a.texto}`);
  if (achados.length) console.error(`Conserto: corrija as ${achados.length} linha(s) que esta mudança acrescentou; o que já estava no código não conta (ESLint: scripts/regras/eslint.config.mjs; ruff: ${REGRAS_DO_RUFF}).`);
  else if (!falhou) console.log(`lint ok: ${tocados.length} arquivo(s) tocado(s), nenhum achado que barre nas linhas acrescentadas (${avisos.length} aviso(s))`);
  return achados.length || falhou ? 1 : 0;
}

function principal(argv, env) {
  const { raiz, base } = argumentos(argv, env);
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', `${base}^{commit}`], { cwd: raiz, stdio: 'ignore' });
  } catch {
    console.error(`✗ a base ${base} não existe neste clone (git fetch origin main)`);
    return 1;
  }
  return relatorio(conferir({ raiz, base, env }));
}

if (require.main === module) process.exit(principal(process.argv.slice(2), process.env));

module.exports = { argumentos, achadosDoEslint, achadosDoRuff, doQueMudou, principal };

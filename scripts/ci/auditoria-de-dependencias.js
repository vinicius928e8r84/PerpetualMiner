'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { arquivosComLinhasNovas, textoNaBase } = require('../regras/apoio-linhas-novas');

const SEVERIDADES = ['high', 'critical'];
const EH_TRAVA_DO_NPM = /(?:^|\/)package-lock\.json$/;
const EH_REQUISITOS = /(?:^|\/)requirements[^/]*\.txt$/;

function argumentos(argv, env) {
  const valor = nome => (argv.includes(nome) ? argv[argv.indexOf(nome) + 1] : undefined);
  return { raiz: path.resolve(valor('--raiz') || path.resolve(__dirname, '..', '..')), base: valor('--base') || env.REGRAS_BASE || 'origin/main' };
}

function rodarFerramenta(comando, args, cwd, nome) {
  const deNode = /\.m?js$/.test(comando);
  const r = spawnSync(deNode ? process.execPath : comando, deNode ? [comando, ...args] : args, {
    cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: process.platform === 'win32' && comando === 'npm',
  });
  if (r.error) throw new Error(`${nome} não rodou: ${r.error.message}`);
  try {
    return JSON.parse(r.stdout);
  } catch {
    throw new Error(`${nome} não devolveu JSON em ${cwd} (status ${r.status}): ${String(r.stderr || r.stdout).split('\n')[0]}`);
  }
}

function altasDoNpm(json) {
  if (json.error) throw new Error(`o npm audit falhou: ${json.error.summary || json.error.code}`);
  return new Map(Object.entries(json.vulnerabilities || {}).filter(([, v]) => SEVERIDADES.includes(v.severity))
    .map(([nome, v]) => [nome, { severidade: v.severity, intervalo: v.range, titulos: (v.via || []).filter(x => typeof x === 'object').map(x => x.title).slice(0, 3) }]));
}

function novasDoNpm({ antes, depois }) {
  return [...depois].filter(([nome]) => !antes.has(nome))
    .map(([nome, v]) => `${nome} (${v.severidade}${v.intervalo ? `, ${v.intervalo}` : ''}) ${v.titulos.join('; ')}`.trim());
}

function projetoTemporario(pasta, packageJson, trava) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditoria-npm-'));
  fs.writeFileSync(path.join(dir, 'package.json'), packageJson);
  fs.writeFileSync(path.join(dir, 'package-lock.json'), trava);
  return dir;
}

function auditarNpm(trava, { raiz, base, env }) {
  const pasta = path.dirname(trava);
  const comando = env.NPM_BIN || 'npm';
  const rodar = (packageJson, texto) => {
    const dir = projetoTemporario(pasta, packageJson, texto);
    try {
      return altasDoNpm(rodarFerramenta(comando, ['audit', '--json', '--package-lock-only'], dir, 'npm audit'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
  const lerNaRaiz = nome => fs.readFileSync(path.join(raiz, pasta, nome), 'utf8');
  const baseJson = textoNaBase(path.posix.join(pasta, 'package.json'), raiz, base);
  const baseTrava = textoNaBase(trava, raiz, base);
  const antes = baseJson && baseTrava ? rodar(baseJson, baseTrava) : new Map();
  return novasDoNpm({ antes, depois: rodar(lerNaRaiz('package.json'), lerNaRaiz('package-lock.json')) }).map(texto => `${trava}: ${texto}`);
}

function idsDoPip(json) {
  const ids = new Map();
  for (const dependencia of json.dependencies || []) {
    for (const vuln of dependencia.vulns || []) ids.set(`${dependencia.name}:${vuln.id}`, `${dependencia.name} ${dependencia.version} ${vuln.id}`);
  }
  return ids;
}

function auditarPip(requisitos, { raiz, base, env }) {
  const comando = env.PIP_AUDIT_BIN || 'pip-audit';
  const rodar = texto => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditoria-pip-'));
    try {
      fs.writeFileSync(path.join(dir, 'requirements.txt'), texto);
      return idsDoPip(rodarFerramenta(comando, ['-r', path.join(dir, 'requirements.txt'), '--format', 'json', '--progress-spinner', 'off'], dir, 'pip-audit'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
  const antes = textoNaBase(requisitos, raiz, base);
  const ja = antes === null ? new Map() : rodar(antes);
  const depois = rodar(fs.readFileSync(path.join(raiz, requisitos), 'utf8'));
  return [...depois].filter(([chave]) => !ja.has(chave)).map(([, texto]) => `${requisitos}: ${texto}`);
}

function principal(argv, env) {
  const { raiz, base } = argumentos(argv, env);
  const tocados = arquivosComLinhasNovas(raiz, base).filter(a => fs.existsSync(path.join(raiz, a)));
  const travas = tocados.filter(a => EH_TRAVA_DO_NPM.test(a));
  const requisitos = tocados.filter(a => EH_REQUISITOS.test(a));
  if (!travas.length && !requisitos.length) {
    console.log('auditoria: nenhuma trava do npm nem requirements.txt mudou; nada a auditar');
    return 0;
  }
  const contexto = { raiz, base, env };
  const novas = [...travas.flatMap(t => auditarNpm(t, contexto)), ...requisitos.flatMap(r => auditarPip(r, contexto))];
  for (const nova of novas) console.error(`✗ ${nova}`);
  if (novas.length) console.error(`Conserto: troque ou atualize o pacote para uma versão sem a falha; a mudança não pode introduzir vulnerabilidade ${SEVERIDADES.join(' ou ')} (npm audit) nem nenhuma que o pip-audit aponte (ele não dá severidade).`);
  else console.log(`auditoria ok: ${[...travas, ...requisitos].join(', ')} não introduz vulnerabilidade nova`);
  return novas.length ? 1 : 0;
}

function executar(argv, env) {
  try {
    return principal(argv, env);
  } catch (erro) {
    console.error(`✗ ${erro.message}`);
    return 1;
  }
}

if (require.main === module) process.exit(executar(process.argv.slice(2), process.env));

module.exports = { altasDoNpm, idsDoPip, novasDoNpm, executar };

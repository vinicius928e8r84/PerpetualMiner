'use strict';

const fs = require('fs');
const path = require('path');

const ARQUIVO_DO_REGISTRO = 'scripts/testes.json';

const SPECS_DO_PLAYWRIGHT = 'e2e/tests/**/*.spec.js';

function ehArquivoDeTeste(arquivo) {
  return /(^|\/)test_[^/]*\.(js|mjs|py|sh)$/.test(arquivo) || /^e2e\/tests\/.+\.spec\.js$/.test(arquivo);
}

function padraoComoRegex(padrao) {
  const texto = padrao
    .split('**/')
    .map(parte => parte.split('*').map(p => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*'))
    .join('(?:.*/)?');
  return new RegExp(`^${texto}$`);
}

function padroesDoGrupo(grupo) {
  if (grupo.executor === 'node') return grupo.arquivos || [];
  if (grupo.executor === 'unittest') return [`${grupo.pasta}/${grupo.padrao}`];
  if (grupo.executor === 'playwright') return [SPECS_DO_PLAYWRIGHT];
  return [];
}

function arquivosDoGrupo(grupo, arquivos) {
  const regexes = padroesDoGrupo(grupo).map(padraoComoRegex);
  return arquivos.filter(arquivo => regexes.some(r => r.test(arquivo)));
}

const RESTAURAR = `restaure-o com \`git checkout origin/main -- ${ARQUIVO_DO_REGISTRO}\` ou corrija-o, e confira com \`node scripts/testar.mjs --listar\``;

function ondeQuebrou(texto, erro) {
  const posicao = /position (\d+)/.exec(erro.message);
  if (!posicao) return '';
  const antes = texto.slice(0, Number(posicao[1]));
  return ` perto da linha ${antes.split('\n').length}, coluna ${antes.length - antes.lastIndexOf('\n')}`;
}

const ehMapa = valor => Object.prototype.toString.call(valor) === '[object Object]';

function lerRegistro(raiz) {
  const caminho = path.join(raiz, ARQUIVO_DO_REGISTRO);
  if (!fs.existsSync(caminho)) throw new Error(`falta ${ARQUIVO_DO_REGISTRO}, o cadastro dos grupos de teste; ${RESTAURAR}`);
  const texto = fs.readFileSync(caminho, 'utf8');
  let registro;
  try {
    registro = JSON.parse(texto);
  } catch (erro) {
    throw new Error(`${ARQUIVO_DO_REGISTRO} não é um JSON válido (erro${ondeQuebrou(texto, erro)}: vírgula, aspas ou chave fora do lugar); ${RESTAURAR}`);
  }
  if (!ehMapa(registro?.grupos)) {
    throw new Error(`${ARQUIVO_DO_REGISTRO} não tem o objeto "grupos" (nome do grupo → { executor, … }); ${RESTAURAR}`);
  }
  return { grupos: registro.grupos, fora: registro.fora || [] };
}

function grupoDoArquivo(registro, arquivo) {
  return Object.entries(registro.grupos).find(([, grupo]) => padroesDoGrupo(grupo).some(p => padraoComoRegex(p).test(arquivo)))?.[0] || null;
}

const VENV_PYTHON = path.join('.venv', 'bin', 'python');

function escolherPython(env, raiz) {
  if (env.PYTHON) return { comando: env.PYTHON, origem: 'PYTHON' };
  const doVenv = path.join(raiz, VENV_PYTHON);
  return fs.existsSync(doVenv) ? { comando: doVenv, origem: 'venv' } : { comando: 'python3', origem: 'python3' };
}

function dicaDeModulo(nome, grupo, saidaDeErro, python) {
  if (!/ModuleNotFoundError/.test(saidaDeErro)) return '';
  const falta = /No module named '([^']+)'/.exec(saidaDeErro);
  const precisa = python.origem === 'venv' && grupo.precisa ? grupo.precisa.replace(/\bpip install/g, '.venv/bin/python -m pip install') : grupo.precisa;
  const preparo = python.origem === 'python3'
    ? '\n  numa worktree nova: scripts/preparar-python.sh cria o .venv e instala tudo; este comando passa a usá-lo sozinho'
    : '';
  return `✗ ${nome}: falta o módulo ${falta ? falta[1] : 'do Python'}`
    + (precisa ? `; o grupo precisa de: ${precisa}` : '') + preparo;
}

const RAMOS_SEM_BASE = new Set(['main', 'HEAD']);

const versaoJaFixada = env => env.PM_VERSAO_BASE !== undefined || Boolean(env.CI);

const ehRamoDeTrabalho = ramo => Boolean(ramo) && !RAMOS_SEM_BASE.has(ramo);

function baseDaVersao(env, ramo, temOrigemMain) {
  if (versaoJaFixada(env) || !temOrigemMain) return null;
  return ehRamoDeTrabalho(ramo) ? 'origin/main' : null;
}

function trabalhadoresDoGrupo(grupo, env) {
  const pedido = Number(env.PM_PARALELO || grupo.paralelo || 1);
  return Number.isInteger(pedido) && pedido > 1 ? pedido : 1;
}

function tetoEmSegundos(env) {
  const teto = Number(env.PM_TETO_S);
  return teto > 0 ? teto : null;
}

function estourouOTeto(segundos, teto) {
  return teto !== null && segundos > teto;
}

const interpreteDoArquivo = arquivo => (arquivo.endsWith('.sh') ? 'bash' : 'node');

module.exports = {
  tetoEmSegundos, estourouOTeto, trabalhadoresDoGrupo, ARQUIVO_DO_REGISTRO, ehArquivoDeTeste, padraoComoRegex, arquivosDoGrupo, lerRegistro, grupoDoArquivo,
  escolherPython, dicaDeModulo, baseDaVersao, interpreteDoArquivo,
};

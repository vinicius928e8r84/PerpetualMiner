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

function textoDoRegistro(raiz) {
  const caminho = path.join(raiz, ARQUIVO_DO_REGISTRO);
  if (!fs.existsSync(caminho)) throw new Error(`falta ${ARQUIVO_DO_REGISTRO}, o cadastro dos grupos de teste; ${RESTAURAR}`);
  return fs.readFileSync(caminho, 'utf8');
}

function jsonDoRegistro(texto) {
  try {
    return JSON.parse(texto);
  } catch (erro) {
    throw new Error(`${ARQUIVO_DO_REGISTRO} não é um JSON válido (erro${ondeQuebrou(texto, erro)}: vírgula, aspas ou chave fora do lugar); ${RESTAURAR}`);
  }
}

function lerRegistro(raiz) {
  const registro = jsonDoRegistro(textoDoRegistro(raiz));
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

const faltaOModulo = saidaDeErro => /ModuleNotFoundError/.test(saidaDeErro);

function moduloQueFalta(saidaDeErro) {
  const falta = /No module named '([^']+)'/.exec(saidaDeErro);
  return falta ? falta[1] : 'do Python';
}

function instalacaoDoGrupo(grupo, python) {
  const noVenv = python.origem === 'venv' && grupo.precisa;
  return noVenv ? grupo.precisa.replace(/\bpip install/g, '.venv/bin/python -m pip install') : grupo.precisa;
}

const PREPARO_DA_WORKTREE_NOVA = '\n  numa worktree nova: scripts/preparar-python.sh cria o .venv e instala tudo; este comando passa a usá-lo sozinho';

const preparoDoPython = python => (python.origem === 'python3' ? PREPARO_DA_WORKTREE_NOVA : '');

function dicaDeModulo(nome, grupo, saidaDeErro, python) {
  if (!faltaOModulo(saidaDeErro)) return '';
  const precisa = instalacaoDoGrupo(grupo, python);
  return `✗ ${nome}: falta o módulo ${moduloQueFalta(saidaDeErro)}`
    + (precisa ? `; o grupo precisa de: ${precisa}` : '') + preparoDoPython(python);
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

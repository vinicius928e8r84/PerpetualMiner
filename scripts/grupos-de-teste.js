'use strict';

// Os grupos de teste do repositório (scripts/testes.json) e quais arquivos cada um
// roda. O executor (`scripts/testar.mjs`) e a regra `testes-no-portao` (scripts/regras/)
// leem daqui, então o que o CI executa e o que a regra acha que ele executa são a
// mesma lista: um grupo é quem diz que arquivos o seu comando roda.

const fs = require('fs');
const path = require('path');

const ARQUIVO_DO_REGISTRO = 'scripts/testes.json';

// O que o Playwright descobre sozinho dentro de `e2e/tests/` (o `testMatch` dele).
const SPECS_DO_PLAYWRIGHT = 'e2e/tests/**/*.spec.js';

function ehArquivoDeTeste(arquivo) {
  return /(^|\/)test_[^/]*\.(js|mjs|py|sh)$/.test(arquivo) || /^e2e\/tests\/.+\.spec\.js$/.test(arquivo);
}

/** O padrão como expressão regular: `*` não passa de uma pasta; `**` + `/` passa por zero ou mais. */
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

/** Os arquivos de `arquivos` (relativos à raiz, com `/`) que o grupo roda. */
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

/** O registro lido de `raiz`; um arquivo ausente ou quebrado é um erro que diz o que fazer. */
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
  if (!registro || typeof registro.grupos !== 'object' || registro.grupos === null || Array.isArray(registro.grupos)) {
    throw new Error(`${ARQUIVO_DO_REGISTRO} não tem o objeto "grupos" (nome do grupo → { executor, … }); ${RESTAURAR}`);
  }
  return { grupos: registro.grupos, fora: registro.fora || [] };
}

/** O nome do grupo que roda `arquivo` (ou null), olhando só os padrões. */
function grupoDoArquivo(registro, arquivo) {
  return Object.entries(registro.grupos).find(([, grupo]) => padroesDoGrupo(grupo).some(p => padraoComoRegex(p).test(arquivo)))?.[0] || null;
}

const VENV_PYTHON = path.join('.venv', 'bin', 'python');

/** O Python dos testes e de onde veio: $PYTHON (o CI passa o seu), senão o .venv da raiz, senão python3. */
function escolherPython(env, raiz) {
  if (env.PYTHON) return { comando: env.PYTHON, origem: 'PYTHON' };
  const doVenv = path.join(raiz, VENV_PYTHON);
  return fs.existsSync(doVenv) ? { comando: doVenv, origem: 'venv' } : { comando: 'python3', origem: 'python3' };
}

function dicaDeModulo(nome, grupo, saidaDeErro, python) {
  if (!/ModuleNotFoundError/.test(saidaDeErro)) return '';
  const falta = /No module named '([^']+)'/.exec(saidaDeErro);
  // No .venv um pip solto instalaria fora dele; o Python do venv instala nele.
  const precisa = python.origem === 'venv' && grupo.precisa ? grupo.precisa.replace(/\bpip install/g, '.venv/bin/python -m pip install') : grupo.precisa;
  const preparo = python.origem === 'python3'
    ? '\n  numa worktree nova: scripts/preparar-python.sh cria o .venv e instala tudo; este comando passa a usá-lo sozinho'
    : '';
  return `✗ ${nome}: falta o módulo ${falta ? falta[1] : 'do Python'}`
    + (precisa ? `; o grupo precisa de: ${precisa}` : '') + preparo;
}

/**
 * A base de `PM_VERSAO_BASE` (complemento/empacotar.py `versao_vem_no_merge`): numa branch de trabalho a versão é dada no merge,
 * então o hash e o `.ankiaddon` só são conferidos na main. O CI de uma PR passa a sua (HEAD^1), o da main não passa nenhuma.
 * `ramo` é o da árvore ('HEAD' solta); null quando não há o que pular.
 */
function baseDaVersao(env, ramo, temOrigemMain) {
  if (env.PM_VERSAO_BASE !== undefined || env.CI || !temOrigemMain) return null;
  return ramo && ramo !== 'main' && ramo !== 'HEAD' ? 'origin/main' : null;
}

module.exports = {
  ARQUIVO_DO_REGISTRO, ehArquivoDeTeste, padraoComoRegex, padroesDoGrupo, arquivosDoGrupo, lerRegistro, grupoDoArquivo,
  escolherPython, dicaDeModulo, baseDaVersao,
};

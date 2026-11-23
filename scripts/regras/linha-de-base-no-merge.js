'use strict';

const { execFileSync } = require('child_process');
const { renomeacoes } = require('./comum');

const id = 'linha-de-base-no-merge';

const ARQUIVO_DAS_REGRAS = 'scripts/regras/linha-de-base.json';
const ARQUIVO_DE_TAMANHO = 'scripts/ganchos/linha-de-base-de-tamanho.json';
const ARQUIVOS = [ARQUIVO_DAS_REGRAS, ARQUIVO_DE_TAMANHO];
const ASSUNTO = 'Linha de base: desce no merge';

const conserto = `Desfaça a edição: \`git restore --source=origin/main -- ${ARQUIVOS.join(' ')}\`. `
  + 'A linha de base desce no merge: a PR só conserta o código. '
  + 'Depois do merge, `node scripts/regras/baixar-no-merge.js` baixa as duas num commit só.';

const seAplica = arquivo => ARQUIVOS.includes(arquivo);

const emPr = () => process.env.GITHUB_EVENT_NAME === 'pull_request' || process.env.REGRAS_PR === '1';

const git = (raiz, args) => {
  try {
    return { texto: execFileSync('git', args, { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }), ok: true };
  } catch (erro) {
    return { texto: '', ok: false, status: erro.status };
  }
};

const entradasPorGrupo = (arquivo, json) => (arquivo === ARQUIVO_DE_TAMANHO ? { tamanho: json.arquivos || {} } : json);

function lerEntradas(arquivo, texto) {
  try {
    return entradasPorGrupo(arquivo, JSON.parse(texto));
  } catch {
    return null;
  }
}

function esperadoPelaBase(daBase, hoje, velhoDe) {
  const novoDe = Object.fromEntries(Object.entries(velhoDe).map(([novo, velho]) => [velho, novo]));
  const esperado = {};
  for (const [grupo, entradas] of Object.entries(daBase)) {
    esperado[grupo] = Object.fromEntries(Object.entries(entradas).map(([caminho, n]) => [novoDe[caminho] || caminho, n]));
  }
  for (const grupo of Object.keys(hoje)) if (!(grupo in daBase)) esperado[grupo] = hoje[grupo];
  return esperado;
}

function diferencas(esperado, hoje) {
  const achadas = [];
  for (const grupo of new Set([...Object.keys(esperado), ...Object.keys(hoje)])) {
    const antes = esperado[grupo] || {};
    const agora = hoje[grupo] || {};
    for (const caminho of new Set([...Object.keys(antes), ...Object.keys(agora)])) {
      if (antes[caminho] !== agora[caminho]) achadas.push({ grupo, caminho, antes: antes[caminho], agora: agora[caminho] });
    }
  }
  return achadas;
}

function descricaoDaDiferenca({ grupo, caminho, antes, agora }) {
  const onde = grupo === 'tamanho' ? caminho : `${grupo} ${caminho}`;
  if (antes === undefined) return `${onde} entrou na linha de base com ${agora}`;
  if (agora === undefined) return `${onde} saiu da linha de base, onde a base tem ${antes}`;
  return `${onde} foi de ${antes} para ${agora}`;
}

const linhaDoCaminho = (fonte, caminho) => {
  const indice = fonte.indexOf(JSON.stringify(caminho));
  return indice < 0 ? 1 : fonte.slice(0, indice).split('\n').length;
};

const daBase = (raiz, desde, arquivo) => {
  const lida = git(raiz, ['show', `${desde}:${arquivo}`]);
  return lida.ok ? lerEntradas(arquivo, lida.texto) : null;
};

function ehCommitDeLinhaDeBase(raiz, sha, assunto) {
  if (assunto !== ASSUNTO) return false;
  const tocados = git(raiz, ['show', '--name-only', '--format=', sha]).texto.split('\n').filter(Boolean);
  return tocados.every(arquivo => ARQUIVOS.includes(arquivo));
}

function soOsCommitsDeLinhaDeBase(raiz, desde) {
  if (git(raiz, ['diff', '--quiet', 'HEAD', '--', ...ARQUIVOS]).status === 1) return false;
  const log = git(raiz, ['log', '--no-merges', '--format=%H %s', `${desde}..HEAD`, '--', ...ARQUIVOS]);
  const commits = log.texto.split('\n').filter(Boolean).map(linha => [linha.slice(0, linha.indexOf(' ')), linha.slice(linha.indexOf(' ') + 1)]);
  return commits.length > 0 && commits.every(([sha, assunto]) => ehCommitDeLinhaDeBase(raiz, sha, assunto));
}

function verificar(arquivo, fonte, raiz, base) {
  if (!base || !emPr()) return [];
  const origem = git(raiz, ['merge-base', base, 'HEAD']);
  const desde = origem.ok ? origem.texto.trim() : base;
  const antes = daBase(raiz, desde, arquivo);
  const hoje = lerEntradas(arquivo, fonte);
  if (!antes || !hoje) return [];
  const achadas = diferencas(esperadoPelaBase(antes, hoje, renomeacoes(raiz, desde)), hoje);
  if (!achadas.length || soOsCommitsDeLinhaDeBase(raiz, desde)) return [];
  return achadas.map(achada => ({ linha: linhaDoCaminho(fonte, achada.caminho), detalhe: `a linha de base desce no merge, e esta PR a mexe à mão: ${descricaoDaDiferenca(achada)}` }));
}

module.exports = { id, conserto, seAplica, verificar, ARQUIVOS, ASSUNTO };

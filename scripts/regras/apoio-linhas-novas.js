'use strict';

const { execFileSync } = require('child_process');

const CABECALHO_DO_ARQUIVO = /^\+\+\+ b\/(.+)$/;
const CABECALHO_DO_HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

function git(raiz, args) {
  return execFileSync('git', ['-c', 'core.quotepath=false', ...args], {
    cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024,
  });
}

function linhasDoHunk(cabecalho) {
  const hunk = CABECALHO_DO_HUNK.exec(cabecalho);
  if (!hunk) return [];
  const quantas = hunk[2] === undefined ? 1 : Number(hunk[2]);
  return Array.from({ length: quantas }, (_, i) => Number(hunk[1]) + i);
}

class LeitorDoDiff {
  constructor() {
    this.porArquivo = new Map();
    this.atual = null;
    this.noCabecalho = false;
  }

  ler(linha) {
    if (linha.startsWith('diff --git ')) this.abrirArquivo();
    else if (this.noCabecalho && linha.startsWith('+++ ')) this.nomearArquivo(linha);
    else if (linha.startsWith('@@')) this.lerHunk(linha);
  }

  abrirArquivo() {
    this.noCabecalho = true;
    this.atual = null;
  }

  nomearArquivo(linha) {
    const arquivo = CABECALHO_DO_ARQUIVO.exec(linha);
    this.atual = null;
    if (!arquivo) return;
    this.atual = new Set();
    this.porArquivo.set(arquivo[1], this.atual);
  }

  lerHunk(linha) {
    this.noCabecalho = false;
    if (!this.atual) return;
    for (const numero of linhasDoHunk(linha)) this.atual.add(numero);
  }
}

function linhasAcrescentadas(texto) {
  const leitor = new LeitorDoDiff();
  for (const linha of texto.split('\n')) leitor.ler(linha);
  return leitor.porArquivo;
}

const mudancas = new Map();

const lista = saida => saida.split('\0').filter(Boolean);

function lerMudancas(raiz, base) {
  let desde;
  try {
    desde = git(raiz, ['merge-base', 'HEAD', base]).trim();
  } catch {
    throw new Error(`${base} e o HEAD não têm um ancestral comum; sem ele não há como saber o que a mudança acrescentou`);
  }
  const diff = git(raiz, ['diff', '-U0', '-M', '--no-color', '--no-ext-diff', desde]);
  const novos = lista(git(raiz, ['ls-files', '--others', '--exclude-standard', '-z']));
  const criados = lista(git(raiz, ['diff', '--name-only', '--diff-filter=A', '-M', '-z', desde]));
  return { desde, acrescentadas: linhasAcrescentadas(diff), novos: new Set(novos), criados: new Set([...criados, ...novos]) };
}

function mudancasDesde(raiz, base) {
  const chave = `${raiz}\0${base}`;
  if (!mudancas.has(chave)) mudancas.set(chave, lerMudancas(raiz, base));
  return mudancas.get(chave);
}

const NENHUMA_LINHA = new Set();
const TODAS_AS_LINHAS = { has: () => true };

function linhasNovas(arquivo, raiz, base) {
  if (!base) return NENHUMA_LINHA;
  const mudou = mudancasDesde(raiz, base);
  if (mudou.novos.has(arquivo)) return TODAS_AS_LINHAS;
  return mudou.acrescentadas.get(arquivo) || NENHUMA_LINHA;
}

function arquivoCriado(arquivo, raiz, base) {
  return Boolean(base) && mudancasDesde(raiz, base).criados.has(arquivo);
}

function arquivosComLinhasNovas(raiz, base) {
  if (!base) return [];
  const mudou = mudancasDesde(raiz, base);
  return [...new Set([...mudou.acrescentadas.keys(), ...mudou.novos])].sort();
}

function textoNaBase(arquivo, raiz, base) {
  if (!base) return null;
  try {
    return git(raiz, ['show', `${mudancasDesde(raiz, base).desde}:${arquivo}`]);
  } catch {
    return null;
  }
}

module.exports = { NENHUMA_LINHA, TODAS_AS_LINHAS, arquivoCriado, arquivosComLinhasNovas, linhasNovas, textoNaBase };

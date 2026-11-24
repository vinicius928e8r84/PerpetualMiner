'use strict';

const fs = require('fs');
const path = require('path');

const id = 'link-de-doc';

const conserto = 'Aponte o link para o arquivo ou o título que existe hoje (o arquivo, e o título na forma do GitHub: '
  + 'minúsculas, espaços viram `-`, sem pontuação; a mensagem sugere os títulos parecidos), ou tire o link.';

const seAplica = arquivo => arquivo.endsWith('.md');

const branco = texto => texto.replace(/[^\n]/g, ' ');

const ABRE_A_CERCA = /^ {0,3}(`{3,}|~{3,})/;
const SO_A_MARCA_DA_CERCA = /^ {0,3}[`~]+\s*$/;
const CODIGO_EM_LINHA = /(`+)(?!`)[\s\S]*?[^`]\1(?!`)/g;

function fechaACerca(linha, marca, aberta) {
  return marca[0] === aberta[0] && marca.length >= aberta.length && SO_A_MARCA_DA_CERCA.test(linha);
}

class CercaDeCodigo {
  constructor() {
    this.aberta = null;
  }

  contem(linha) {
    const abre = ABRE_A_CERCA.exec(linha);
    if (this.aberta) return this.continuaAberta(linha, abre);
    if (abre) this.aberta = abre[1];
    return Boolean(abre);
  }

  continuaAberta(linha, abre) {
    if (abre && fechaACerca(linha, abre[1], this.aberta)) this.aberta = null;
    return true;
  }
}

function semCodigoEmLinha(linha, manterCrases) {
  return manterCrases ? linha : linha.replace(CODIGO_EM_LINHA, trecho => branco(trecho));
}

function semCodigo(fonte, { manterCrases = false } = {}) {
  const cerca = new CercaDeCodigo();
  return fonte.replace(/\r\n/g, '\n').split('\n')
    .map(linha => (cerca.contem(linha) ? branco(linha) : semCodigoEmLinha(linha, manterCrases)))
    .join('\n');
}

const sinalDeEsquema = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

const EM_LINHA = /\]\(\s*(<[^>\n]*>|[^\s()]*(?:\([^\s()]*\)[^\s()]*)*)/g;
const DEFINICAO = /^ {0,3}\[[^\]\n]+\]:\s*(<[^>\n]*>|\S+)/;
const EM_HTML = /<(?:a|img)\b[^>]*?\b(?:href|src)=(?:"([^"]*)"|'([^']*)')/gi;

function linksDaLinha(linha) {
  const achados = [];
  const limpar = bruto => bruto.replace(/^<|>$/g, '');
  const definicao = DEFINICAO.exec(linha);
  if (definicao) achados.push({ alvo: limpar(definicao[1]), texto: linha.trim() });
  for (const m of linha.matchAll(EM_LINHA)) {
    const inicio = linha.lastIndexOf('[', m.index);
    achados.push({ alvo: limpar(m[1]), texto: linha.slice(inicio < 0 ? m.index : inicio, m.index + m[0].length) + ')' });
  }
  for (const m of linha.matchAll(EM_HTML)) achados.push({ alvo: m[1] ?? m[2], texto: m[0] });
  return achados.filter(a => a.alvo);
}

function ancoraDoTitulo(titulo) {
  return titulo
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[`*~]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

const TITULO_ATX = /^ {0,3}#{1,6}[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const SUBLINHADO_SETEXT = /^ {0,3}(?:=+|-+)[ \t]*$/;
const NAO_E_PARAGRAFO = /^ {0,3}(?:#|>|[-*+] |\d+[.)] |\||$)/;
const ID_OU_NAME = /<[a-z][^>]*?\b(?:id|name)=(?:"([^"]+)"|'([^']+)')/gi;

function ehParagrafo(linha) {
  return /\S/.test(linha) && !NAO_E_PARAGRAFO.test(linha);
}

function sublinhaOParagrafoAnterior(linhas, i) {
  return i > 0 && SUBLINHADO_SETEXT.test(linhas[i]) && ehParagrafo(linhas[i - 1]);
}

function tituloDaLinha(linhas, i) {
  const atx = TITULO_ATX.exec(linhas[i]);
  if (atx) return atx[1];
  return sublinhaOParagrafoAnterior(linhas, i) ? linhas[i - 1].trim() : null;
}

function titulosDe(linhas) {
  return linhas.map((_, i) => tituloDaLinha(linhas, i)).filter(titulo => titulo !== null);
}

function ancorasDosTitulos(titulos) {
  const vistos = new Map();
  return titulos.map(titulo => {
    const base = ancoraDoTitulo(titulo);
    const repeticao = vistos.get(base) || 0;
    vistos.set(base, repeticao + 1);
    return { ancora: repeticao ? `${base}-${repeticao}` : base, titulo };
  });
}

function ancorasDe(fonte) {
  const limpo = semCodigo(fonte);
  const linhas = semCodigo(fonte, { manterCrases: true }).split('\n');
  const explicitas = [...limpo.matchAll(ID_OU_NAME)].map(m => (m[1] ?? m[2]).toLowerCase());
  return { ancoras: ancorasDosTitulos(titulosDe(linhas)), explicitas };
}

function temAncora({ ancoras, explicitas }, ancora) {
  return ancoras.some(a => a.ancora === ancora) || explicitas.includes(ancora);
}

function parecidas(pedida, ancoras) {
  return ancoras.filter(a => a.ancora && (a.ancora.startsWith(pedida) || pedida.startsWith(a.ancora) || a.ancora.includes(pedida)))
    .slice(0, 3).map(a => `#${a.ancora}`);
}

function decodificar(texto) {
  try {
    return decodeURIComponent(texto);
  } catch {
    return texto;
  }
}

const PARTES_DO_ALVO = /^([^#?]*)(?:\?[^#]*)?(?:#(.*))?$/;
const ANCORA_DE_LINHA = /^l\d+(?:-l\d+)?$/;

function partesDoAlvo(alvo) {
  const jogo = PARTES_DO_ALVO.exec(alvo);
  return { caminho: decodificar(jogo[1]), ancora: jogo[2] === undefined ? null : decodificar(jogo[2]).toLowerCase() };
}

function destinoDoCaminho(arquivo, caminho) {
  return caminho.startsWith('/')
    ? path.posix.normalize(caminho.slice(1))
    : path.posix.normalize(path.posix.join(path.posix.dirname(arquivo), caminho));
}

function ehAncoraDeTitulo(ancora) {
  return Boolean(ancora) && !ANCORA_DE_LINHA.test(ancora);
}

function pastaDoLink(arquivo) {
  const pasta = path.posix.dirname(arquivo);
  return pasta === '.' ? './' : `${pasta}/`;
}

function comSugestao(sugestao) {
  return sugestao.length ? ` (títulos parecidos: ${sugestao.join(', ')})` : '';
}

class LinksDoDocumento {
  constructor(arquivo, fonte, raiz) {
    this.arquivo = arquivo;
    this.fonte = fonte;
    this.raiz = raiz;
    this.doDestino = new Map();
  }

  problemaDe({ alvo, texto }) {
    if (sinalDeEsquema.test(alvo)) return null;
    const { caminho, ancora } = partesDoAlvo(alvo);
    const link = { texto, caminho, ancora, destino: caminho ? destinoDoCaminho(this.arquivo, caminho) : this.arquivo };
    if (caminho && !this.existe(link.destino)) return this.caminhoQuebrado(link);
    return this.ancoraQueFalta(link);
  }

  existe(destino) {
    return !destino.startsWith('..') && fs.existsSync(path.join(this.raiz, destino));
  }

  ehDocumento(destino) {
    return destino.endsWith('.md') && (destino === this.arquivo || fs.statSync(path.join(this.raiz, destino)).isFile());
  }

  ancorasDoDestino(destino) {
    if (!this.doDestino.has(destino)) {
      this.doDestino.set(destino, ancorasDe(destino === this.arquivo ? this.fonte : fs.readFileSync(path.join(this.raiz, destino), 'utf8')));
    }
    return this.doDestino.get(destino);
  }

  caminhoQuebrado({ texto, caminho, destino }) {
    const fora = destino.startsWith('..');
    return `o link ${texto} (relativo a \`${pastaDoLink(this.arquivo)}\`) aponta para `
      + `\`${fora ? caminho : destino}\`, ${fora ? 'que está fora do repositório' : 'que não existe'}; conserte o link em ${this.arquivo}`;
  }

  ancoraQueFalta({ texto, ancora, destino }) {
    if (!ehAncoraDeTitulo(ancora) || !this.ehDocumento(destino)) return null;
    const doDestino = this.ancorasDoDestino(destino);
    if (temAncora(doDestino, ancora)) return null;
    const onde = destino === this.arquivo ? 'este arquivo' : `\`${destino}\``;
    return `o link ${texto} aponta para a âncora \`#${ancora}\`, que ${onde} não tem`
      + `${comSugestao(parecidas(ancora, doDestino.ancoras))}; conserte o link em ${this.arquivo}`;
  }
}

function verificar(arquivo, fonte, raiz) {
  const links = new LinksDoDocumento(arquivo, fonte, raiz);
  return semCodigo(fonte).split('\n').flatMap((linha, i) => linksDaLinha(linha)
    .map(link => links.problemaDe(link))
    .filter(Boolean)
    .map(detalhe => ({ linha: i + 1, detalhe })));
}

module.exports = { id, conserto, seAplica, verificar };

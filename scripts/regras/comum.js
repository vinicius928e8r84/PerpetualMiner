'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { ehDaExtensao } = require('../arquivos-do-pacote');

function arquivosDoRepositorio(raiz) {
  const saida = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: raiz, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  return [...new Set(saida.split('\0').filter(Boolean))]
    .filter(arquivo => fs.existsSync(path.join(raiz, arquivo)))
    .sort();
}

function renomeacoes(raiz, desde) {
  if (!desde) return {};
  let saida;
  try {
    saida = execFileSync('git', ['diff', '-M', '--name-status', '--diff-filter=R', '-z', desde], { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return {};
  }
  const partes = saida.split('\0').filter(Boolean);
  const velhoDe = {};
  for (let i = 0; i + 2 < partes.length; i += 3) velhoDe[partes[i + 2]] = partes[i + 1];
  return velhoDe;
}

function ehJsDaExtensao(arquivo) {
  return arquivo.endsWith('.js') && ehDaExtensao(arquivo) && !/^test_/.test(arquivo);
}

function linhaDe(texto, indice) {
  let linha = 1;
  for (let i = 0; i < indice; i++) if (texto.charCodeAt(i) === 10) linha++;
  return linha;
}

function apagar(trecho) {
  return trecho.replace(/[^\n]/g, ' ');
}

function ehAspa(c) {
  return c === '"' || c === "'";
}

function ehAspaJs(c) {
  return ehAspa(c) || c === '`';
}

function fimDaString(texto, i) {
  const aspa = texto[i];
  let j = i + 1;
  while (j < texto.length && texto[j] !== aspa) j += texto[j] === '\\' ? 2 : 1;
  return Math.min(j, texto.length - 1);
}

function fimDaLinha(fonte, i) {
  const fim = fonte.indexOf('\n', i);
  return fim < 0 ? fonte.length : fim;
}

function fimDoBloco(fonte, i, abre, fecha) {
  const fim = fonte.indexOf(fecha, i + abre.length);
  return fim < 0 ? fonte.length : fim + fecha.length;
}

function lerComentarios(fonte, linguagem) {
  const comentarios = [];
  let i = 0;
  while (i < fonte.length) {
    const fimDoComentario = linguagem.fimDoComentario(fonte, i);
    if (fimDoComentario >= 0) {
      comentarios.push([i, fimDoComentario]);
      i = fimDoComentario;
    } else i = linguagem.depoisDoCodigo(fonte, i, comentarios);
  }
  return comentarios;
}

function fimDoComentarioJs(fonte, i) {
  if (fonte.startsWith('//', i)) return fimDaLinha(fonte, i);
  if (fonte.startsWith('/*', i)) return fimDoBloco(fonte, i, '/*', '*/');
  return -1;
}

const OPERADORES_ANTES_DA_REGEX = '(,=:[!&|?{};+-*%<>~^';
const PALAVRA_ANTES_DA_REGEX = /\b(return|typeof|case|in|of)\s*$/;

function ehComecoDeExpressao(anterior) {
  return anterior === '' || OPERADORES_ANTES_DA_REGEX.includes(anterior);
}

function comecaRegex(c, anterior, codigo) {
  if (c !== '/') return false;
  return ehComecoDeExpressao(anterior) || PALAVRA_ANTES_DA_REGEX.test(codigo);
}

function fimDaRegex(fonte, i) {
  let naClasse = false;
  let j = i + 1;
  while (j < fonte.length && fonte[j] !== '\n') {
    const c = fonte[j];
    if (c === '/' && !naClasse) return j;
    if (c === '\\') j++;
    else if (c === '[' || c === ']') naClasse = c === '[';
    j++;
  }
  return j;
}

function depoisDoCodigoJs(fonte, i, anterior, codigo) {
  if (ehAspaJs(fonte[i])) return fimDaString(fonte, i) + 1;
  if (comecaRegex(fonte[i], anterior, codigo)) return fimDaRegex(fonte, i) + 1;
  return i + 1;
}

function separarJs(fonte) {
  const comentarios = [];
  let codigo = '';
  let anterior = '';
  let i = 0;
  while (i < fonte.length) {
    const fimDoComentario = fimDoComentarioJs(fonte, i);
    if (fimDoComentario >= 0) {
      comentarios.push([i, fimDoComentario]);
      codigo += apagar(fonte.slice(i, fimDoComentario));
      i = fimDoComentario;
      continue;
    }
    const fim = depoisDoCodigoJs(fonte, i, anterior, codigo);
    codigo += fonte.slice(i, fim);
    if (!/\s/.test(fonte[i])) anterior = fonte[i];
    i = fim;
  }
  return { codigo, comentarios };
}

function comentariosJs(fonte) {
  return separarJs(fonte).comentarios;
}

function semComentariosJs(fonte) {
  return separarJs(fonte).codigo;
}

const CSS = {
  fimDoComentario: (fonte, i) => (fonte.startsWith('/*', i) ? fimDoBloco(fonte, i, '/*', '*/') : -1),
  depoisDoCodigo: (fonte, i) => (ehAspa(fonte[i]) ? fimDaString(fonte, i) + 1 : i + 1),
};

function comentariosCss(fonte) {
  return lerComentarios(fonte, CSS);
}

function semTrechos(fonte, trechos) {
  let saida = '';
  let ondeEstou = 0;
  for (const [de, ate] of trechos) {
    saida += fonte.slice(ondeEstou, de) + apagar(fonte.slice(de, ate));
    ondeEstou = ate;
  }
  return saida + fonte.slice(ondeEstou);
}

function semComentariosCss(fonte) {
  return semTrechos(fonte, comentariosCss(fonte));
}

const mover = (trechos, deslocamento) => trechos.map(([de, ate]) => [de + deslocamento, ate + deslocamento]);

const ABERTURA_DE_TAG = /^<([a-zA-Z][\w-]*)/;
const COMENTARIOS_DO_MIOLO = new Map([['style', comentariosCss], ['script', comentariosJs]]);

function depoisDoCaractereDaTag(fonte, j) {
  if (!ehAspa(fonte[j])) return j + 1;
  const aspa = fonte.indexOf(fonte[j], j + 1);
  return aspa < 0 ? fonte.length : aspa + 1;
}

function fimDaTagForaDasAspas(fonte, j) {
  while (j < fonte.length && fonte[j] !== '>') j = depoisDoCaractereDaTag(fonte, j);
  return j;
}

function fimDoMiolo(fonte, i, nome) {
  const fecha = fonte.slice(i).search(new RegExp(`</${nome}\\s*>`, 'i'));
  return fecha < 0 ? fonte.length : i + fecha;
}

function depoisDaTag(fonte, i, comentarios) {
  const tag = fonte[i] === '<' && ABERTURA_DE_TAG.exec(fonte.slice(i, i + 40));
  if (!tag) return i + 1;
  const miolo = fimDaTagForaDasAspas(fonte, i + tag[0].length) + 1;
  const nome = tag[1].toLowerCase();
  const comentariosDoMiolo = COMENTARIOS_DO_MIOLO.get(nome);
  if (!comentariosDoMiolo) return miolo;
  const ate = fimDoMiolo(fonte, miolo, nome);
  comentarios.push(...mover(comentariosDoMiolo(fonte.slice(miolo, ate)), miolo));
  return ate;
}

const HTML = {
  fimDoComentario: (fonte, i) => (fonte.startsWith('<!--', i) ? fimDoBloco(fonte, i, '<!--', '-->') : -1),
  depoisDoCodigo: depoisDaTag,
};

function comentariosHtml(fonte) {
  return lerComentarios(fonte, HTML);
}

function semComentariosHtml(fonte) {
  return semTrechos(fonte, comentariosHtml(fonte));
}

function continuaNaStringCurtaPy(fonte, j, aspa) {
  return j < fonte.length && fonte[j] !== aspa && fonte[j] !== '\n';
}

function fimDaStringPy(fonte, i) {
  const tripla = fonte[i].repeat(3);
  if (fonte.startsWith(tripla, i)) return fimDoBloco(fonte, i, tripla, tripla);
  let j = i + 1;
  while (continuaNaStringCurtaPy(fonte, j, fonte[i])) j += fonte[j] === '\\' ? 2 : 1;
  return j + 1;
}

const PYTHON = {
  fimDoComentario: (fonte, i) => (fonte[i] === '#' ? fimDaLinha(fonte, i) : -1),
  depoisDoCodigo: (fonte, i) => (ehAspa(fonte[i]) ? fimDaStringPy(fonte, i) : i + 1),
};

function comentariosPy(fonte) {
  return lerComentarios(fonte, PYTHON);
}

const ABERTURAS_NO_CODIGO_SH = ["'", '"', "$'", '$(', '`'];
const CONTEXTOS_SH = {
  normal: { fecha: null, escapa: true, abre: ABERTURAS_NO_CODIGO_SH, codigo: true, contaParenteses: false },
  comando: { fecha: null, escapa: true, abre: ABERTURAS_NO_CODIGO_SH, codigo: true, contaParenteses: true },
  crase: { fecha: '`', escapa: true, abre: ABERTURAS_NO_CODIGO_SH, codigo: true, contaParenteses: false },
  simples: { fecha: "'", escapa: false, abre: [], codigo: false, contaParenteses: false },
  ansi: { fecha: "'", escapa: true, abre: [], codigo: false, contaParenteses: false },
  dupla: { fecha: '"', escapa: true, abre: ['$(', '`'], codigo: false, contaParenteses: false },
};
const CONTEXTO_DA_ABERTURA_SH = new Map([
  ["'", CONTEXTOS_SH.simples], ['"', CONTEXTOS_SH.dupla], ["$'", CONTEXTOS_SH.ansi], ['$(', CONTEXTOS_SH.comando], ['`', CONTEXTOS_SH.crase],
]);
const HEREDOC = /^<<-?\s*(?:'([^']+)'|"([^"]+)"|\\?([A-Za-z_]\w*))/;

class LeitorDeShell {
  constructor(fonte) {
    this.fonte = fonte;
    this.i = 0;
    this.pilha = [{ contexto: CONTEXTOS_SH.normal, fundo: 0 }];
    this.comentarios = [];
    this.delimitadores = [];
  }

  ler() {
    while (this.i < this.fonte.length) this.i = this.depoisDoCaractere(this.pilha[this.pilha.length - 1]);
    return this.comentarios;
  }

  depoisDoCaractere(topo) {
    const { contexto } = topo;
    const c = this.fonte[this.i];
    if (contexto.escapa && c === '\\') return this.i + 2;
    if (c === contexto.fecha) {
      this.pilha.pop();
      return this.i + 1;
    }
    const abertura = this.aberturaAqui(c);
    if (contexto.abre.includes(abertura)) {
      this.pilha.push({ contexto: CONTEXTO_DA_ABERTURA_SH.get(abertura), fundo: 0 });
      return this.i + abertura.length;
    }
    return contexto.codigo ? this.depoisDoCodigo(topo, c) : this.i + 1;
  }

  aberturaAqui(c) {
    return c === '$' ? this.fonte.slice(this.i, this.i + 2) : c;
  }

  depoisDoCodigo(topo, c) {
    if (topo.contexto.contaParenteses && '()'.includes(c)) return this.depoisDoParentese(topo, c);
    if (c === '#' && this.comecaPalavra()) return this.depoisDoComentario();
    if (c === '<' && this.fonte[this.i + 1] === '<') return this.depoisDoRedirecionamento();
    if (c === '\n') return this.depoisDaQuebraDeLinha();
    return this.i + 1;
  }

  depoisDoParentese(comando, c) {
    if (c === '(') comando.fundo++;
    else if (comando.fundo === 0) this.pilha.pop();
    else comando.fundo--;
    return this.i + 1;
  }

  comecaPalavra() {
    return this.i === 0 || /[\s;&|()]/.test(this.fonte[this.i - 1]);
  }

  depoisDoComentario() {
    const ate = fimDaLinha(this.fonte, this.i);
    this.comentarios.push([this.i, ate]);
    return ate;
  }

  depoisDoRedirecionamento() {
    if (this.fonte[this.i + 2] === '<') return this.i + 3;
    const heredoc = HEREDOC.exec(this.fonte.slice(this.i, this.i + 120));
    if (!heredoc) return this.i + 2;
    if (!this.naAritmetica()) this.delimitadores.push(heredoc[1] || heredoc[2] || heredoc[3]);
    return this.i + heredoc[0].length;
  }

  naAritmetica() {
    const linhaAteAqui = this.fonte.slice(this.fonte.lastIndexOf('\n', this.i) + 1, this.i);
    return linhaAteAqui.lastIndexOf('((') > linhaAteAqui.lastIndexOf('))');
  }

  depoisDaQuebraDeLinha() {
    if (this.delimitadores.length === 0) return this.i + 1;
    return depoisDosHeredocs(this.fonte, this.i + 1, this.delimitadores.splice(0));
  }
}

function comentariosSh(fonte) {
  return new LeitorDeShell(fonte).ler();
}

function depoisDoHeredoc(fonte, inicio, delimitador) {
  let i = inicio;
  while (i < fonte.length) {
    const fim = fimDaLinha(fonte, i);
    const linha = fonte.slice(i, fim);
    i = Math.min(fim + 1, fonte.length);
    if (linha.replace(/^\t+/, '') === delimitador) break;
  }
  return i;
}

function depoisDosHeredocs(fonte, inicio, delimitadores) {
  return delimitadores.reduce((i, delimitador) => depoisDoHeredoc(fonte, i, delimitador), inicio);
}

function depoisDeSeparador(linha, i, separador) {
  return i === 0 || separador.test(linha[i - 1]);
}

function abreAspaYaml(linha, i) {
  return ehAspa(linha[i]) && depoisDeSeparador(linha, i, /[\s:,\[{?-]/);
}

function comecaComentarioYaml(linha, i) {
  return linha[i] === '#' && depoisDeSeparador(linha, i, /\s/);
}

function fimDaAspaYaml(linha, i) {
  const aspa = linha[i];
  let j = i + 1;
  while (j < linha.length && linha[j] !== aspa) j += aspa === '"' && linha[j] === '\\' ? 2 : 1;
  return j;
}

function comentarioDaLinhaYaml(linha) {
  for (let i = 0; i < linha.length; i++) {
    if (abreAspaYaml(linha, i)) i = fimDaAspaYaml(linha, i);
    else if (comecaComentarioYaml(linha, i)) return i;
  }
  return -1;
}

const BLOCO_DE_TEXTO_YAML = /^(\s*(?:-\s+)*)([^\s:#'"][^:#]*|"[^"]*"|'[^']*'):\s*[|>][+-]?\d*\s*$/;

function blocoDeTextoQueAbre(codigo, de) {
  const abre = BLOCO_DE_TEXTO_YAML.exec(codigo);
  return abre && { coluna: abre[1].length, shell: abre[2].trim() === 'run', de };
}

function continuaNoBloco(bloco, linha) {
  if (!bloco) return false;
  return linha.trim() === '' || linha.search(/\S/) > bloco.coluna;
}

function comentariosDoShellDoBloco(fonte, bloco, ate) {
  if (!(bloco && bloco.shell)) return [];
  return mover(comentariosSh(fonte.slice(bloco.de, ate)), bloco.de);
}

function comentariosYaml(fonte) {
  const comentarios = [];
  let bloco = null;
  let deslocamento = 0;
  for (const linhaComCr of fonte.split('\n')) {
    const linha = linhaComCr.replace(/\r$/, '');
    const inicio = deslocamento;
    deslocamento += linhaComCr.length + 1;
    if (continuaNoBloco(bloco, linha)) continue;
    comentarios.push(...comentariosDoShellDoBloco(fonte, bloco, inicio));
    const marca = comentarioDaLinhaYaml(linha);
    if (marca >= 0) comentarios.push([inicio + marca, inicio + linha.length]);
    bloco = blocoDeTextoQueAbre(marca >= 0 ? linha.slice(0, marca) : linha, deslocamento);
  }
  comentarios.push(...comentariosDoShellDoBloco(fonte, bloco, fonte.length));
  return comentarios;
}

const LEITORES_DE_COMENTARIO = [
  [/\.(js|mjs|cjs|jsx|ts|tsx)$/, comentariosJs],
  [/\.css$/, comentariosCss],
  [/\.py$/, comentariosPy],
  [/\.html$/, comentariosHtml],
  [/\.sh$|^scripts\/ganchos\/[^./]+$/, comentariosSh],
  [/\.ya?ml$/, comentariosYaml],
];

function trechosDeComentario(arquivo, fonte) {
  const leitor = LEITORES_DE_COMENTARIO.find(([padrao]) => padrao.test(arquivo));
  return leitor ? leitor[1](fonte) : [];
}

function comentariosPorLinha(arquivo, fonte) {
  const comentarios = trechosDeComentario(arquivo, fonte);
  const porLinha = new Map();
  let linha = 1;
  let ondeEstou = 0;
  for (const [de, ate] of comentarios.sort((a, b) => a[0] - b[0])) {
    linha += linhaDe(fonte.slice(ondeEstou, de), de - ondeEstou) - 1;
    ondeEstou = de;
    fonte.slice(de, ate).split('\n').forEach((pedaco, i) => {
      if (i > 0) { linha++; }
      porLinha.set(linha, `${porLinha.get(linha) || ''} ${pedaco}`.trim());
    });
    linha -= fonte.slice(de, ate).split('\n').length - 1;
  }
  return porLinha;
}

const FECHO_DE = { '(': ')', '{': '}', '[': ']' };

function ehPar(c) {
  return Boolean(FECHO_DE[c]) || c === ')' || c === '}' || c === ']';
}

function proximoPar(texto, i) {
  while (i < texto.length && !ehPar(texto[i])) i = ehAspaJs(texto[i]) ? fimDaString(texto, i) + 1 : i + 1;
  return i;
}

function desfechoDoPar(pilha, c, i) {
  if (FECHO_DE[c]) {
    pilha.push(FECHO_DE[c]);
    return null;
  }
  if (pilha.pop() !== c) return -1;
  return pilha.length === 0 ? i : null;
}

function fechamento(texto, abre) {
  const pilha = [];
  for (let i = proximoPar(texto, abre); i < texto.length; i = proximoPar(texto, i + 1)) {
    const desfecho = desfechoDoPar(pilha, texto[i], i);
    if (desfecho !== null) return desfecho;
  }
  return -1;
}

module.exports = {
  arquivosDoRepositorio, renomeacoes, ehJsDaExtensao, linhaDe, semComentariosJs, semComentariosCss, semComentariosHtml,
  comentariosPorLinha, fechamento, trechosDeComentario,
};

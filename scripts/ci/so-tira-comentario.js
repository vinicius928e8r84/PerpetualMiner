'use strict';

const { execFileSync, spawnSync } = require('child_process');
const path = require('path');
const { trechosDeComentario } = require('../regras/comum.js');
const { ehDocumentacao } = require('./so-documentacao.js');

const LINHA_DE_BASE = 'scripts/regras/linha-de-base.json';
const SECAO_DA_CATRACA = 'sem-comentario';
const COM_ACORN = /\.(js|mjs|cjs)$/;
const COM_TOKENIZE = /\.py$/;
const COM_TEXTO = /\.(css|html|sh|ya?ml)$|^scripts\/ganchos\/[^./]+$/;
const TOKENS_DO_PYTHON = path.join(__dirname, 'tokens_py.py');
const PROTOTIPO = /^docs\/design\/.*\.html$/;
const ehDocumentoSemComentario = arquivo => ehDocumentacao(arquivo) && !PROTOTIPO.test(arquivo);

function git(raiz, ...args) {
  return execFileSync('git', ['-C', raiz, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

const ANALISADOR = path.join(__dirname, '..', 'regras', 'analisador');

function carregarAcorn() {
  const caminho = path.join(ANALISADOR, 'node_modules', 'acorn');
  try {
    return require(caminho);
  } catch {
    execFileSync('npm', ['ci', '--prefix', ANALISADOR], { stdio: 'ignore', shell: process.platform === 'win32' });
    return require(caminho);
  }
}

function opcoesDoAcorn(sourceType, comentarios) {
  return {
    ecmaVersion: 'latest',
    sourceType,
    allowHashBang: true,
    onComment: (bloco, texto) => comentarios.push(`${bloco ? '/*' : '//'}${texto}`),
  };
}

function lerComAcorn(fonte, sourceType) {
  const comentarios = [];
  const codigo = [];
  let fimAnterior = 0;
  for (const token of carregarAcorn().tokenizer(fonte, opcoesDoAcorn(sourceType, comentarios))) {
    const quebra = codigo.length > 0 && fonte.slice(fimAnterior, token.start).includes('\n');
    codigo.push(`${quebra ? 'n' : ' '}${token.type.label}:${JSON.stringify(token.value === undefined ? null : token.value)}`);
    fimAnterior = token.end;
  }
  return { codigo, comentarios };
}

function tokensDoJs(fonte) {
  let falha;
  for (const sourceType of ['module', 'script']) {
    try {
      return lerComAcorn(fonte, sourceType);
    } catch (erro) {
      falha = erro;
    }
  }
  return { erro: falha.message };
}

function interpretadorDoPython() {
  return process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
}

function tokensDoPython(fonte) {
  const r = spawnSync(interpretadorDoPython(), ['-I', '-X', 'utf8', TOKENS_DO_PYTHON], { input: Buffer.from(fonte, 'utf8'), maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) return { erro: `o tokenizador do Python falhou: ${String(r.stderr).trim()}` };
  const lido = JSON.parse(r.stdout.toString('ascii'));
  return lido.erro ? { erro: lido.erro } : { codigo: lido.codigo, comentarios: lido.comentarios };
}

const MARCA = '\u0000';

function juntarOsPedacos(pedacos) {
  let saida = pedacos[0].trim() === '' ? pedacos[0] : pedacos[0].replace(/\s+$/, '');
  pedacos.slice(1).forEach((pedaco, i, resto) => {
    const limpo = i === resto.length - 1 ? pedaco.replace(/^\s+/, '') : pedaco.trim();
    if (limpo !== '') saida += (saida.trim() === '' ? '' : ' ') + limpo;
  });
  return saida;
}

function linhasSemOsComentarios(marcado) {
  return marcado.split('\n').map(linha => linha.replace(/\r$/, '')).map(linha => {
    if (!linha.includes(MARCA)) return linha;
    const juntada = juntarOsPedacos(linha.split(MARCA));
    return juntada.trim() === '' ? null : juntada;
  });
}

const ABRE_UM_BLOCO = /[:{(\[]$/;

function sobraEmBranco(saida) {
  if (saida.length === 0) return true;
  const anterior = saida[saida.length - 1].trim();
  return anterior === '' || ABRE_UM_BLOCO.test(anterior);
}

function semOsComentarios(fonte, trechos) {
  let marcado = '';
  let ondeEstou = 0;
  for (const [de, ate] of [...trechos].sort((a, b) => a[0] - b[0])) {
    marcado += fonte.slice(ondeEstou, de) + MARCA;
    ondeEstou = ate;
  }
  marcado += fonte.slice(ondeEstou);
  const saida = [];
  let tirouUmaLinha = false;
  for (const linha of linhasSemOsComentarios(marcado)) {
    if (linha === null) tirouUmaLinha = true;
    else {
      const repete = tirouUmaLinha && linha.trim() === '' && sobraEmBranco(saida);
      if (!repete) saida.push(linha);
      tirouUmaLinha = false;
    }
  }
  return saida.join('\n');
}

function fichaDeTexto(arquivo, fonte) {
  const trechos = trechosDeComentario(arquivo, fonte);
  return { codigo: [semOsComentarios(fonte, trechos)], comentarios: trechos.map(([de, ate]) => fonte.slice(de, ate)) };
}

function fichaDe(arquivo, fonte) {
  if (COM_ACORN.test(arquivo)) return tokensDoJs(fonte);
  if (COM_TOKENIZE.test(arquivo)) return tokensDoPython(fonte);
  if (COM_TEXTO.test(arquivo)) return fichaDeTexto(arquivo, fonte);
  return { erro: 'tipo de arquivo que a conferência não sabe ler' };
}

const igual = (a, b) => a.length === b.length && a.every((valor, i) => valor === b[i]);

function encurtaAlgumDoAntes(antes, texto) {
  const aparado = texto.trimEnd();
  const onde = antes.findIndex(candidato => candidato.startsWith(aparado));
  if (onde < 0) return false;
  antes.splice(onde, 1);
  return true;
}

function sobramSoDoAntes(antes, depois) {
  const restantes = [...antes];
  return depois.every(texto => encurtaAlgumDoAntes(restantes, texto));
}

const tamanhoDos = comentarios => comentarios.reduce((soma, texto) => soma + texto.length, 0);

function confereOArquivo(arquivo, antes, depois) {
  const a = fichaDe(arquivo, antes);
  const d = fichaDe(arquivo, depois);
  if (a.erro || d.erro) return `${arquivo}: não consegui ler (${a.erro || d.erro})`;
  if (!igual(a.codigo, d.codigo)) return `${arquivo}: o código mudou (a conferência compara token a token, sem os comentários)`;
  if (tamanhoDos(d.comentarios) >= tamanhoDos(a.comentarios)) return `${arquivo}: nenhum comentário a menos (${a.comentarios.length} antes, ${d.comentarios.length} depois)`;
  if (!sobramSoDoAntes(a.comentarios, d.comentarios)) return `${arquivo}: o depois tem um comentário que o antes não tinha`;
  return null;
}

function confereALinhaDeBase(antes, depois) {
  let a;
  let d;
  try {
    a = JSON.parse(antes);
    d = JSON.parse(depois);
  } catch {
    return `${LINHA_DE_BASE}: não é um JSON que eu consiga ler`;
  }
  const { [SECAO_DA_CATRACA]: catracaAntes = {}, ...restoAntes } = a;
  const { [SECAO_DA_CATRACA]: catracaDepois = {}, ...restoDepois } = d;
  if (JSON.stringify(restoAntes) !== JSON.stringify(restoDepois)) return `${LINHA_DE_BASE}: mudou uma seção que não é a ${SECAO_DA_CATRACA}`;
  const subiu = Object.entries(catracaDepois).find(([arquivo, teto]) => !(teto <= catracaAntes[arquivo]));
  return subiu ? `${LINHA_DE_BASE}: o teto de ${subiu[0]} não desceu` : null;
}

function mudancas(raiz, ancestral, head) {
  const saida = git(raiz, 'diff', '--no-renames', '--name-status', '-z', ancestral, head).split('\0').filter(Boolean);
  const lista = [];
  for (let i = 0; i + 1 < saida.length; i += 2) lista.push({ estado: saida[i], arquivo: saida[i + 1] });
  return lista;
}

const noCommit = (raiz, commit, arquivo) => git(raiz, 'show', `${commit}:${arquivo}`);

function conferirUmaMudanca(raiz, ancestral, head, { estado, arquivo }) {
  if (arquivo === LINHA_DE_BASE) return estado === 'M' ? confereALinhaDeBase(noCommit(raiz, ancestral, arquivo), noCommit(raiz, head, arquivo)) : `${arquivo}: ${estado}`;
  if (ehDocumentoSemComentario(arquivo)) return estado === 'D' ? `${arquivo}: documento apagado` : null;
  if (estado !== 'M') return `${arquivo}: ${estado === 'A' ? 'arquivo novo' : 'arquivo apagado'} que não é documentação`;
  return confereOArquivo(arquivo, noCommit(raiz, ancestral, arquivo), noCommit(raiz, head, arquivo));
}

function soTiraComentario({ raiz = '.', base, head = 'HEAD' }) {
  const ancestral = git(raiz, 'merge-base', base, head).trim();
  const lista = mudancas(raiz, ancestral, head);
  if (!lista.length) return { ok: false, motivo: 'a PR não muda arquivo nenhum' };
  const falhas = lista.map(mudanca => conferirUmaMudanca(raiz, ancestral, head, mudanca)).filter(Boolean);
  if (falhas.length) return { ok: false, motivo: falhas[0], falhas };
  const comCodigo = lista.filter(({ arquivo }) => arquivo !== LINHA_DE_BASE && !ehDocumentoSemComentario(arquivo));
  if (!comCodigo.length) return { ok: false, motivo: 'a PR não tira comentário de arquivo nenhum' };
  return { ok: true, arquivos: comCodigo.map(({ arquivo }) => arquivo) };
}

function main(argv) {
  const pega = nome => (argv.includes(nome) ? argv[argv.indexOf(nome) + 1] : undefined);
  const resultado = soTiraComentario({ raiz: pega('--raiz') || '.', base: pega('--base') || 'origin/main', head: pega('--head') || 'HEAD' });
  if (resultado.ok) console.log(`só tira comentário: o código de ${resultado.arquivos.length} arquivo(s) é idêntico token a token, sem comentário novo`);
  else console.log(`não é uma PR que só tira comentário:\n  ${(resultado.falhas || [resultado.motivo]).slice(0, 10).join('\n  ')}`);
  return resultado.ok ? 0 : 1;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { soTiraComentario, fichaDe, confereOArquivo, confereALinhaDeBase, semOsComentarios };

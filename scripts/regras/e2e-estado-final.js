'use strict';

const fs = require('fs');
const path = require('path');
const { comentariosPorLinha, fechamento, linhaDe, semComentariosJs } = require('./comum');

const id = 'e2e-estado-final';

const conserto = 'Depois de agir, confira o que ficou guardado, com um valor concreto: '
  + '`await estadoFinal(extensao, { pm_anki_baralhos: { nomes: … } })` (e2e/estado-final.js), '
  + '`expect(await extensao.frases()).toHaveLength(…)` ou o que o fake guardou, por um leitor marcado `@estado-guardado` em e2e/fakes/ '
  + '(`expect(fakes.anki.enviosEm(\'en\')).toHaveLength(1)`; um leitor novo do fake leva a marca no comentário dele). '
  + 'Uma foto, um texto na tela, os pedidos que chegaram ao fake (`requisicoes`) ou uma leitura que nenhum `expect` usa não bastam, '
  + 'e a conferência vem depois da última ação. '
  + 'Um teste que não guarda nada (um filtro, uma aba, um modal) diz isso no comentário logo acima: '
  + '`// Exceção de teste: sem-estado-guardado — <motivo>` (docs/CODING_STANDARDS.md regra 8).';

const seAplica = arquivo => /^e2e\/tests\/.+\.spec\.js$/.test(arquivo) && !/-visual\.spec\.js$/.test(arquivo);

const MARCA = /Exceção de teste:\s*sem-estado-guardado\b/;
const ACAO = /\.(?:click|dblclick|fill|press|pressSequentially|check|uncheck|selectOption|setInputFiles|type|tap|dragTo)\s*\(/g;
const LEITURA_FIXA = /\b(?:lerStorage|estadoFinal\w*)\s*\(|\.frases\s*\(|\bchrome\.storage\.local\.get\b/g;

const MARCA_DE_LEITOR = /@estado-guardado[\s\S]*?\*\/\s*(?:async\s+)?([A-Za-z_$][\w$]*)/g;

const nomesDosLeitoresEm = fonte => [...fonte.matchAll(MARCA_DE_LEITOR)].map(m => m[1]);

function lerLeitoresDosFakes(raiz) {
  const pasta = path.join(raiz, 'e2e', 'fakes');
  if (!fs.existsSync(pasta)) return new Set();
  const arquivos = fs.readdirSync(pasta).filter(n => n.endsWith('.js'));
  return new Set(arquivos.flatMap(nome => nomesDosLeitoresEm(fs.readFileSync(path.join(pasta, nome), 'utf8'))));
}

const leitoresPorRaiz = new Map();
function leitoresDosFakes(raiz) {
  if (!leitoresPorRaiz.has(raiz)) leitoresPorRaiz.set(raiz, lerLeitoresDosFakes(raiz));
  return leitoresPorRaiz.get(raiz);
}

const ABRE = '([{';
const FECHA = ')]}';
const FIM_DE_INSTRUCAO = '\n;';

const mudancaDeFundura = c => (ABRE.includes(c) ? 1 : 0) - (FECHA.includes(c) ? 1 : 0);

function fimDoBloco(codigo, abre) {
  const fim = fechamento(codigo, abre);
  return fim < 0 ? codigo.length : fim + 1;
}

function fimDaExpressao(codigo, primeiro) {
  let fundura = 0;
  for (let i = primeiro; i < codigo.length; i++) {
    fundura += mudancaDeFundura(codigo[i]);
    if (fundura <= 0 && FIM_DE_INSTRUCAO.includes(codigo[i])) return i;
  }
  return codigo.length;
}

function fimDoCorpo(codigo, de) {
  const comeco = codigo.slice(de).search(/\S/);
  if (comeco < 0) return codigo.length;
  const primeiro = de + comeco;
  return codigo[primeiro] === '{' ? fimDoBloco(codigo, primeiro) : fimDaExpressao(codigo, primeiro);
}

const FUNCAO_DECLARADA = /(?:^|\n)\s*(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/g;
const SETA_NOMEADA = /(?:^|\n)\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g;

function funcaoDeclarada(codigo, m) {
  const parametros = fechamento(codigo, m.index + m[0].length - 1);
  if (parametros < 0) return null;
  const chave = codigo.indexOf('{', parametros);
  return chave < 0 ? null : { nome: m[1], corpo: codigo.slice(chave, fimDoCorpo(codigo, chave)) };
}

function setaNomeada(codigo, m) {
  const corpo = m.index + m[0].length;
  return { nome: m[1], corpo: codigo.slice(corpo, fimDoCorpo(codigo, corpo)) };
}

function funcoes(codigo) {
  const declaradas = [...codigo.matchAll(FUNCAO_DECLARADA)].map(m => funcaoDeclarada(codigo, m)).filter(Boolean);
  const setas = [...codigo.matchAll(SETA_NOMEADA)].map(m => setaNomeada(codigo, m));
  return [...declaradas, ...setas];
}

const chamaAlgum = (corpo, nomes) => [...nomes].some(nome => new RegExp(`\\b${nome}\\s*\\(`).test(corpo));

function acrescentarOsQueFazem(defs, nomes, faz) {
  let mudou = false;
  for (const def of defs) {
    if (nomes.has(def.nome) || !faz(def.corpo, nomes)) continue;
    nomes.add(def.nome);
    mudou = true;
  }
  return mudou;
}

function quemFaz(defs, padrao) {
  const nomes = new Set();
  const achaNoCorpo = corpo => new RegExp(padrao.source, padrao.flags.replace('g', '')).test(corpo);
  const faz = (corpo, jaSabidos) => achaNoCorpo(corpo) || chamaAlgum(corpo, jaSabidos);
  let mudou = true;
  while (mudou) mudou = acrescentarOsQueFazem(defs, nomes, faz);
  return nomes;
}

const posicoes = (texto, padrao, nomes = new Set()) => {
  const achados = [...texto.matchAll(new RegExp(padrao.source, 'g'))].map(m => m.index);
  for (const nome of nomes) for (const m of texto.matchAll(new RegExp(`\\b${nome}\\s*\\(`, 'g'))) achados.push(m.index);
  return achados.sort((a, b) => a - b);
};

const identificadores = texto => texto.match(/[A-Za-z_$][\w$]*/g) || [];

const MATCHER = /^\s*\.\s*(?:(?:not|resolves)\s*\.\s*)*to[A-Z]\w*\s*\(/;

function conferenciasDe(corpo) {
  const lista = [];
  for (const m of corpo.matchAll(/\bexpect(\.poll)?\s*\(/g)) {
    const abre = m.index + m[0].length - 1;
    const fim = fechamento(corpo, abre);
    if (fim >= 0 && MATCHER.test(corpo.slice(fim + 1))) lista.push({ de: m.index, fim, poll: Boolean(m[1]) });
  }
  return lista;
}

const ABRE_BLOCO_DE_CONTROLE = /(?:\)|=>|\belse|\btry|\bdo)\s*$/;

const abreBlocoDeControle = (corpo, i) => corpo[i] === '{' && ABRE_BLOCO_DE_CONTROLE.test(corpo.slice(Math.max(0, i - 8), i));

function comecaDepoisDe(corpo, i, fundura) {
  if (corpo[i] === ';') return fundura === 0;
  return abreBlocoDeControle(corpo, i);
}

function inicioDaInstrucao(corpo, p) {
  let fundura = 0;
  for (let i = p - 1; i >= 0; i--) {
    if (FECHA.includes(corpo[i])) fundura++;
    else if (ABRE.includes(corpo[i]) && fundura > 0) fundura--;
    else if (comecaDepoisDe(corpo, i, fundura)) return i + 1;
  }
  return 0;
}

const ATRIBUICAO = /^\s*(?:(const|let|var)\s+)?(\{[^}]*\}|\[[^\]]*\]|[A-Za-z_$][\w$]*)\s*=(?!=)([^]*)$/;
const NOME_SIMPLES = /^[A-Za-z_$][\w$]*$/;

function instrucoesDepoisDe(corpo, p, ate) {
  const partes = [];
  let comeco = p;
  for (const parte of corpo.slice(p).split(';')) {
    if (comeco >= ate) break;
    partes.push(parte);
    comeco += parte.length + 1;
  }
  return partes;
}

function atribuicaoAcompanhada(parte) {
  const a = ATRIBUICAO.exec(parte);
  if (!a) return null;
  return a[1] !== undefined || NOME_SIMPLES.test(a[2]) ? a : null;
}

function acompanharAtribuicao(nomes, [, declaracao, alvo, valor]) {
  if (identificadores(valor).some(nome => nomes.has(nome))) identificadores(alvo).forEach(nome => nomes.add(nome));
  else if (!declaracao) nomes.delete(alvo);
}

function nomesVivos(corpo, p, ate) {
  const m = ATRIBUICAO.exec(corpo.slice(inicioDaInstrucao(corpo, p), p));
  if (!m) return new Set();
  const nomes = new Set(identificadores(m[2]));
  for (const parte of instrucoesDepoisDe(corpo, p, ate)) {
    const atribuicao = atribuicaoAcompanhada(parte);
    if (atribuicao) acompanharAtribuicao(nomes, atribuicao);
  }
  return nomes;
}

function retornoDevolveALeitura(corpo, p, poll, retorno) {
  const posicaoDoReturn = poll.de + retorno.index;
  if (posicaoDoReturn > p) return identificadores(retorno[1]).some(nome => nomesVivos(corpo, p, posicaoDoReturn).has(nome));
  return posicaoDoReturn < p && p < posicaoDoReturn + retorno[0].length;
}

function leituraDevolvida(corpo, p, poll) {
  const funcao = corpo.slice(poll.de, poll.fim);
  const seta = funcao.search(/=>/);
  if (seta < 0 || p - poll.de < seta) return false;
  if (!/^\s*\{/.test(funcao.slice(seta + 2))) return true;
  return [...funcao.matchAll(/\breturn\b([^;}]*)/g)].some(retorno => retornoDevolveALeitura(corpo, p, poll, retorno));
}

function comparaOQueFoiLido(corpo, p, conferencia) {
  if (conferencia.de <= p || conferencia.poll) return false;
  const vivos = nomesVivos(corpo, p, conferencia.de);
  return identificadores(corpo.slice(conferencia.de, conferencia.fim)).some(nome => vivos.has(nome));
}

function leituraConferida(corpo, p, conferencias) {
  if (/^estadoFinal\w*\s*\(/.test(corpo.slice(p))) return true;
  const quePegamALeitura = conferencias.filter(c => c.de < p && p < c.fim);
  return quePegamALeitura.some(c => !c.poll || leituraDevolvida(corpo, p, c)) || conferencias.some(c => comparaOQueFoiLido(corpo, p, c));
}

const JANELA_ACIMA_DO_TESTE = 12;

const temMarca = (comentarios, linha) => MARCA.test(comentarios.get(linha) || '');
const terminaInstrucao = (linhas, linha) => /[;{}]$/.test((linhas[linha - 1] || '').trim());

function marcaNoTeste(comentarios, primeira, ultima) {
  for (let linha = primeira; linha <= ultima; linha++) if (temMarca(comentarios, linha)) return true;
  return false;
}

function marcaAcimaDoTeste(comentarios, linhas, primeira) {
  const maisAlta = Math.max(1, primeira - JANELA_ACIMA_DO_TESTE);
  for (let linha = primeira - 1; linha >= maisAlta; linha--) {
    if (temMarca(comentarios, linha)) return true;
    if (terminaInstrucao(linhas, linha)) return false;
  }
  return false;
}

const anotado = (comentarios, linhas, primeira, ultima) => marcaNoTeste(comentarios, primeira, ultima) || marcaAcimaDoTeste(comentarios, linhas, primeira);

function contextoDoArquivo(arquivo, fonte, raiz) {
  const codigo = semComentariosJs(fonte);
  const doFake = [...leitoresDosFakes(raiz)];
  const LEITURA = new RegExp(doFake.length ? `${LEITURA_FIXA.source}|\\.(?:${doFake.join('|')})\\b` : LEITURA_FIXA.source, 'g');
  const defs = funcoes(codigo);
  return {
    codigo,
    linhas: codigo.split('\n'),
    comentarios: comentariosPorLinha(arquivo, fonte),
    LEITURA,
    quemAge: quemFaz(defs, ACAO),
    quemLe: quemFaz(defs, LEITURA),
  };
}

const fimDaLeitura = (corpo, p) => (/^estadoFinalInalterado\s*\(/.test(corpo.slice(p)) ? fechamento(corpo, corpo.indexOf('(', p)) : p);

function leituraConfereDepoisDaUltimaAcao(contexto, corpo, ultimaAcao) {
  const conferencias = conferenciasDe(corpo);
  return posicoes(corpo, contexto.LEITURA, contexto.quemLe)
    .filter(p => fimDaLeitura(corpo, p) > ultimaAcao)
    .some(p => leituraConferida(corpo, p, conferencias));
}

function detalheDoTeste(codigo, abre, acoes) {
  const titulo = /^\s*(['"`])((?:(?!\1).)*)\1/.exec(codigo.slice(abre + 1, abre + 200).replace(/^\s+/, ''));
  return `o teste age (${acoes} ação(ões)) e depois da última não lê e compara o que ficou guardado${titulo ? `: “${titulo[2].slice(0, 70)}”` : ''}`;
}

function achadoDoTeste(contexto, inicio) {
  const { codigo } = contexto;
  const abre = codigo.indexOf('(', inicio.index);
  const fecha = fechamento(codigo, abre);
  if (fecha < 0) return null;
  const corpo = codigo.slice(abre + 1, fecha);
  const acoes = posicoes(corpo, ACAO, contexto.quemAge);
  if (acoes.length === 0 || leituraConfereDepoisDaUltimaAcao(contexto, corpo, acoes[acoes.length - 1])) return null;
  const primeira = linhaDe(codigo, inicio.index);
  if (anotado(contexto.comentarios, contexto.linhas, primeira, linhaDe(codigo, fecha))) return null;
  return { linha: primeira, detalhe: detalheDoTeste(codigo, abre, acoes.length) };
}

function verificar(arquivo, fonte, raiz = process.cwd()) {
  const contexto = contextoDoArquivo(arquivo, fonte, raiz);
  return [...contexto.codigo.matchAll(/\btest(?:\.only)?\s*\(\s*(['"`])/g)].map(inicio => achadoDoTeste(contexto, inicio)).filter(Boolean);
}

module.exports = { id, conserto, seAplica, verificar };

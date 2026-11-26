'use strict';

const assert = require('assert');

const runtime = { lastError: undefined, enviadas: [], responder: () => undefined };
globalThis.chrome = {
  runtime: {
    get lastError() { return runtime.lastError; },
    sendMessage(mensagem, aoResponder) {
      runtime.enviadas.push(mensagem);
      const resposta = runtime.responder(mensagem);
      queueMicrotask(() => aoResponder(resposta));
    },
  },
};
globalThis.PerpetualMiner = { detectarIdioma: texto => `idioma de ${texto}` };
require('../lib/mineracao.js');
const { Mineracao, minerarFraseManual } = globalThis.PerpetualMiner;

const CONTEXTOS = [
  [{}, { fonte: 'web', titulo: '', detalhe: '' }],
  [{ url: 'https://x.com/a.pdf', titulo: 'a.pdf' }, { fonte: 'pdf', titulo: 'a.', detalhe: '' }],
  [{ url: 'https://x.com/a.PDF?x=1', titulo: ' Relatório - Google Chrome ' }, { fonte: 'pdf', titulo: 'Relatório - Google Chrome', detalhe: '' }],
  [{ url: 'https://x.com/a.pdf#p=2', titulo: 'Relatório | PDF' }, { fonte: 'pdf', titulo: 'Relatório', detalhe: '' }],
  [{ url: 'https://x.com/a.pdfx', titulo: 'x' }, { fonte: 'web', titulo: 'x', detalhe: '' }],
  [{ url: 'chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html?file.pdf', titulo: 'doc – PDF' }, { fonte: 'pdf', titulo: 'doc', detalhe: '' }],
  [{ url: 'chrome-extension://abc123/x.pdf', titulo: 'y' }, { fonte: 'pdf', titulo: 'y', detalhe: '' }],
  [{ url: 'chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html?pdfjs', titulo: 'Livro' }, { fonte: 'pdf', titulo: 'Livro', detalhe: '' }],
  [{ url: 'chrome-extension://abc1/index.html?pdfjs', titulo: 'Livro' }, { fonte: 'web', titulo: 'Livro', detalhe: '' }],
  [{ url: 'https://x.com/pdf-guide', titulo: 'Guia' }, { fonte: 'web', titulo: 'Guia', detalhe: '' }],
  [{ url: 'https://site.com/artigo', titulo: 'Artigo bom' }, { fonte: 'web', titulo: 'Artigo bom', detalhe: '' }],
  [{ url: 'https://site.com/artigo', titulo: '' }, { fonte: 'web', titulo: 'https://site.com/artigo', detalhe: '' }],
  [{ url: 'https://site.com/artigo', titulo: 'PDF' }, { fonte: 'web', titulo: 'https://site.com/artigo', detalhe: '' }],
  [{ url: 'https://site.com/a', titulo: ' Livro - PDF ', preservarTitulo: true }, { fonte: 'web', titulo: 'Livro - PDF', detalhe: '' }],
  [{ url: 'https://site.com/a', titulo: '', preservarTitulo: true }, { fonte: 'web', titulo: '', detalhe: '' }],
  [{ url: 'https://site.com/a', titulo: 'Google Chrome' }, { fonte: 'web', titulo: 'https://site.com/a', detalhe: '' }],
  [{ url: 'https://site.com/a', titulo: 'Meu PDF' }, { fonte: 'web', titulo: 'Meu', detalhe: '' }],
  [{ url: 'https://site.com/a', titulo: 'Meu PDFs' }, { fonte: 'web', titulo: 'Meu PDFs', detalhe: '' }],
];
function oContextoDaSelecaoDizAFonteEOTitulo() {
  for (const [selecao, contexto] of CONTEXTOS) {
    assert.deepStrictEqual(Mineracao.contextoDaSelecao(selecao), contexto, `o contexto de ${JSON.stringify(selecao)}`);
  }
}

const PALAVRAS_NO_TEXTO = [
  ['', 'abc', null],
  ['  |  ', 'abc', null],
  ['cat', '', null],
  ['cat', null, null],
  ['cat', 'The cat sat.', ['cat@2']],
  ['Cat', 'the CAT', ['cat@2']],
  ['give up', 'I will give it up now', ['give@4', 'up@8']],
  ['up give', 'I will give it up', null],
  ['give up | sat', 'They give up and sat', ['give@2', 'up@4', '|', 'sat@8']],
  ['give | dog', 'They give up', null],
  ['the the', 'the cat the dog', ['the@0', 'the@4']],
  ["don't", "I don't know", ["don't@2"]],
  ['well-known', 'a well-known fact', ['well-known@2']],
  ['.', 'a.b', null],
  ['кошка', 'Это Кошка.', ['кошка@2']],
  ['  give\t  up  ', 'give up', ['give@0', 'up@2']],
  ['a | | b', 'a b', ['a@0', '|', 'b@2']],
  ['cat | cat', 'cat', ['cat@0', '|', 'cat@0']],
  ['cats', 'cat', null],
  ['ca', 'cat', null],
  ['2024', 'In 2024 it', ['2024@2']],
  ['ünïcode', 'Ünïcode', ['ünïcode@0']],
];
function asPalavrasSaoAchadasEmOrdemNoTexto() {
  for (const [prefixo, texto, palavras] of PALAVRAS_NO_TEXTO) {
    assert.deepStrictEqual(Mineracao.palavrasNoTexto(prefixo, texto), palavras, `as palavras ${JSON.stringify(prefixo)} em ${JSON.stringify(texto)}`);
  }
}

const PALAVRAS_QUE_FICAM = [
  [['give@2', 'up@6', '|', 'sat@9'], 'They give up', ['give@2', 'up@4']],
  [null, 'x', []],
  [[12, '|', 'cat@1'], 'a cat 12', ['12@4', '|', 'cat@2']],
  [['cat@0'], 'dog', []],
  [['give@0', '|', 'up@0'], 'up then give', ['give@4', '|', 'up@0']],
  [['|', '|'], 'x', []],
  [['cat@12'], 'the black cat', ['cat@4']],
];
function ficamOsGruposQueAindaEstaoNoTexto() {
  for (const [palavras, texto, ficam] of PALAVRAS_QUE_FICAM) {
    assert.deepStrictEqual(Mineracao.palavrasQueFicam(palavras, texto), ficam, `ficam de ${JSON.stringify(palavras)} em ${JSON.stringify(texto)}`);
  }
}

const comoFoiEnviada = mensagem => Object.fromEntries(Object.entries(mensagem));

const GRAVACOES = [
  ['a seleção com o contexto da página',
    { texto: 'the cat', contexto: { fonte: 'web', titulo: 'T', detalhe: '' }, palavras: ['cat@2'], semNuvem: true },
    { type: 'MINERAR', texto: 'the cat', origem: 'web', idioma: 'idioma de the cat', contexto: { fonte: 'web', titulo: 'T', detalhe: '' }, palavras: ['cat@2'], semNuvem: true }],
  ['a origem e o idioma dados ganham',
    { texto: 'x', contexto: { fonte: 'pdf' }, origem: 'youtube', idioma: 'ru' },
    { type: 'MINERAR', texto: 'x', origem: 'youtube', idioma: 'ru', contexto: { fonte: 'pdf' }, palavras: undefined, semNuvem: undefined }],
  ['a origem e o idioma nulos caem no contexto e no detector',
    { texto: 'y', contexto: { fonte: 'manual' }, origem: null, idioma: null },
    { type: 'MINERAR', texto: 'y', origem: 'manual', idioma: 'idioma de y', contexto: { fonte: 'manual' }, palavras: undefined, semNuvem: undefined }],
  ['a origem e o idioma vazios ficam vazios',
    { texto: 'z', contexto: { fonte: 'web' }, origem: '', idioma: '' },
    { type: 'MINERAR', texto: 'z', origem: '', idioma: '', contexto: { fonte: 'web' }, palavras: undefined, semNuvem: undefined }],
  ['sem contexto',
    { texto: 'w' },
    { type: 'MINERAR', texto: 'w', origem: undefined, idioma: 'idioma de w', contexto: undefined, palavras: undefined, semNuvem: undefined }],
];

const FRASE = { id: 7, texto: 'the cat' };
const DESFECHOS = [
  ['gravou', { lastError: undefined, resposta: { ok: true, frase: FRASE } }, { ok: true, frase: FRASE }],
  ['gravou sem a Frase', { lastError: undefined, resposta: { ok: true } }, { ok: true, frase: undefined }],
  ['o erro do runtime ganha da resposta', { lastError: { message: 'Could not establish connection.' }, resposta: { ok: true, frase: FRASE } },
    { ok: false, error: 'Could not establish connection.' }],
  ['sem resposta', { lastError: undefined, resposta: undefined }, { ok: false, error: 'save_failed' }],
  ['recusada com o motivo', { lastError: undefined, resposta: { ok: false, error: 'duplicada' } }, { ok: false, error: 'duplicada' }],
  ['recusada sem o motivo', { lastError: undefined, resposta: { ok: false, error: '' } }, { ok: false, error: 'save_failed' }],
  ['ok que não é true', { lastError: undefined, resposta: { ok: 'true', frase: FRASE } }, { ok: false, error: 'save_failed' }],
];

async function gravarComo({ lastError, resposta }, captura) {
  runtime.enviadas = [];
  runtime.responder = () => {
    runtime.lastError = lastError;
    return resposta;
  };
  const gravou = await Mineracao.minerar(captura);
  runtime.lastError = undefined;
  return gravou;
}

async function aMensagemLevaACapturaComAOrigemEOIdioma() {
  for (const [nome, captura, mensagem] of GRAVACOES) {
    const gravou = await gravarComo(DESFECHOS[0][1], captura);
    assert.deepStrictEqual(gravou, { ok: true, frase: FRASE }, `gravou: ${nome}`);
    assert.deepStrictEqual(runtime.enviadas.map(comoFoiEnviada), [mensagem], `a mensagem ao service worker: ${nome}`);
  }
}

async function aRespostaDoServiceWorkerViraODesfecho() {
  for (const [nome, desfecho, esperado] of DESFECHOS) {
    assert.deepStrictEqual(await gravarComo(desfecho, { texto: 'a', contexto: { fonte: 'web' } }), esperado, `o desfecho: ${nome}`);
  }
}

const LANCAMENTOS = [
  ['a extensão recarregada', new Error('Extension context invalidated.'), 'Extension context invalidated.'],
  ['um erro sem mensagem', new Error(''), 'save_failed'],
  ['um texto lançado', 'quebrou', 'save_failed'],
  ['um null lançado', null, 'save_failed'],
];

async function oEnvioQueLancaNaoGrava() {
  const enviar = globalThis.chrome.runtime.sendMessage;
  for (const [nome, lancado, error] of LANCAMENTOS) {
    globalThis.chrome.runtime.sendMessage = () => { throw lancado; };
    assert.deepStrictEqual(await Mineracao.minerar({ texto: 'a' }), { ok: false, error }, `o envio lança: ${nome}`);
  }
  globalThis.chrome.runtime.sendMessage = enviar;
}

async function oDetectorQueLancaNaoGrava() {
  const detectar = globalThis.PerpetualMiner.detectarIdioma;
  globalThis.PerpetualMiner.detectarIdioma = () => { throw new Error('sem detector'); };
  runtime.enviadas = [];
  assert.deepStrictEqual(await Mineracao.minerar({ texto: 'a' }), { ok: false, error: 'sem detector' }, 'o detector que lança não grava');
  assert.deepStrictEqual(runtime.enviadas, [], 'e nada é enviado');
  globalThis.PerpetualMiner.detectarIdioma = detectar;
}

function gravarSemACapturaLancaNaHora() {
  assert.throws(() => Mineracao.minerar(), TypeError, 'gravar sem a captura lança na hora');
  assert.throws(() => Mineracao.minerar(null), TypeError, 'gravar com null lança na hora');
}

async function aFraseDigitadaEGravadaComoManual() {
  runtime.responder = () => ({ ok: true, frase: FRASE });
  assert.deepStrictEqual(await minerarFraseManual('minha frase'), FRASE, 'a Frase digitada volta gravada');
  assert.deepStrictEqual(runtime.enviadas.at(-1).contexto, { fonte: 'manual', titulo: '', detalhe: '' });
  assert.strictEqual(runtime.enviadas.at(-1).origem, 'manual');
  runtime.responder = () => ({ ok: false, error: 'duplicada' });
  await assert.rejects(minerarFraseManual('de novo'), { message: 'duplicada' }, 'a Frase recusada vira erro com o motivo');
}

async function main() {
  oContextoDaSelecaoDizAFonteEOTitulo();
  asPalavrasSaoAchadasEmOrdemNoTexto();
  ficamOsGruposQueAindaEstaoNoTexto();
  await aMensagemLevaACapturaComAOrigemEOIdioma();
  await aRespostaDoServiceWorkerViraODesfecho();
  await oEnvioQueLancaNaoGrava();
  await oDetectorQueLancaNaoGrava();
  gravarSemACapturaLancaNaHora();
  await aFraseDigitadaEGravadaComoManual();
  console.log('mineracao tests passed');
}

main().catch(erro => {
  console.error(erro);
  process.exit(1);
});

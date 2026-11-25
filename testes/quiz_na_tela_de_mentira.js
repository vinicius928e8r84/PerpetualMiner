'use strict';

const assert = require('assert');

const { prepararAPagina, esperar } = require('./painel_de_mentira.js');

const { documento, raiz } = prepararAPagina();
require('../lib/idioma.js');
require('../lib/ajustes-de-envio.js');
require('../lib/quiz-de-nivel.js');
require('../lib/pedido-ao-anki.js');
const { textoDaVoz, QuizDeNivel: Quiz } = raiz;
const { MOTIVO } = raiz.ConversaComOAnki;

const timers = [];
globalThis.setTimeout = (funcao, atraso) => { timers.push({ funcao, atraso, vivo: true }); return timers.length; };
globalThis.clearTimeout = id => { if (timers[id - 1]) timers[id - 1].vivo = false; };
const vivos = () => timers.filter(t => t.vivo);
const passarOTempo = () => { const [primeiro] = vivos(); primeiro.vivo = false; primeiro.funcao(); };

const chamadas = [];
const pedidos = [];
const mundo = { sotaque: 'com', tocar: () => Promise.resolve() };
globalThis.Audio = class {
  constructor(url) { chamadas.push(['Audio', url]); }
  play() { chamadas.push(['play']); return mundo.tocar(); }
  pause() { chamadas.push(['pause']); }
};
raiz.AjustesDeEnvio = { ...raiz.AjustesDeEnvio, atual: () => ({ en: { ttsPhraseTld: mundo.sotaque }, ru: { ttsPhraseTld: 'ru' } }) };
const naoTemOFormato = (desfecho, formato) => desfecho.ok && formato && !formato(desfecho.dados);
raiz.ConversaComOAnki = {
  MOTIVO,
  pedir: async (pedido, { formato }) => {
    pedidos.push(pedido.corpo);
    const { desfecho } = mundo;
    return naoTemOFormato(desfecho, formato) ? { ok: false, motivo: MOTIVO.INVALIDA } : desfecho;
  },
};
raiz.SomDoQuiz = { criar: () => ({ alternar: () => false, acerto: nota => chamadas.push(['som.acerto', nota]), naoSei: () => chamadas.push(['som.naoSei']) }) };
raiz.FestaNaTela = {
  saltar: no => chamadas.push(['saltar', no.className]),
  acertou: ({ certa, sequencia }) => { chamadas.push(['festa.acertou', certa.textContent, sequencia]); return { nota: sequencia + 10, pontos: 100 + sequencia }; },
  revelacao: ({ nivel }) => { chamadas.push(['revelacao', nivel]); return { portas: documento.createElement('div'), revelado: documento.createElement('div') }; },
};
raiz.RankingNaTela = {
  montar: ({ lang, resultado }) => {
    chamadas.push(['ranking.montar', lang, resultado.nivel, resultado.acertos, resultado.perguntas, resultado.melhorSequencia]);
    return { no: documento.createElement('div'), iniciar: () => chamadas.push(['ranking.iniciar']), parar: () => chamadas.push(['ranking.parar']) };
  },
};
raiz.EstiloDoCartao = { campo: (lang, rascunho) => { chamadas.push(['estilo.campo', lang, rascunho.nivel]); return documento.createElement('div'); } };
require('../painel/painel-boas-vindas-quiz.js');

const saidas = [];
const usados = [];

function forma(no) {
  if (no.nodeType === 3) return no.data;
  const dataset = Object.keys(no.dataset || {}).length ? { dataset: no.dataset } : {};
  const atributos = Object.fromEntries([...no.atributos.entries()].sort());
  const marcas = Object.fromEntries(['hidden', 'disabled', 'type'].filter(marca => no[marca]).map(marca => [marca, no[marca]]));
  return { tag: no.localName, classe: no.className, id: no.id || undefined, ...marcas, ...dataset, atributos, filhos: no.childNodes.map(forma) };
}

function abrir(lang) {
  chamadas.length = 0;
  timers.length = 0;
  const quiz = raiz.QuizNaTela.montar({ lang, aoUsar: async nivel => { usados.push(nivel); return true; }, aoSair: () => saidas.push(lang) });
  documento.body.append(quiz.no);
  quiz.iniciar();
  return quiz;
}

const palco = quiz => quiz.no.querySelector('.quiz__palco');
const cabecalho = quiz => ['.quiz__progresso', '.quiz__sequencia', '.quiz__placar'].map(seletor => quiz.no.querySelector(seletor).textContent);
const botoes = quiz => palco(quiz).querySelectorAll('button');
const opcao = (quiz, indice) => palco(quiz).querySelectorAll('.quiz__opcao')[indice];
const botaoDe = (quiz, texto) => quiz.no.querySelectorAll('button').find(b => b.textContent === texto);
const feedback = quiz => palco(quiz).querySelector('.quiz__feedback').textContent;
const aviso = quiz => palco(quiz).querySelector('.quiz__aviso');

function irAtePrimeiraPergunta(quiz, pontos = 0) {
  const partes = Quiz.PARTE_1;
  for (let indice = 0; indice < partes.length; indice++) {
    const [voz] = partes[indice].opcoes[pontos ? partes[indice].opcoes.length - 1 : 0];
    botaoDe(quiz, textoDaVoz(voz, { idioma: 'inglês' })).disparar('click');
  }
}

const hashDaTela = quiz => require('crypto').createHash('sha256').update(JSON.stringify(forma(palco(quiz)))).digest('hex').slice(0, 16);
const estados = quiz => botoes(quiz).map(b => [b.textContent.slice(0, 12), b.dataset.estado || '', b.disabled ? 'desligado' : '', b.getAttribute('aria-current') || '']);

module.exports = { hashDaTela, estados, documento, raiz, textoDaVoz, Quiz, timers, vivos, passarOTempo, chamadas, pedidos, mundo, saidas, usados, forma, abrir, palco, cabecalho, botoes, opcao, botaoDe, feedback, aviso, irAtePrimeiraPergunta, esperar };

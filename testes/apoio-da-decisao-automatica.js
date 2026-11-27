'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.resolve(__dirname, '..');
const contexto = { console };
contexto.globalThis = contexto;
vm.createContext(contexto);
for (const arquivo of ['lib/voz/catalogo.js', 'lib/voz/catalogo-configuracoes.js', 'lib/voz/catalogo-anki.js', 'lib/voz/catalogo-boas-vindas.js', 'lib/voz/catalogo-envio.js', 'lib/voz/texto.js', 'lib/idioma.js', 'lib/mineracao.js', 'lib/mineracao-do-dia.js',
  'lib/palavras-frequentes-en.js', 'lib/palavras-frequentes-ru.js', 'lib/palavras-frequentes.js', 'lib/palavras-gramaticais.js', 'lib/palavra-em-duvida.js', 'lib/palavra-automatica.js', 'lib/mineracao-automatica-decisao.js']) {
  vm.runInContext(fs.readFileSync(path.join(RAIZ, arquivo), 'utf8'), contexto, { filename: arquivo });
}
const { MineracaoAutomatica, MineracaoDoDia } = contexto.PerpetualMiner;

const plano = valor => JSON.parse(JSON.stringify(valor));
const AGORA = new Date(2026, 10, 19, 12, 0, 0).getTime();

function vocabulario({ words = [], status = {}, terms = [], termStatus = {}, available = true } = {}) {
  const wordInfo = new Map(Object.entries(status).map(([palavra, situacao]) => [palavra, { status: situacao }]));
  const termInfo = new Map(Object.entries(termStatus).map(([termo, situacao]) => [termo, { status: situacao }]));
  return { available, words: new Set([...words, ...Object.keys(status)]), terms: new Set(terms), wordInfo, termInfo };
}

const SABE_O_RESTO_DO_PEDIDO = { en: { words: ['ferry', 'left'] } };

const IDIOMAS_DOS_AJUSTES = ['en', 'ru', 'es'];

function ajustesDoDia({ ligadas, contagem, limite }) {
  const settings = Object.fromEntries(IDIOMAS_DOS_AJUSTES.map(lang => [lang, { enabled: ligadas.includes(lang), dailyLimit: limite }]));
  const contas = Object.fromEntries(IDIOMAS_DOS_AJUSTES.map(lang => [lang, { count: contagem[lang] || 0 }]));
  return { settings, daily: { date: MineracaoDoDia.diaDe(new Date(AGORA)), ...contas } };
}

function ajustesDeMentira(chamadas, dia) {
  return {
    ler: async () => ajustesDoDia(dia),
    contarMais: async lang => { chamadas.push(['contarMais', lang]); const e = ajustesDoDia(dia); e.daily[lang].count += 1; return e; },
    publicar: estadoNovo => chamadas.push(['publicar', estadoNovo.daily.en.count, estadoNovo.daily.ru.count]),
    registrar: async evento => { chamadas.push(['registrar', plano(evento)]); },
  };
}

function historicoDeMentira(chamadas, jaTem) {
  return {
    salvarSeNova: async (frase, repetida) => {
      chamadas.push(['salvarSeNova', plano(frase)]);
      return jaTem && jaTem(repetida) ? null : { ...frase, id: 77 };
    },
  };
}

const termosDeMentira = (chamadas, termos) => async (lang, texto) => {
  chamadas.push(['termos', lang, texto]);
  if (termos instanceof Error) throw termos;
  return termos;
};

function portas({ ligadas = ['en', 'ru'], contagem = {}, limite = 20, vocab = SABE_O_RESTO_DO_PEDIDO, nivel = 'intermediario', niveis = {}, termos = null, jaTem = null } = {}) {
  const chamadas = [];
  const niveisPedidos = [];
  return {
    chamadas,
    niveis,
    niveisPedidos,
    vocabulario: async lang => { chamadas.push(['vocabulario', lang]); return vocabulario(vocab[lang] || {}); },
    nivel: async lang => { niveisPedidos.push(lang); return niveis[lang] || nivel; },
    termos: termosDeMentira(chamadas, termos),
    historico: historicoDeMentira(chamadas, jaTem),
    ajustes: ajustesDeMentira(chamadas, { ligadas, contagem, limite }),
    relogio: { agora: () => AGORA },
  };
}

const eventos = chamadas => chamadas.filter(([nome]) => nome === 'registrar').map(([, evento]) => evento);
const pedido = { texto: 'The ferry left the harbour.', origem: 'prime', contexto: { fonte: 'prime', titulo: 'Serie', detalhe: '' }, lang: 'en' };

module.exports = { MineracaoAutomatica, MineracaoDoDia, plano, AGORA, portas, eventos, pedido };

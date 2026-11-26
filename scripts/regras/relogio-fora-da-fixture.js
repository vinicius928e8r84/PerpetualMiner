'use strict';

const { linhaDe, semComentariosJs } = require('./comum');

const id = 'relogio-fora-da-fixture';

const guarda = 'o relógio do teste de e2e é montado só pela fixture `relogioParado`';

const DONO = 'e2e/relogio-parado.js';

const PROVA = 'e2e/tests/relogio-parado.spec.js';

const conserto = 'Peça a fixture `relogioParado` (e2e/fixtures.js) antes de navegar: '
  + '`const relogio = await relogioParado({ em: new Date(\'2026-09-18T12:00:00\') })`; o tempo só anda por `await relogio.avancar(ms)`. '
  + `A montagem do relógio (\`clock.install\`/\`pauseAt\`) fica em ${DONO}, com a margem maior que o prazo do teste; `
  + 'não aumente o timeout nem o retry do teste, nem apelide `page.clock`, desestruture-o ou chame o `montarRelogio` '
  + `(só ${PROVA} o chama).`;

const seAplica = arquivo => /^e2e\/.+\.js$/.test(arquivo) && arquivo !== DONO;

const AVANCO = new Set(['runFor', 'setFixedTime', 'fastForward', 'setSystemTime', 'resume']);
const MONTAGEM = new Set(['install', 'pauseAt']);

const ACESSO = /(?:\?\.|\.)\s*clock\b|\[\s*(['"`])clock\1\s*\]/g;
const SOLTO = /\bclock\s*\.\s*(install|pauseAt)\b/g;
const SEGUINTE = /\s*(?:\??\.\s*(\w+)|\[\s*(['"`])(\w+)\2\s*\])/y;
const DESESTRUTURA = /\{[^{}]*\bclock\b[^{}]*(?:\{[^{}]*\}[^{}]*)*\}\s*=(?![=>])/g;
const MONTAR_RELOGIO = /\bmontarRelogio\b/g;

const montagemFora = nome => `\`clock.${nome}\` fora de ${DONO}: o relógio é montado só pela fixture \`relogioParado\``;

function nomeDoMembroSeguinte(codigo, depoisDe) {
  SEGUINTE.lastIndex = depoisDe;
  const seguinte = SEGUINTE.exec(codigo);
  return seguinte && (seguinte[1] || seguinte[3]);
}

function detalheDoAcessoAoRelogio(nome, naProva) {
  if (AVANCO.has(nome)) return null;
  if (MONTAGEM.has(nome)) return montagemFora(nome);
  if (naProva) return null;
  return `\`clock\` de uma página guardado, passado adiante ou chamado por nome calculado: ${DONO} é o único que o manipula`;
}

function acessosAoRelogio(codigo, naProva) {
  const achados = [];
  for (const m of codigo.matchAll(ACESSO)) {
    const detalhe = detalheDoAcessoAoRelogio(nomeDoMembroSeguinte(codigo, m.index + m[0].length), naProva);
    if (detalhe) achados.push({ indice: m.index, detalhe });
  }
  return achados;
}

const eMembroDeOutroObjeto = (codigo, indice) => /(?:\?\.|\.)\s*$/.test(codigo.slice(0, indice));

function montagensSoltas(codigo) {
  return [...codigo.matchAll(SOLTO)]
    .filter(m => !eMembroDeOutroObjeto(codigo, m.index))
    .map(m => ({ indice: m.index, detalhe: montagemFora(m[1]) }));
}

function usosReservadosAoDono(codigo) {
  const desestruturados = [...codigo.matchAll(DESESTRUTURA)]
    .map(m => ({ indice: m.index, detalhe: `\`clock\` desestruturado de uma página: ${DONO} é o único que o manipula` }));
  const montadores = [...codigo.matchAll(MONTAR_RELOGIO)]
    .map(m => ({ indice: m.index, detalhe: `\`montarRelogio\` fora de ${DONO} e de ${PROVA}: um teste usa a fixture \`relogioParado\`` }));
  return [...desestruturados, ...montadores];
}

function verificar(arquivo, fonte) {
  const codigo = semComentariosJs(fonte);
  const naProva = arquivo === PROVA;
  const achados = [...acessosAoRelogio(codigo, naProva), ...montagensSoltas(codigo), ...(naProva ? [] : usosReservadosAoDono(codigo))];
  return achados
    .map(({ indice, detalhe }) => ({ linha: linhaDe(codigo, indice), detalhe }))
    .sort((a, b) => a.linha - b.linha);
}

module.exports = { id, guarda, conserto, seAplica, verificar, DONO, PROVA };

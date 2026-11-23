'use strict';

// Um teste de tempo não monta o próprio relógio (#209). `page.clock.install` deixa o relógio correndo, e uma
// `pauseAt` com a margem inventada pelo teste fica no passado quando o comando seguinte demora: no #183, o timer
// de 1,4 s corria antes da assertion (edc5a109) e, com 1.701 ms de atraso, a pausa de um segundo à frente foi
// recusada com “Cannot fast-forward to the past” (e426f7c). A montagem mora num dono só, e2e/relogio-parado.js,
// atrás da fixture `relogioParado` (e2e/fixtures.js): ela prepara o instante e a pausa juntos, antes de navegar,
// com uma margem maior que o prazo do teste. Esta regra acusa `clock.install` e `clock.pauseAt` em qualquer outro
// arquivo de e2e/.

const { linhaDe, semComentariosJs } = require('./comum');

const id = 'relogio-fora-da-fixture';

const DONO = 'e2e/relogio-parado.js';

const PROVA = 'e2e/tests/relogio-parado.spec.js';

const conserto = 'Peça a fixture `relogioParado` (e2e/fixtures.js) antes de navegar: '
  + '`const relogio = await relogioParado({ em: new Date(\'2026-09-18T12:00:00\') })`; o tempo só anda por `await relogio.avancar(ms)`. '
  + `A montagem do relógio (\`clock.install\`/\`pauseAt\`) fica em ${DONO}, com a margem maior que o prazo do teste; `
  + 'não aumente o timeout nem o retry do teste, nem apelide `page.clock`, desestruture-o ou chame o `montarRelogio` '
  + `(só ${PROVA} o chama) (docs/CODING_STANDARDS.md regra 8).`;

const seAplica = arquivo => /^e2e\/.+\.js$/.test(arquivo) && arquivo !== DONO;

const AVANCO = new Set(['runFor', 'setFixedTime', 'fastForward', 'setSystemTime', 'resume']);
const MONTAGEM = new Set(['install', 'pauseAt']);

const ACESSO = /(?:\?\.|\.)\s*clock\b|\[\s*(['"`])clock\1\s*\]/g;
const SOLTO = /\bclock\s*\.\s*(install|pauseAt)\b/g;
const SEGUINTE = /\s*(?:\??\.\s*(\w+)|\[\s*(['"`])(\w+)\2\s*\])/y;
const DESESTRUTURA = /\{[^{}]*\bclock\b[^{}]*(?:\{[^{}]*\}[^{}]*)*\}\s*=(?![=>])/g;
const MONTAR_RELOGIO = /\bmontarRelogio\b/g;

const montadoFora = nome => `\`clock.${nome}\` fora de ${DONO}: o relógio é montado só pela fixture \`relogioParado\``;
const CLOCK_GUARDADO = `\`clock\` de uma página guardado, passado adiante ou chamado por nome calculado: ${DONO} é o único que o manipula`;
const CLOCK_DESESTRUTURADO = `\`clock\` desestruturado de uma página: ${DONO} é o único que o manipula`;
const MONTAR_RELOGIO_FORA = `\`montarRelogio\` fora de ${DONO} e de ${PROVA}: um teste usa a fixture \`relogioParado\``;

function nomeDoMetodoDepois(codigo, indice) {
  SEGUINTE.lastIndex = indice;
  const depois = SEGUINTE.exec(codigo);
  return depois && (depois[1] || depois[3]);
}

function detalheDoAcesso(nome, naProva) {
  if (AVANCO.has(nome)) return null;
  if (MONTAGEM.has(nome)) return montadoFora(nome);
  return naProva ? null : CLOCK_GUARDADO;
}

function acessosAoClock(codigo, naProva) {
  const achados = [];
  for (const m of codigo.matchAll(ACESSO)) {
    const detalhe = detalheDoAcesso(nomeDoMetodoDepois(codigo, m.index + m[0].length), naProva);
    if (detalhe) achados.push({ indice: m.index, detalhe });
  }
  return achados;
}

function chamadasSoltasDaMontagem(codigo) {
  const depoisDeUmPonto = m => /(?:\?\.|\.)\s*$/.test(codigo.slice(0, m.index));
  return [...codigo.matchAll(SOLTO)]
    .filter(m => !depoisDeUmPonto(m))
    .map(m => ({ indice: m.index, detalhe: montadoFora(m[1]) }));
}

function usosProibidosForaDaProva(codigo) {
  const achadosDe = (regex, detalhe) => [...codigo.matchAll(regex)].map(m => ({ indice: m.index, detalhe }));
  return [...achadosDe(DESESTRUTURA, CLOCK_DESESTRUTURADO), ...achadosDe(MONTAR_RELOGIO, MONTAR_RELOGIO_FORA)];
}

function verificar(arquivo, fonte) {
  const codigo = semComentariosJs(fonte);
  const naProva = arquivo === PROVA;
  const achados = [
    ...acessosAoClock(codigo, naProva),
    ...chamadasSoltasDaMontagem(codigo),
    ...(naProva ? [] : usosProibidosForaDaProva(codigo)),
  ];
  return achados.map(({ indice, detalhe }) => ({ linha: linhaDe(codigo, indice), detalhe })).sort((a, b) => a.linha - b.linha);
}

module.exports = { id, conserto, seAplica, verificar, DONO, PROVA };

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

const conserto = 'Peça a fixture `relogioParado` (e2e/fixtures.js) antes de navegar: '
  + '`const relogio = await relogioParado({ em: new Date(\'2026-09-18T12:00:00\') })`; o tempo só anda por `await relogio.avancar(ms)`. '
  + `A montagem do relógio (\`clock.install\`/\`pauseAt\`) fica em ${DONO}, com a margem maior que o prazo do teste; `
  + 'não aumente o timeout nem o retry do teste (CODING_STANDARDS.md regra 8).';

const seAplica = arquivo => /^e2e\/.+\.js$/.test(arquivo) && arquivo !== DONO;

const MONTAGEM = /\bclock\s*\.\s*(install|pauseAt)\b/g;

function verificar(arquivo, fonte) {
  const codigo = semComentariosJs(fonte);
  return [...codigo.matchAll(MONTAGEM)].map(m => ({
    linha: linhaDe(codigo, m.index),
    detalhe: `\`clock.${m[1]}\` fora de ${DONO}: o relógio é montado só pela fixture \`relogioParado\``,
  }));
}

module.exports = { id, conserto, seAplica, verificar, DONO };

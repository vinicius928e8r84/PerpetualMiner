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
  + `(só ${PROVA} o chama) (CODING_STANDARDS.md regra 8).`;

const seAplica = arquivo => /^e2e\/.+\.js$/.test(arquivo) && arquivo !== DONO;

// O que mexe no relógio sem ser a montagem: avançar e fixar o instante numa página que o apoio já tem.
const AVANCO = new Set(['runFor', 'setFixedTime', 'fastForward', 'setSystemTime', 'resume']);
const MONTAGEM = new Set(['install', 'pauseAt']);

// `clock` aberto de uma página ou contexto: `.clock`, `?.clock` ou `['clock']`; e o `clock.install` solto, de um apelido já feito.
const ACESSO = /(?:\?\.|\.)\s*clock\b|\[\s*(['"`])clock\1\s*\]/g;
const SOLTO = /\bclock\s*\.\s*(install|pauseAt)\b/g;
// O que vem logo depois do acesso: `.nome`, `?.nome` ou `['nome']`.
const SEGUINTE = /\s*(?:\??\.\s*(\w+)|\[\s*(['"`])(\w+)\2\s*\])/y;
// `const { clock } = page`, `{ clock: relogio } = context`, `{ clock: { install } } = page`.
const DESESTRUTURA = /\{[^{}]*\bclock\b[^{}]*(?:\{[^{}]*\}[^{}]*)*\}\s*=(?![=>])/g;
const MONTAR_RELOGIO = /\bmontarRelogio\b/g;

function verificar(arquivo, fonte) {
  const codigo = semComentariosJs(fonte);
  const achados = [];
  const acusa = (indice, detalhe) => achados.push({ linha: linhaDe(codigo, indice), detalhe });
  const naProva = arquivo === PROVA;

  for (const m of codigo.matchAll(ACESSO)) {
    SEGUINTE.lastIndex = m.index + m[0].length;
    const depois = SEGUINTE.exec(codigo);
    const nome = depois && (depois[1] || depois[3]);
    if (nome && AVANCO.has(nome)) continue;
    if (nome && MONTAGEM.has(nome)) {
      acusa(m.index, `\`clock.${nome}\` fora de ${DONO}: o relógio é montado só pela fixture \`relogioParado\``);
    } else if (!naProva) {
      acusa(m.index, `\`clock\` de uma página guardado, passado adiante ou chamado por nome calculado: ${DONO} é o único que o manipula`);
    }
  }
  for (const m of codigo.matchAll(SOLTO)) {
    // O `.clock.install` já acusado acima não conta duas vezes.
    if (/(?:\?\.|\.)\s*$/.test(codigo.slice(0, m.index))) continue;
    acusa(m.index, `\`clock.${m[1]}\` fora de ${DONO}: o relógio é montado só pela fixture \`relogioParado\``);
  }
  if (!naProva) {
    for (const m of codigo.matchAll(DESESTRUTURA)) acusa(m.index, `\`clock\` desestruturado de uma página: ${DONO} é o único que o manipula`);
    for (const m of codigo.matchAll(MONTAR_RELOGIO)) acusa(m.index, `\`montarRelogio\` fora de ${DONO} e de ${PROVA}: um teste usa a fixture \`relogioParado\``);
  }
  return achados.sort((a, b) => a.linha - b.linha);
}

module.exports = { id, conserto, seAplica, verificar, DONO, PROVA };

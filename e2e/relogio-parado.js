'use strict';

// O relógio parado dos testes de tempo (#209). Um relógio que ainda corre faz o teste depender da velocidade
// da máquina: o timer de 1,4 s dispara antes da assertion, ou a pausa que mira um segundo à frente já ficou
// no passado quando o segundo comando chega (“Cannot fast-forward to the past”, 1.701 ms de atraso no #183).
// Aqui o instante e a pausa são montados juntos, antes de navegar, com uma margem maior que o prazo do teste:
// nenhum atraso que o teste ainda pode sofrer alcança a pausa. Daí em diante o tempo só anda por `avancar`.
//
// Este arquivo é o único dono de `clock.install`/`pauseAt` nos testes: a regra `relogio-fora-da-fixture`
// (scripts/regras/) recusa a montagem do relógio em qualquer outro arquivo de e2e/. Um teste usa a fixture
// `relogioParado` de e2e/fixtures.js; esperas de rede usam evento ou promessa (`waitForResponse`), nunca sono real.

/** Menor margem entre a montagem e a pausa: dez vezes o prazo padrão de um teste (playwright.config.js). */
const MARGEM_MINIMA_MS = 5 * 60_000;

/** A margem de um teste com `prazo` ms (0 = sem prazo): sempre maior que o tempo real que ele ainda pode gastar. */
function margemDoTeste(prazo) {
  return Math.max(MARGEM_MINIMA_MS, 2 * prazo);
}

/**
 * A montagem em dois comandos: o relógio nasce em `desde` e, com `ate`, para ali. Existe para a fixture e para a
 * prova de e2e/tests/relogio-parado.spec.js, que monta as preparações antigas (o relógio que segue correndo, a
 * pausa de um segundo à frente) e as vê falhar; um teste não a chama, usa `relogioParado`.
 */
async function montarRelogio(page, { desde, ate }) {
  await page.clock.install({ time: desde });
  if (ate !== undefined) await page.clock.pauseAt(ate);
}

/**
 * Para o relógio de `page` em `em` (agora, sem `em`), antes de qualquer navegação. A margem fica antes de `em`,
 * não depois: a página lê exatamente `em`, e o atraso entre os dois comandos come a margem, não o instante.
 * Devolve o relógio parado: `instante`, `margem` (ms) e `avancar` (o único jeito de o tempo andar).
 */
async function pararRelogio(page, { em = new Date(), prazoDoTeste = 0 } = {}) {
  const instante = new Date(em);
  const margem = margemDoTeste(prazoDoTeste);
  await montarRelogio(page, { desde: new Date(instante.getTime() - margem), ate: instante });
  return {
    instante,
    margem,
    /** Anda o relógio parado `tempo` (ms, ou 'mm:ss'), disparando o que vence nesse intervalo. */
    avancar: tempo => page.clock.runFor(tempo),
  };
}

module.exports = { pararRelogio, montarRelogio, margemDoTeste, MARGEM_MINIMA_MS };

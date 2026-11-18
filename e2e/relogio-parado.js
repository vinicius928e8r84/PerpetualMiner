'use strict';

const MARGEM_MINIMA_MS = 5 * 60_000;

function margemDoTeste(prazo) {
  return Math.max(MARGEM_MINIMA_MS, 2 * prazo);
}

async function montarRelogio(page, { desde, ate }) {
  await page.clock.install({ time: desde });
  if (ate !== undefined) await page.clock.pauseAt(ate);
}

async function pararRelogio(page, { em = new Date(), prazoDoTeste = 0 } = {}) {
  const instante = new Date(em);
  const margem = margemDoTeste(prazoDoTeste);
  await montarRelogio(page, { desde: new Date(instante.getTime() - margem), ate: instante });
  return {
    instante,
    margem,
    avancar: tempo => page.clock.runFor(tempo),
  };
}

module.exports = { pararRelogio, montarRelogio };

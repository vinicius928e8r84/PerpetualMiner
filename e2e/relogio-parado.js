'use strict';

const MARGEM_MINIMA_MS = 5 * 60_000;
const AGORA_DOS_TESTES = new Date('2026-09-18T12:00:00');

function margemDoTeste(prazo) {
  return Math.max(MARGEM_MINIMA_MS, 2 * prazo);
}

async function montarRelogio(page, { desde, ate }) {
  await page.clock.install({ time: desde });
  if (ate !== undefined) await page.clock.pauseAt(ate);
}

async function pararRelogio(page, { em = AGORA_DOS_TESTES, prazoDoTeste = 0 } = {}) {
  const instante = new Date(em);
  const margem = margemDoTeste(prazoDoTeste);
  await montarRelogio(page, { desde: new Date(instante.getTime() - margem), ate: instante });
  return {
    instante,
    margem,
    avancar: tempo => page.clock.runFor(tempo),
  };
}

module.exports = { pararRelogio, montarRelogio, AGORA_DOS_TESTES };

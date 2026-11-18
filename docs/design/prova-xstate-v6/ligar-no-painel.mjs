#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const [, , destino, modo = 'fsm'] = process.argv;

if (!destino || !['fsm', 'inteira'].includes(modo) || process.env.PM_PROVA_DESCARTAVEL !== '1') {
  console.error('uso: PM_PROVA_DESCARTAVEL=1 node ligar-no-painel.mjs <cópia descartável do repositório> [fsm|inteira]\n'
    + 'Liga a prova no painel de uma CÓPIA, para medir: nunca na árvore que vira commit.');
  process.exit(2);
}

const raiz = path.resolve(destino);
const copiar = (de, para) => fs.copyFileSync(path.join(AQUI, de), path.join(raiz, para));
const escrever = (arquivo, texto) => fs.writeFileSync(path.join(raiz, arquivo), texto);

copiar('vendor/xstate-fsm.umd.min.js', 'lib/xstate-fsm.umd.min.js');
copiar('fase-da-remessa-fsm.js', 'lib/fase-da-remessa-fsm.js');
escrever('lib/ligar-a-fase-fsm.js', "'use strict';\n\nglobalThis.PerpetualMiner.FaseDaRemessa = globalThis.PerpetualMiner.FaseDaRemessaFSM;\n");
const scripts = ['lib/xstate-fsm.umd.min.js', 'lib/fase-da-remessa-fsm.js', 'lib/ligar-a-fase-fsm.js'];

if (modo === 'inteira') {
  copiar('vendor/xstate.umd.min.js', 'lib/xstate.umd.min.js');
  copiar('remessa.js', 'lib/remessa-xstate.js');
  scripts.push('lib/xstate.umd.min.js', 'lib/remessa-xstate.js');
}

const ANCORA = '  <script src="painel-envio-estado.js"></script>\n';
const painel = fs.readFileSync(path.join(raiz, 'painel.html'), 'utf8');
if (!painel.includes(ANCORA) || painel.includes('xstate')) throw new Error('painel.html não tem a âncora esperada, ou já foi ligado');
escrever('painel.html', painel.replace(ANCORA, ANCORA + scripts.map(s => `  <script src="${s}"></script>\n`).join('')));

escrever('e2e/tests/prova-xstate.spec.js', `'use strict';

const { test, expect } = require('../fixtures');
const { abrirPainel } = require('../apoio-do-envio');

test('a prova do XState roda na página da extensão, sem build e sem violar a CSP', async ({ page, extensao }) => {
  const DO_PAINEL_SEM_A_PROVA = [/^Failed to load resource: the server responded with a status of 503/, /^Blocked script execution in 'about:srcdoc'/];
  const erros = [];
  page.on('console', mensagem => {
    if (mensagem.type() === 'error' && !DO_PAINEL_SEM_A_PROVA.some(conhecido => conhecido.test(mensagem.text()))) erros.push(mensagem.text());
  });
  page.on('pageerror', erro => erros.push(String(erro)));
  await abrirPainel(page, extensao);

  const lido = await page.evaluate(async modo => {
    const violacoes = [];
    document.addEventListener('securitypolicyviolation', evento => violacoes.push(evento.violatedDirective));
    const { FaseDaRemessa, RemessaXState } = globalThis.PerpetualMiner;
    const visto = {
      aFaseEhADoXState: Boolean(FaseDaRemessa.maquina),
      criar: FaseDaRemessa.proxima('parada', { tipo: 'criar' }),
      csp: (await chrome.runtime.getManifest()).content_security_policy ?? null,
      remessa: null,
    };
    if (modo === 'inteira') {
      const naConexao = [];
      const remessa = RemessaXState.criar({
        conexao: {
          criar: async corpo => { naConexao.push({ jobId: corpo.jobId, status: 'completed', state: { status: 'completed', successfulPhraseIds: [1] } }); return { jobId: corpo.jobId }; },
          listar: async () => ({ jobs: naConexao }),
          retomar: async () => ({ desfecho: 'retomado' }),
        },
        ajustes: { ler: async () => ({ en: { deckName: 'PM::Prova', imageSource: 'google' } }) },
        guardar: { gravar: async () => {}, esquecer: async () => {}, apagarTudo: async () => {} },
      });
      const fases = [];
      remessa.ator.subscribe(() => { if (fases.at(-1) !== remessa.visao().fase) fases.push(remessa.visao().fase); });
      remessa.ator.start();
      remessa.enviar([{ id: 1, lang: 'en', linha: 'the cat' }], { en: 'prova-en' });
      for (let i = 0; i < 100 && remessa.visao().fase !== 'resumo'; i += 1) await new Promise(resolver => setTimeout(resolver, 50));
      visto.remessa = { fases, enviadas: remessa.visao().resumo?.enviadas };
      remessa.ator.stop();
    }
    return { ...visto, violacoes };
  }, ${JSON.stringify(modo)});

  expect(lido).toEqual({
    aFaseEhADoXState: true,
    criar: 'criando',
    csp: null,
    remessa: ${modo === 'inteira' ? "{ fases: ['parada', 'criando', 'acompanhando', 'resumo'], enviadas: [1] }" : 'null'},
    violacoes: [],
  });
  expect(erros).toEqual([]);
});
`);

console.log(`ligado (${modo}) em ${raiz}: ${scripts.join(', ')} e e2e/tests/prova-xstate.spec.js`);

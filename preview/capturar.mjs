#!/usr/bin/env node
'use strict';

// Tira as capturas de tela que a landing (`preview/site/sobre.html`) mostra.
//
// São as telas de verdade da extensão, como o preview as monta (`montar.mjs`, com o `chrome.*` de
// `chrome-simulado.js`), abertas no Chromium com frases de exemplo: nada pessoal, nenhuma série nem
// marca de streaming na tela. Nada é desenhado à mão. As imagens ficam em `preview/site/capturas/` e
// vão para o Git, porque o Vercel monta o site sem navegador.
//
//   node preview/capturar.mjs
//
// Precisa do Chromium do Playwright de `e2e/` (`cd e2e && npm ci && npm run setup`). Rode de novo
// quando uma tela mudar. Nada sai para a rede: o preview é servido do disco e a única resposta de
// fora das telas é a saúde da Conexão com o Anki, tirada do exemplo do contrato, para o painel e o
// popup aparecerem com ela ligada.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAIDA = path.join(RAIZ, 'preview', 'site', 'capturas');
const { chromium } = createRequire(path.join(RAIZ, 'e2e', 'package.json'))('@playwright/test');

// O idioma de cada frase de exemplo sai do mesmo detector que a extensão usa ao minerar.
createRequire(import.meta.url)('../lib/idioma.js');
const { detectarIdioma } = globalThis.PerpetualMiner;

/** Um endereço que não existe: o preview é entregue do disco, por cima da rede. */
const ORIGEM = 'https://preview.perpetualminer.test';
const CONEXAO = 'http://127.0.0.1:8766';
const AGORA = new Date('2026-11-10T12:00:00');

const dia = atras => {
  const data = new Date(AGORA);
  data.setDate(data.getDate() - atras);
  return data.toLocaleDateString('pt-BR');
};

/** A Palavra como o painel a guarda (`palavra@índice`, o índice do token na frase, como `tokenizarFrase` de painel.js). */
function palavra(texto, alvo) {
  const tokens = texto.match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*|[^\p{L}\p{N}]/gu);
  return `${alvo}@${tokens.findIndex(token => token.toLowerCase() === alvo)}`;
}

const frase = (id, atras, texto, alvos, fonte, titulo, detalhe, extras = {}) => ({
  id, texto, data: dia(atras), streaming: fonte, idioma: detectarIdioma(texto),
  keywords: alvos.map(alvo => palavra(texto, alvo)), contexto: { fonte, titulo, detalhe }, ...extras,
});

/** O estado gravado da frase que já virou cartão (o `STATUS_ENVIADA_AO_ANKI` de painel.js). */
const ENVIADA_AO_ANKI = { status: 'exported' };

const FRASES = [
  frase(12, 0, 'The quiet harbor woke before the gulls did.', ['harbor'], 'web', 'Harbor Notes', '', { autoKeyword: true }),
  frase(11, 0, 'She was reluctant to say anything.', ['reluctant'], 'livro', 'The Lantern Keeper', 'cap. 4'),
  frase(10, 0, 'Не всё то золото, что блестит.', ['золото'], 'web', 'Пословицы', '', ENVIADA_AO_ANKI),
  frase(9, 1, 'The meeting was put off until next week.', ['put', 'off'], 'pdf', 'Office English', 'cap. 2'),
  frase(8, 1, 'Мы с тобой одной крови — ты и я.', ['крови'], 'livro', 'Книга джунглей', 'cap. 3', ENVIADA_AO_ANKI),
  frase(7, 1, 'You cannot have your cake and eat it.', ['cake'], 'manual', '', ''),
  frase(6, 3, 'Let us call it a day.', [], 'web', 'Everyday Idioms', ''),
];

/** O que as capturas trocam nos dados de exemplo do simulador: a configuração terminada e as frases acima. */
const DADOS = {
  frases: FRASES,
  pm_boas_vindas: { agoraNao: [], concluida: true },
  pm_anki_ja_conectou: true,
};

async function minerarALegenda(pagina) {
  // O botão flutuante entra no player até 1 s depois de a página abrir.
  await pagina.locator('perpetualminer-overlay .pm-botao').waitFor();
  await pagina.keyboard.press('Alt+KeyS');
  const aviso = pagina.locator('perpetualminer-overlay .pm-chip');
  await aviso.waitFor();
  await pagina.locator('perpetualminer-overlay').evaluate(host =>
    Promise.all(host.shadowRoot.getAnimations({ subtree: true }).map(animacao => animacao.finished)));
}

async function selecionarDuasFrases(pagina) {
  const caixas = pagina.locator('#frases-lista .veio-frase input[type="checkbox"]');
  await caixas.nth(0).check();
  await caixas.nth(1).check();
  await pagina.mouse.move(0, 0);
}

/**
 * Cada imagem: a tela do preview, a janela (em px de CSS; a imagem sai com o dobro) e o que fazer antes da foto.
 * A do vídeo é JPEG: o degradê do vídeo simulado pesa várias vezes mais em PNG.
 */
const CAPTURAS = [
  { arquivo: 'legenda.jpg', tela: 'video-simulado.html', janela: { width: 480, height: 360 }, antes: minerarALegenda },
  { arquivo: 'painel.png', tela: 'painel.html#frases', janela: { width: 1200, height: 750 }, antes: selecionarDuasFrases },
  { arquivo: 'painel-estreito.png', tela: 'painel.html#frases', janela: { width: 480, height: 720 }, antes: selecionarDuasFrases },
  { arquivo: 'popup.png', tela: 'popup.html', janela: { width: 340, height: 600 } },
];

async function saudeDaConexao() {
  const contrato = JSON.parse(await fs.readFile(path.join(RAIZ, 'complemento', 'contrato', 'exemplos.json'), 'utf8'));
  return contrato.exemplos.find(exemplo => exemplo.nome === 'saúde com um perfil aberto').resposta.json;
}

async function capturar() {
  // Antes de montar: o preview copia esta pasta, e na primeira vez ela ainda não existe.
  await fs.mkdir(SAIDA, { recursive: true });
  const preview = await fs.mkdtemp(path.join(os.tmpdir(), 'pm-capturas-'));
  execFileSync('node', [path.join(RAIZ, 'preview', 'montar.mjs'), '--saida', preview], { stdio: ['ignore', 'ignore', 'inherit'] });
  const saude = await saudeDaConexao();

  const navegador = await chromium.launch();
  try {
    for (const { arquivo, tela, janela, antes } of CAPTURAS) {
      const contexto = await navegador.newContext({ viewport: janela, deviceScaleFactor: 2, locale: 'pt-BR', reducedMotion: 'reduce' });
      await contexto.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGEM });
      await contexto.route(`${ORIGEM}/**`, (rota, pedido) =>
        rota.fulfill({ path: path.join(preview, decodeURIComponent(new URL(pedido.url()).pathname)) }));
      await contexto.route(`${CONEXAO}/**`, (rota, pedido) => (new URL(pedido.url()).pathname === '/health' && pedido.method() === 'GET'
        ? rota.fulfill({ json: saude, headers: { 'Access-Control-Allow-Origin': '*' } })
        : rota.abort()));
      await contexto.addInitScript(dados => { window.PREVIEW_DADOS = dados; }, DADOS);

      const pagina = await contexto.newPage();
      await pagina.clock.setFixedTime(AGORA);
      await pagina.goto(`${ORIGEM}/extensao/${tela}`);
      // A faixa “Preview: dados de exemplo” é do preview, não da tela.
      await pagina.addStyleTag({ content: '#preview-faixa { display: none !important; }' });
      await pagina.evaluate(() => document.fonts.ready);
      await pagina.waitForLoadState('networkidle');
      if (antes) await antes(pagina);
      const formato = arquivo.endsWith('.jpg') ? { type: 'jpeg', quality: 88 } : { type: 'png' };
      await pagina.screenshot({ path: path.join(SAIDA, arquivo), animations: 'disabled', ...formato });
      await contexto.close();
      console.log(`  ${arquivo}`);
    }
  } finally {
    await navegador.close();
    await fs.rm(preview, { recursive: true, force: true });
  }
  // Uma imagem que saiu da lista sai da pasta.
  const daLista = new Set(CAPTURAS.map(captura => captura.arquivo));
  for (const nome of await fs.readdir(SAIDA)) {
    if (!daLista.has(nome)) await fs.rm(path.join(SAIDA, nome));
  }
  console.log(`capturas em ${path.relative(process.cwd(), SAIDA)}`);
}

await capturar();

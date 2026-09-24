#!/usr/bin/env node
'use strict';

// Monta o site do preview em `preview/dist`, a partir do que está no repo.
//
// O repositório é uma extensão, não um site: o Vercel não teria o que servir.
// Este script junta, numa pasta só, o que dá para olhar no navegador — a
// vitrine da Base Veio, os protótipos travados e as telas da extensão — e
// injeta `chrome-simulado.js` nas cópias das telas, para elas renderizarem com
// dados de exemplo em vez de quebrar na primeira chamada de `chrome.*`.
//
// Nada aqui altera os arquivos da extensão: tudo é cópia para `dist/`.
//
//   node preview/montar.mjs            # monta em preview/dist
//   node preview/montar.mjs --servir   # monta e serve em http://127.0.0.1:4173

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = path.join(RAIZ, 'preview', 'dist');

/** As telas da extensão que o preview mostra, com o simulador injetado. */
const TELAS = [
  { arquivo: 'popup.html', titulo: 'Popup', largura: '340 px' },
  { arquivo: 'painel.html', titulo: 'Painel', largura: 'tela cheia' },
  { arquivo: 'bookreader.html', titulo: 'Minerar de uma foto', largura: 'tela cheia' },
];

/** O que cada tela carrega além dela mesma. */
const APOIO = ['popup.css', 'popup.js', 'painel.css', 'painel-shell.js', 'painel-conta.js', 'painel-atalhos.js', 'painel-chave.js', 'painel-perigo.js', 'painel.js', 'bookreader.css', 'bookreader.js', 'tombstone.js'];

const existe = async alvo => fs.access(alvo).then(() => true, () => false);

async function copiar(de, para) {
  await fs.mkdir(path.dirname(para), { recursive: true });
  await fs.cp(de, para, { recursive: true });
}

/** Injeta o simulador como primeiro script da página, antes dos scripts dela. */
function injetarSimulador(html) {
  const marca = '<script src="/preview-chrome-simulado.js"></script>';
  if (html.includes('</head>')) return html.replace('</head>', `  ${marca}\n</head>`);
  return `${marca}\n${html}`;
}

/** Os protótipos de `docs/design`, para a lista da capa. */
async function acharPrototipos() {
  const base = path.join(RAIZ, 'docs', 'design');
  if (!(await existe(base))) return [];
  const achados = [];
  const andar = async pasta => {
    for (const item of await fs.readdir(pasta, { withFileTypes: true })) {
      const alvo = path.join(pasta, item.name);
      if (item.isDirectory()) await andar(alvo);
      else if (item.name.endsWith('.html')) achados.push(path.relative(base, alvo).split(path.sep).join('/'));
    }
  };
  await andar(base);
  return achados.sort();
}

const TITULOS = {
  'identidade-veio/prototipo-identidade.html': 'Identidade Veio (protótipo travado)',
  'popup/prototipo-popup.html': 'Popup',
  'painel/shell/prototipo-shell.html': 'Painel · shell',
  'painel/frases/prototipo-frases.html': 'Painel · frases',
  'painel/anki/prototipo-anki.html': 'Painel · Anki',
  'painel/configuracoes/prototipo-configuracoes.html': 'Painel · configurações',
  'painel/boas-vindas/prototipo-onboarding.html': 'Boas-vindas',
  'foto/prototipo-bookreader.html': 'Minerar de uma foto',
  'overlay/prototipo-overlay.html': 'Overlay',
  'voz/catalogo.html': 'Voz: catálogo de mensagens',
  'auditoria/auditoria-front.html': 'Auditoria do front',
};

function capa({ telas, prototipos, temVitrine, temVeio, git }) {
  const linha = (href, titulo, detalhe) =>
    `      <li><a href="${href}"><span>${titulo}</span><small>${detalhe}</small></a></li>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PerpetualMiner · preview do front</title>
<style>
  /* Reserva: nas branches anteriores à Base Veio não existe veio/tokens.css. */
  :root {
    --veio-bg: #121110; --veio-surface: #1B1A17; --veio-border: #302D27;
    --veio-text: #F2EEE6; --veio-muted: #A89F90; --veio-accent: #F5B83D;
    --veio-accent-soft: rgba(245, 184, 61, .14);
    --veio-fonte-ui: system-ui, sans-serif; --veio-fonte-mono: ui-monospace, monospace;
    --veio-tam-corpo: 13.5px; --veio-tam-hero: 24px; --veio-tam-pagina: 22px;
    --veio-tam-legenda: 11.5px; --veio-tracking-legenda: .14em;
    --veio-raio-input: 12px; --veio-raio-icone: 10px;
  }
</style>
<link rel="stylesheet" href="/veio/tokens.css">
<style>
  body { margin: 0; background: var(--veio-bg); color: var(--veio-text); font-family: var(--veio-fonte-ui); font-size: var(--veio-tam-corpo); line-height: 1.5; }
  main { max-width: 820px; margin: 0 auto; padding: 36px 16px 72px; }
  .topo { display: flex; align-items: center; gap: 12px; }
  .topo .veio-nome { font-size: var(--veio-tam-pagina); }
  h1 { font-size: var(--veio-tam-hero); font-weight: 800; margin: 20px 0 6px; }
  h2 { font-size: var(--veio-tam-legenda); font-weight: 800; letter-spacing: var(--veio-tracking-legenda); text-transform: uppercase; color: var(--veio-muted); margin: 30px 0 10px; }
  p { color: var(--veio-muted); margin: 0 0 10px; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  a { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 10px 14px; border-radius: var(--veio-raio-input); background: var(--veio-surface); border: 1px solid var(--veio-border); color: var(--veio-text); text-decoration: none; }
  a:hover { border-color: var(--veio-accent); }
  small { color: var(--veio-muted); font-family: var(--veio-fonte-mono); font-size: 11.5px; text-align: right; overflow-wrap: anywhere; }
  .aviso { padding: 10px 12px; border-radius: var(--veio-raio-input); background: var(--veio-accent-soft); color: var(--veio-text); margin-bottom: 8px; }
  .veio-nome { font-weight: 500; }
  .veio-nome b { font-weight: 800; }
  .rodape { margin-top: 36px; font-family: var(--veio-fonte-mono); font-size: 11.5px; color: var(--veio-muted); overflow-wrap: anywhere; }
</style>
</head>
<body>
<main>
  <div class="topo">
${temVeio ? '    <img class="veio-marca" src="/veio/icones/icone.svg" width="40" height="40" alt="">\n' : ''}    <span class="veio-nome">Perpetual<b>Miner</b>${temVeio ? '<span class="veio-cursor"></span>' : ''}</span>
  </div>
  <h1>Preview do front</h1>
  <p>Como esta branch fica na tela. Gerado a cada push pelo Vercel.</p>

  <h2>Telas da extensão</h2>
  <div class="aviso">Fora do Chrome não existe <code>chrome.*</code>, então o preview injeta um simulador com dados de exemplo: o visual é o de verdade, o conteúdo é inventado e o que depende do navegador (login, atalho, envio ao Anki) não funciona.</div>
  <ul>
${telas.map(tela => linha(`/extensao/${tela.arquivo}`, tela.titulo, tela.largura)).join('\n')}
  </ul>

  <h2>Base Veio</h2>
  <ul>
${temVitrine ? linha('/vitrine.html', 'Vitrine: tokens, escala de tipo, raios, cirílico e os componentes base', 'nos dois temas') : '      <li><a><span>Vitrine ainda não existe nesta branch</span><small>e2e/vitrine</small></a></li>'}
  </ul>

  <h2>Protótipos travados</h2>
  <ul>
${prototipos.map(rel => linha(`/design/${rel}${rel.includes('identidade') ? '?variant=F' : ''}`, TITULOS[rel] || rel, rel.split('/')[0])).join('\n')}
  </ul>

  <p class="rodape">${git}</p>
</main>
</body>
</html>
`;
}

async function montar() {
  await fs.rm(DESTINO, { recursive: true, force: true });
  await fs.mkdir(DESTINO, { recursive: true });

  // A identidade, na raiz: a vitrine e a capa pedem `/veio/…`.
  const temVeio = await existe(path.join(RAIZ, 'veio'));
  if (temVeio) {
    await copiar(path.join(RAIZ, 'veio'), path.join(DESTINO, 'veio'));
    await copiar(path.join(RAIZ, 'veio'), path.join(DESTINO, 'extensao', 'veio'));
  }

  // As telas, com o simulador injetado, e o que elas carregam.
  const telas = [];
  for (const tela of TELAS) {
    const origem = path.join(RAIZ, tela.arquivo);
    if (!(await existe(origem))) continue;
    const html = await fs.readFile(origem, 'utf8');
    await fs.mkdir(path.join(DESTINO, 'extensao'), { recursive: true });
    await fs.writeFile(path.join(DESTINO, 'extensao', tela.arquivo), injetarSimulador(html));
    telas.push(tela);
  }
  for (const nome of APOIO) {
    const origem = path.join(RAIZ, nome);
    if (await existe(origem)) await copiar(origem, path.join(DESTINO, 'extensao', nome));
  }
  for (const pasta of ['lib']) {
    const origem = path.join(RAIZ, pasta);
    if (!(await existe(origem))) continue;
    await copiar(origem, path.join(DESTINO, 'extensao', pasta));
    // Também na raiz: a vitrine pede `/lib/…` por caminho absoluto, como pede
    // `/veio/…`, para carregar o mesmo catálogo da Voz que as telas carregam.
    await copiar(origem, path.join(DESTINO, pasta));
  }
  await copiar(path.join(RAIZ, 'preview', 'chrome-simulado.js'), path.join(DESTINO, 'preview-chrome-simulado.js'));

  // A vitrine da Base Veio, que já pede `/veio/…` e `/lib/…` por caminho
  // absoluto. A pasta inteira vem junto: a galeria de componentes é montada
  // por `componentes-da-vitrine.js`, ao lado do HTML.
  const vitrine = path.join(RAIZ, 'e2e', 'vitrine');
  const temVitrine = await existe(path.join(vitrine, 'vitrine.html'));
  if (temVitrine) await copiar(vitrine, DESTINO);

  // Os protótipos travados.
  const prototipos = await acharPrototipos();
  if (prototipos.length) await copiar(path.join(RAIZ, 'docs', 'design'), path.join(DESTINO, 'design'));

  const git = [
    process.env.VERCEL_GIT_COMMIT_REF && `branch ${process.env.VERCEL_GIT_COMMIT_REF}`,
    process.env.VERCEL_GIT_COMMIT_SHA && `commit ${process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)}`,
    process.env.VERCEL_GIT_COMMIT_MESSAGE && process.env.VERCEL_GIT_COMMIT_MESSAGE.split('\n')[0],
  ].filter(Boolean).join(' · ') || 'build local';

  await fs.writeFile(path.join(DESTINO, 'index.html'), capa({ telas, prototipos, temVitrine, temVeio, git }));

  console.log(`preview montado em ${path.relative(process.cwd(), DESTINO)}`);
  console.log(`  telas: ${telas.map(t => t.arquivo).join(', ') || 'nenhuma'}`);
  console.log(`  vitrine: ${temVitrine ? 'sim' : 'não'} · protótipos: ${prototipos.length}`);
}

const TIPOS_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

/** Serve `dist/` local, do mesmo jeito que o Vercel serve o site estático. */
function servir() {
  const servidor = createServer(async (req, res) => {
    const pedido = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let alvo = path.normalize(path.join(DESTINO, pedido));
    if (!alvo.startsWith(DESTINO)) return res.writeHead(403).end();
    if (await existe(alvo) && (await fs.stat(alvo)).isDirectory()) alvo = path.join(alvo, 'index.html');
    if (!(await existe(alvo))) return res.writeHead(404).end('não encontrado');
    res.writeHead(200, { 'Content-Type': TIPOS_MIME[path.extname(alvo)] || 'application/octet-stream' });
    createReadStream(alvo).pipe(res);
  });
  servidor.listen(4173, '127.0.0.1', () => console.log('preview em http://127.0.0.1:4173'));
}

await montar();
if (process.argv.includes('--servir')) servir();

#!/usr/bin/env node
'use strict';

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAIDA = process.argv.indexOf('--saida');
const DESTINO = SAIDA > 0 ? path.resolve(process.argv[SAIDA + 1]) : path.join(RAIZ, 'preview', 'dist');
const EXTENSAO = path.join(DESTINO, 'extensao');

const require = createRequire(import.meta.url);
require('../lib/arquivos-da-extensao.js');
const { arquivosDaExtensao } = globalThis.PerpetualMiner;

const TELAS = [
  { arquivo: 'popup/popup.html', titulo: 'Popup', largura: '340 px' },
  { arquivo: 'painel/painel.html', titulo: 'Painel', largura: 'tela cheia' },
  { arquivo: 'bookreader/bookreader.html', titulo: 'Minerar de uma foto', largura: 'tela cheia' },
];

const PASTAS_DE_APOIO = ['conexao'];

const PAGINAS_PUBLICAS = [
  { arquivo: 'sobre.html', enderecos: ['sobre'] },
];

const existe = async alvo => fs.access(alvo).then(() => true, () => false);

async function copiar(de, para) {
  await fs.mkdir(path.dirname(para), { recursive: true });
  await fs.cp(de, para, { recursive: true });
}

function injetarSimulador(html) {
  const marca = '<script src="/preview-chrome-simulado.js"></script>';
  if (html.includes('</head>')) return html.replace('</head>', `  ${marca}\n</head>`);
  return `${marca}\n${html}`;
}

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

const itemDaLista = (href, titulo, detalhe) =>
  `      <li><a href="${href}"><span>${titulo}</span><small>${detalhe}</small></a></li>`;

const itemDaTela = tela => itemDaLista(`/extensao/${tela.arquivo}`, tela.titulo, tela.largura);

const enderecoDoPrototipo = rel => `/design/${rel}${rel.includes('identidade') ? '?variant=F' : ''}`;

const itemDoPrototipo = rel => itemDaLista(enderecoDoPrototipo(rel), TITULOS[rel] || rel, rel.split('/')[0]);

function itemDaVitrine(temVitrine) {
  if (temVitrine) return itemDaLista('/vitrine.html', 'Vitrine: tokens, escala de tipo, raios, cirílico e os componentes base', 'nos dois temas');
  return '      <li><a><span>Vitrine ainda não existe nesta branch</span><small>e2e/vitrine</small></a></li>';
}

function marcaDoTopo(temVeio) {
  const nome = 'Perpetual<b>Miner</b>';
  if (!temVeio) return `    <span class="veio-nome">${nome}</span>`;
  return `    <img class="veio-marca" src="/veio/icones/icone.svg" width="40" height="40" alt="">
    <span class="veio-nome">${nome}<span class="veio-cursor"></span></span>`;
}

const CABECA_DA_CAPA = `<!DOCTYPE html>
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
</head>`;

function capa({ telas, prototipos, temVitrine, temVeio, git }) {
  return `${CABECA_DA_CAPA}
<body>
<main>
  <div class="topo">
${marcaDoTopo(temVeio)}
  </div>
  <h1>Preview do front</h1>
  <p>Como esta branch fica na tela. Publicado pelo Vercel quando a mudança toca o que o preview mostra.</p>

  <h2>O app</h2>
  <ul>
${itemDaLista('/sobre/', 'PerpetualMiner: página inicial do app', 'o que é e o que faz')}
  </ul>

  <h2>Telas da extensão</h2>
  <div class="aviso">Fora do Chrome não existe <code>chrome.*</code>, então o preview injeta um simulador com dados de exemplo: o visual é o de verdade, o conteúdo é inventado e o que depende do navegador (login, atalho, envio ao Anki) não funciona.</div>
  <ul>
${telas.map(itemDaTela).join('\n')}
  </ul>

  <h2>Base Veio</h2>
  <ul>
${itemDaVitrine(temVitrine)}
  </ul>

  <h2>Protótipos travados</h2>
  <ul>
${prototipos.map(itemDoPrototipo).join('\n')}
  </ul>

  <p class="rodape">${git}</p>
</main>
</body>
</html>
`;
}

async function copiarSeExistir(caminho, destinos) {
  const origem = path.join(RAIZ, caminho);
  if (!(await existe(origem))) return false;
  for (const destino of destinos) await copiar(origem, path.join(destino, caminho));
  return true;
}

async function copiarTela(tela) {
  const origem = path.join(RAIZ, tela.arquivo);
  if (!(await existe(origem))) return false;
  const html = await fs.readFile(origem, 'utf8');
  await fs.mkdir(path.dirname(path.join(EXTENSAO, tela.arquivo)), { recursive: true });
  await fs.writeFile(path.join(EXTENSAO, tela.arquivo), injetarSimulador(html));
  return true;
}

async function copiarTelas() {
  const telas = [];
  for (const tela of TELAS) {
    if (await copiarTela(tela)) telas.push(tela);
  }
  return telas;
}

async function copiarArquivosDaExtensao() {
  const daTela = new Set(TELAS.map(tela => tela.arquivo));
  const lerTexto = caminho => fs.readFile(path.join(RAIZ, caminho), 'utf8');
  const arquivos = (await arquivosDaExtensao(lerTexto)).filter(nome => !daTela.has(nome));
  for (const nome of arquivos) await copiarSeExistir(nome, [EXTENSAO]);
}

async function copiarVitrine() {
  const vitrine = path.join(RAIZ, 'e2e', 'vitrine');
  const temVitrine = await existe(path.join(vitrine, 'vitrine.html'));
  if (temVitrine) await copiar(vitrine, DESTINO);
  return temVitrine;
}

async function copiarSite() {
  await fs.mkdir(path.join(DESTINO, 'site'), { recursive: true });
  await fs.copyFile(path.join(RAIZ, 'preview', 'site', 'site.css'), path.join(DESTINO, 'site', 'site.css'));
  for (const { arquivo, enderecos } of PAGINAS_PUBLICAS) {
    for (const endereco of enderecos) {
      await copiar(path.join(RAIZ, 'preview', 'site', arquivo), path.join(DESTINO, endereco, 'index.html'));
    }
  }
}

async function copiarPrototipos() {
  const prototipos = await acharPrototipos();
  if (prototipos.length) await copiar(path.join(RAIZ, 'docs', 'design'), path.join(DESTINO, 'design'));
  return prototipos;
}

const DADOS_DO_GIT = [
  ['VERCEL_GIT_COMMIT_REF', ref => `branch ${ref}`],
  ['VERCEL_GIT_COMMIT_SHA', sha => `commit ${sha.slice(0, 7)}`],
  ['VERCEL_GIT_COMMIT_MESSAGE', mensagem => mensagem.split('\n')[0]],
];

function rodapeDoGit(env) {
  return DADOS_DO_GIT
    .map(([variavel, descrever]) => env[variavel] && descrever(env[variavel]))
    .filter(Boolean).join(' · ') || 'build local';
}

function relatarMontagem({ telas, temVitrine, prototipos }) {
  console.log(`preview montado em ${path.relative(process.cwd(), DESTINO)}`);
  console.log(`  telas: ${telas.map(t => t.arquivo).join(', ') || 'nenhuma'}`);
  console.log(`  vitrine: ${temVitrine ? 'sim' : 'não'} · protótipos: ${prototipos.length}`);
}

async function montar() {
  await fs.rm(DESTINO, { recursive: true, force: true });
  await fs.mkdir(DESTINO, { recursive: true });

  const temVeio = await copiarSeExistir('veio', [DESTINO, EXTENSAO]);
  const telas = await copiarTelas();
  await copiarArquivosDaExtensao();
  for (const pasta of PASTAS_DE_APOIO) await copiarSeExistir(pasta, [EXTENSAO]);
  await copiarSeExistir('lib', [EXTENSAO, DESTINO]);
  await copiar(path.join(RAIZ, 'preview', 'chrome-simulado.js'), path.join(DESTINO, 'preview-chrome-simulado.js'));

  const temVitrine = await copiarVitrine();
  await copiarSite();
  const prototipos = await copiarPrototipos();

  await fs.writeFile(path.join(DESTINO, 'index.html'), capa({ telas, prototipos, temVitrine, temVeio, git: rodapeDoGit(process.env) }));
  relatarMontagem({ telas, temVitrine, prototipos });
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

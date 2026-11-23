'use strict';

const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

require('../lib/arquivos-da-extensao.js');
const { arquivosDaExtensao } = globalThis.PerpetualMiner;

const PEDIDO_RELATIVO = /\b(?:src|href)="([^"#?:]+)"/g;
const PEDIDO_DO_SITE = /\b(?:src|href)="(\/[^"#?]*)"/g;
const PEDIDO_EXTERNO = /\b(?:src|href)="(https?:\/\/[^"]+)"/g;
const PAGINA_SEM_PEDIDOS = 'abridor/ponte.html';

const lerTexto = caminho => fs.readFileSync(caminho, 'utf8');
const existe = (...partes) => fs.existsSync(path.join(...partes));
const pedidosDe = (html, padrao) => [...html.matchAll(padrao)].map(achado => achado[1]);

function montarPreview() {
  const saida = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-preview-'));
  execFileSync('node', ['preview/montar.mjs', '--saida', saida], { stdio: 'pipe' });
  return saida;
}

function conferirQueTudoFoiCopiado(arquivos, extensao) {
  const faltam = arquivos.filter(arquivo => !existe(extensao, arquivo));
  assert.deepStrictEqual(faltam, [], `o preview não copiou: ${faltam.join(', ')}`);
}

function conferirPagina(pagina, saida) {
  const pedidos = pedidosDe(lerTexto(pagina), PEDIDO_RELATIVO).filter(pedido => !pedido.startsWith('//'));
  if (pagina !== PAGINA_SEM_PEDIDOS) assert(pedidos.length > 0, `${pagina}: não achei o que ela carrega`);
  for (const pedido of pedidos) {
    const destino = new URL(pedido, `http://x/extensao/${pagina}`).pathname;
    assert(existe(saida, destino), `${pagina} carrega ${pedido}, que não está no preview`);
  }
}

function conferirPaginasDaExtensao(paginas, saida) {
  assert(paginas.includes('painel/painel.html'), 'a lista da extensão devia ter o painel');
  for (const pagina of paginas) conferirPagina(pagina, saida);
}

function conferirPecasAvulsas(extensao) {
  assert(!fs.existsSync('abridor.html') && existe(extensao, 'abridor', 'ponte.html'), 'a ponte do abridor mora em abridor/, não na raiz');
  assert(existe(extensao, 'conexao', 'perpetualminer.ankiaddon'), 'falta o .ankiaddon no preview');
}

function conferirChromeSimulado(extensao) {
  assert(lerTexto(path.join(extensao, 'painel/painel.html')).includes('/preview-chrome-simulado.js'));
  assert(!lerTexto('painel/painel.html').includes('preview-chrome-simulado'));
}

function conferirPaginaPublica(nome, html, saida) {
  assert(!/<script/i.test(html), `${nome}: página pública sem script`);
  for (const pedido of pedidosDe(html, PEDIDO_DO_SITE)) {
    const alvo = path.join(saida, pedido);
    assert(fs.existsSync(alvo) || existe(alvo, 'index.html'), `${nome} carrega ${pedido}, que não está no site`);
  }
  const fonteDeFora = pedidosDe(html, PEDIDO_EXTERNO).some(url => /fonts\.(googleapis|gstatic)/.test(url));
  assert(!fonteDeFora, `${nome}: fonte de fora`);
}

function conferirSite(saida) {
  assert(!existe(saida, 'privacidade') && !existe(saida, 'privacy'), 'a política mora no repositório do site: o preview não a publica');
  const sobre = lerTexto(path.join(saida, 'sobre', 'index.html'));
  const levaAoSiteDaPolitica = sobre.includes('href="https://perpetualminer.com/privacidade/"') && !sobre.includes('href="/privacidade/"');
  assert(levaAoSiteDaPolitica, 'a página inicial devia levar à política do site, que não está neste preview');
  conferirPaginaPublica('sobre', sobre, saida);
  assert(lerTexto(path.join(saida, 'index.html')).includes('href="/sobre/"'), 'a capa devia levar ao /sobre/');
}

async function conferirPreview() {
  const saida = montarPreview();
  const extensao = path.join(saida, 'extensao');
  const arquivos = await arquivosDaExtensao(async caminho => lerTexto(caminho));
  const paginas = arquivos.filter(arquivo => arquivo.endsWith('.html'));

  conferirQueTudoFoiCopiado(arquivos, extensao);
  conferirPaginasDaExtensao(paginas, saida);
  conferirPecasAvulsas(extensao);
  conferirChromeSimulado(extensao);
  conferirSite(saida);

  fs.rmSync(saida, { recursive: true, force: true });
  console.log(`ok: ${arquivos.length} arquivos da extensão e ${paginas.length} páginas no preview`);
}

conferirPreview().catch(erro => { console.error(erro); process.exit(1); });

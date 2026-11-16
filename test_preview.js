'use strict';

const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

require('./lib/arquivos-da-extensao.js');
const { arquivosDaExtensao } = globalThis.PerpetualMiner;

const saida = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-preview-'));
execFileSync('node', ['preview/montar.mjs', '--saida', saida], { stdio: 'pipe' });
const extensao = path.join(saida, 'extensao');

(async () => {
  const arquivos = await arquivosDaExtensao(async caminho => fs.readFileSync(caminho, 'utf8'));

  const faltam = arquivos.filter(arquivo => !fs.existsSync(path.join(extensao, arquivo)));
  assert.deepStrictEqual(faltam, [], `o preview não copiou: ${faltam.join(', ')}`);

  const paginas = arquivos.filter(arquivo => arquivo.endsWith('.html'));
  assert(paginas.includes('painel.html'), 'a lista da extensão devia ter o painel');
  for (const pagina of paginas) {
    const html = fs.readFileSync(pagina, 'utf8');
    const pedidos = [...html.matchAll(/\b(?:src|href)="([^"#?:]+)"/g)].map(m => m[1]).filter(p => !p.startsWith('//'));
    if (pagina !== 'abridor.html') assert(pedidos.length > 0, `${pagina}: não achei o que ela carrega`);
    for (const pedido of pedidos) {
      assert(fs.existsSync(path.join(extensao, pedido)), `${pagina} carrega ${pedido}, que não está no preview`);
    }
  }

  assert(fs.existsSync(path.join(extensao, 'conexao', 'perpetualminer.ankiaddon')), 'falta o .ankiaddon no preview');

  assert(fs.readFileSync(path.join(extensao, 'painel.html'), 'utf8').includes('/preview-chrome-simulado.js'));
  assert(!fs.readFileSync('painel.html', 'utf8').includes('preview-chrome-simulado'));

  assert(!fs.existsSync(path.join(saida, 'privacidade')) && !fs.existsSync(path.join(saida, 'privacy')), 'a política mora no repositório do site: o preview não a publica');
  const sobre = fs.readFileSync(path.join(saida, 'sobre', 'index.html'), 'utf8');
  assert(sobre.includes('href="https://perpetualminer.com/privacidade/"') && !sobre.includes('href="/privacidade/"'), 'a página inicial devia levar à política do site, que não está neste preview');
  for (const [nome, html] of [['sobre', sobre]]) {
    assert(!/<script/i.test(html), `${nome}: página pública sem script`);
    const pedidos = [...html.matchAll(/\b(?:src|href)="(\/[^"#?]*)"/g)].map(m => m[1]);
    for (const pedido of pedidos) {
      const alvo = path.join(saida, pedido);
      assert(fs.existsSync(alvo) || fs.existsSync(path.join(alvo, 'index.html')), `${nome} carrega ${pedido}, que não está no site`);
    }
    const externos = [...html.matchAll(/\b(?:src|href)="(https?:\/\/[^"]+)"/g)].map(m => m[1]);
    assert(!externos.some(url => /fonts\.(googleapis|gstatic)/.test(url)), `${nome}: fonte de fora`);
  }
  assert(fs.readFileSync(path.join(saida, 'index.html'), 'utf8').includes('href="/sobre/"'), 'a capa devia levar ao /sobre/');

  fs.rmSync(saida, { recursive: true, force: true });
  console.log(`ok: ${arquivos.length} arquivos da extensão e ${paginas.length} páginas no preview`);
})().catch(erro => { console.error(erro); process.exit(1); });

'use strict';

// O preview monta o que as telas da extensão carregam a partir do manifest e das
// páginas, não de uma lista escrita à mão: toda página da extensão chega ao preview com
// cada script, estilo e imagem que ela pede. Roda `preview/montar.mjs` numa pasta
// temporária. `node test_preview.js`. Confere também as páginas públicas do app: `/sobre/` e a
// política de privacidade em `/privacidade/` e `/privacy/`, que o consentimento OAuth do Google pede.

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
    // A ponte do abridor (lib/abridor.js) é vazia de propósito: um quadro escondido que só empresta o `chrome.runtime`.
    if (pagina !== 'abridor.html') assert(pedidos.length > 0, `${pagina}: não achei o que ela carrega`);
    for (const pedido of pedidos) {
      assert(fs.existsSync(path.join(extensao, pedido)), `${pagina} carrega ${pedido}, que não está no preview`);
    }
  }

  // O arquivo da Conexão não está no manifest: o painel o entrega num link.
  assert(fs.existsSync(path.join(extensao, 'conexao', 'perpetualminer.ankiaddon')), 'falta o .ankiaddon no preview');

  assert(fs.readFileSync(path.join(extensao, 'painel.html'), 'utf8').includes('/preview-chrome-simulado.js'));
  assert(!fs.readFileSync('painel.html', 'utf8').includes('preview-chrome-simulado'));

  // As páginas públicas: a política sai nos dois endereços, a página inicial a leva num link, e o que elas
  // carregam (a Veio e a folha do site) está no site, sem nada de fora.
  const privacidade = fs.readFileSync(path.join(saida, 'privacidade', 'index.html'), 'utf8');
  assert.strictEqual(fs.readFileSync(path.join(saida, 'privacy', 'index.html'), 'utf8'), privacidade);
  assert(privacidade.includes('Política de privacidade') && privacidade.includes('Uso limitado'));
  const sobre = fs.readFileSync(path.join(saida, 'sobre', 'index.html'), 'utf8');
  assert(sobre.includes('href="/privacidade/"'), 'a página inicial devia levar à política');
  for (const [nome, html] of [['privacidade', privacidade], ['sobre', sobre]]) {
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

  // Os protótipos soltos (preview/prototipos/), enquanto houver algum: a capa leva a cada um, a página dele só carrega
  // o que está na pasta dele (nada de fora, nada da extensão), e nenhuma página da extensão carrega nada de lá.
  const pastaDosSoltos = path.join('preview', 'prototipos');
  for (const solto of fs.existsSync(pastaDosSoltos) ? fs.readdirSync(pastaDosSoltos) : []) {
    const pasta = path.join(saida, 'prototipos', solto);
    const pagina = fs.readFileSync(path.join(pasta, 'index.html'), 'utf8');
    const pedidos = [...pagina.matchAll(/\b(?:src|href)="([^"#?]+)"/g)].map(m => m[1]).filter(pedido => !pedido.startsWith('data:'));
    assert(pedidos.length > 0, `o protótipo ${solto} devia carregar os arquivos dele`);
    for (const pedido of pedidos) {
      assert(!/^(?:[a-z]+:)?\/\//i.test(pedido) && !pedido.startsWith('/') && !pedido.includes('..'), `o protótipo ${solto} carrega ${pedido}, de fora da pasta dele`);
      assert(fs.existsSync(path.join(pasta, pedido)), `o protótipo ${solto} carrega ${pedido}, que não está na pasta dele`);
    }
    for (const arquivo of fs.readdirSync(pasta).filter(nome => /\.(?:js|css)$/.test(nome))) {
      const fonte = fs.readFileSync(path.join(pasta, arquivo), 'utf8');
      assert(!/https?:\/\/(?!www\.w3\.org\/)[\w.-]+\/[^\s'"`)]*\.(?:js|css|woff2?|png|jpe?g|svg)/i.test(fonte), `${solto}/${arquivo} pede um arquivo de fora`);
      assert(!/\b(?:fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource|localStorage|sessionStorage|indexedDB)\b/.test(fonte), `${solto}/${arquivo} fala com a rede ou guarda algo no navegador`);
    }
    assert(fs.readFileSync(path.join(saida, 'index.html'), 'utf8').includes(`href="/prototipos/${solto}/"`), `a capa devia levar ao protótipo ${solto}`);
  }
  for (const pagina of paginas) {
    assert(!fs.readFileSync(path.join(extensao, pagina), 'utf8').includes('prototipos/'), `${pagina} não devia carregar nada de preview/prototipos`);
  }

  fs.rmSync(saida, { recursive: true, force: true });
  console.log(`ok: ${arquivos.length} arquivos da extensão e ${paginas.length} páginas no preview`);
})().catch(erro => { console.error(erro); process.exit(1); });

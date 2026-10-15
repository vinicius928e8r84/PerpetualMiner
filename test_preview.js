'use strict';

// O preview monta o que as telas da extensão carregam a partir do manifest e das
// páginas, não de uma lista escrita à mão: toda página da extensão chega ao preview com
// cada script, estilo e imagem que ela pede. Roda `preview/montar.mjs` numa pasta
// temporária. `node test_preview.js`.

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

  fs.rmSync(saida, { recursive: true, force: true });
  console.log(`ok: ${arquivos.length} arquivos da extensão e ${paginas.length} páginas no preview`);
})().catch(erro => { console.error(erro); process.exit(1); });

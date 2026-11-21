'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ler = arquivo => fs.readFileSync(path.join(__dirname, '..', arquivo), 'utf8');

{
  const linhas = ler('painel/painel.html').split('\n');
  const juntas = linhas.map((linha, i) => ({ linha, n: i + 1 })).filter(({ linha }) => (linha.match(/<script\b/g) || []).length > 1);
  assert.deepStrictEqual(juntas, [], `painel/painel.html: uma tag <script> por linha (a ordem atual fica); juntas em: ${juntas.map(j => j.n).join(', ')}`);
}

{
  const bloco = /raiz\.PedidoAoAnki = Object\.freeze\(\{\n([\s\S]*?)\n  \}\);/.exec(ler('lib/pedido-ao-anki.js'));
  assert.ok(bloco, 'lib/pedido-ao-anki.js: a lista de exportações de PedidoAoAnki não foi achada');
  const linhas = bloco[1].split('\n');
  const nomes = linhas.map(linha => (/^ {4}([A-Za-z_]\w*),$/.exec(linha) || [])[1]);
  assert.ok(nomes.every(Boolean), `lib/pedido-ao-anki.js: um nome por linha, com vírgula no fim; confira: ${linhas.filter((_, i) => !nomes[i]).join(' | ')}`);
  assert.deepStrictEqual(nomes, [...nomes].sort(), 'lib/pedido-ao-anki.js: as exportações de PedidoAoAnki ficam em ordem alfabética');
}

console.log('ok: listas com um item por linha');

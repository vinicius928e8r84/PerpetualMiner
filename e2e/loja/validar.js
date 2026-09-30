'use strict';

// Confere as imagens de `docs/loja/`: PNG de 24 bits (RGB, 8 bits por canal),
// sem canal alfa nem chunk tRNS, no tamanho que a loja pede.
//
//   node e2e/loja/validar.js

const fs = require('fs');
const path = require('path');

const PASTA = path.resolve(__dirname, '..', '..', 'docs', 'loja');
const ASSINATURA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const RGB = 2;

const ESPERADO = {
  'captura-1.png': [1280, 800],
  'captura-2.png': [1280, 800],
  'captura-3.png': [1280, 800],
  'captura-4.png': [1280, 800],
  'captura-5.png': [1280, 800],
  'promo-pequena-440x280.png': [440, 280],
  'icone-128.png': [128, 128],
};

/** Largura, altura, tipo de cor e se há tRNS, lidos dos chunks do PNG. */
function lerPng(arquivo) {
  const dados = fs.readFileSync(arquivo);
  if (!dados.subarray(0, 8).equals(ASSINATURA)) throw new Error('não é PNG');
  const png = { tRNS: false };
  for (let pos = 8; pos < dados.length;) {
    const tamanho = dados.readUInt32BE(pos);
    const tipo = dados.toString('latin1', pos + 4, pos + 8);
    if (tipo === 'IHDR') {
      Object.assign(png, { largura: dados.readUInt32BE(pos + 8), altura: dados.readUInt32BE(pos + 12), profundidade: dados[pos + 16], tipoDeCor: dados[pos + 17] });
    }
    if (tipo === 'tRNS') png.tRNS = true;
    pos += 12 + tamanho;
  }
  return png;
}

let falhas = 0;
for (const [nome, [largura, altura]] of Object.entries(ESPERADO)) {
  const problemas = [];
  let png = null;
  try { png = lerPng(path.join(PASTA, nome)); } catch (erro) { problemas.push(erro.code === 'ENOENT' ? 'arquivo não existe' : erro.message); }
  if (png) {
    if (png.largura !== largura || png.altura !== altura) problemas.push(`tamanho ${png.largura}x${png.altura}, esperado ${largura}x${altura}`);
    if (png.tipoDeCor !== RGB || png.profundidade !== 8) problemas.push(`tipo de cor ${png.tipoDeCor}/${png.profundidade} bits, esperado RGB de 8 bits (24 bits, sem alfa)`);
    if (png.tRNS) problemas.push('tem transparência (tRNS)');
  }
  if (problemas.length) falhas++;
  console.log(`${problemas.length ? 'FALHOU' : 'ok    '}  ${nome.padEnd(28)} ${png ? `${png.largura}x${png.altura} RGB 24 bits, sem alfa` : ''}${problemas.length ? ` · ${problemas.join('; ')}` : ''}`);
}
process.exit(falhas ? 1 : 0);

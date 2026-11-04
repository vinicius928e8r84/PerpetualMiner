#!/usr/bin/env node
'use strict';

// Gera dist/perpetualminer-<versão>.zip, o pacote que vai para a Chrome Web
// Store: só os arquivos que a extensão usa em execução, sem testes, docs, e2e,
// preview, engine, .git nem node_modules. Sem dependências: o zip é
// escrito aqui mesmo.
//
//   node scripts/empacotar-extensao.mjs [--saida <pasta>]

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const require = createRequire(import.meta.url);
const { arquivosDoPacote, PASTAS_QUE_NAO_SAO_RUNTIME } = require('./arquivos-do-pacote.js');
require('../lib/arquivos-da-extensao.js');
const { arquivosDaExtensao } = globalThis.PerpetualMiner;

async function validarManifesto(manifesto, arquivos) {
  const erros = [];
  if (manifesto.manifest_version !== 3) erros.push('manifest_version deve ser 3');
  if (!manifesto.name || manifesto.name.length > 75) erros.push('name é obrigatório e tem no máximo 75 caracteres');
  if (!manifesto.description || manifesto.description.length > 132) {
    erros.push('description é obrigatória e tem no máximo 132 caracteres');
  }
  if (!/^\d{1,5}(\.\d{1,5}){0,3}$/.test(manifesto.version ?? '')) {
    erros.push('version deve ter de 1 a 4 números separados por ponto (ex.: 5.0.1)');
  }
  if (!manifesto.icons?.['128']) erros.push('falta o ícone de 128 px em icons');

  const noPacote = new Set(arquivos);
  const lerTexto = async caminho => fs.readFileSync(path.join(RAIZ, caminho), 'utf8');
  for (const arquivo of await arquivosDaExtensao(lerTexto)) {
    if (!noPacote.has(arquivo)) erros.push(`referenciado mas fora do pacote (ou inexistente): ${arquivo}`);
  }
  for (const arquivo of arquivos) {
    if (PASTAS_QUE_NAO_SAO_RUNTIME.includes(arquivo.split('/')[0])) erros.push(`não é de runtime: ${arquivo}`);
  }
  return erros;
}

const TABELA_CRC = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) c = TABELA_CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function campoDoZip(deslocamento, bytes, valor) {
  return { deslocamento, bytes, valor };
}

function cabecalho(tamanho, campos) {
  const buffer = Buffer.alloc(tamanho);
  for (const { deslocamento, bytes, valor } of campos) {
    if (bytes === 4) buffer.writeUInt32LE(valor, deslocamento);
    else buffer.writeUInt16LE(valor, deslocamento);
  }
  return buffer;
}

// O manifest do repositório leva `key` (fixa o ID da extensão carregada da
// pasta no mesmo ID do item da loja); o do zip não, porque a loja atribui a
// chave dela e pode recusar o campo. Tira só a linha, para o resto do arquivo
// sair idêntico.
function manifestoSemChave(texto) {
  const semChave = texto.replace(/^[ \t]*"key"[ \t]*:[ \t]*"[^"\n]*",?[ \t]*\r?\n/m, '');
  if ('key' in JSON.parse(semChave)) throw new Error('não consegui tirar "key" do manifest do pacote');
  return Buffer.from(semChave, 'utf8');
}

function lerParaOZip(arquivo) {
  const bytes = fs.readFileSync(path.join(RAIZ, arquivo));
  return arquivo === 'manifest.json' ? manifestoSemChave(bytes.toString('utf8')) : bytes;
}

function montarZip(arquivos) {
  const HORA_DOS_REPRODUZIVEL = 0;
  const DATA_DOS_2020_01_01 = ((2020 - 1980) << 9) | (1 << 5) | 1;
  const partes = [];
  const diretorio = [];
  let deslocamento = 0;

  for (const arquivo of arquivos) {
    const nome = Buffer.from(arquivo, 'utf8');
    const conteudo = lerParaOZip(arquivo);
    const comprimido = zlib.deflateRawSync(conteudo, { level: 9 });
    const crc = crc32(conteudo);

    const local = cabecalho(30, [
      campoDoZip(0, 4, 0x04034b50), campoDoZip(4, 2, 20), campoDoZip(6, 2, 0x0800), campoDoZip(8, 2, 8), campoDoZip(10, 2, HORA_DOS_REPRODUZIVEL), campoDoZip(12, 2, DATA_DOS_2020_01_01),
      campoDoZip(14, 4, crc), campoDoZip(18, 4, comprimido.length), campoDoZip(22, 4, conteudo.length), campoDoZip(26, 2, nome.length),
    ]);
    partes.push(local, nome, comprimido);

    const central = cabecalho(46, [
      campoDoZip(0, 4, 0x02014b50), campoDoZip(4, 2, 20), campoDoZip(6, 2, 20), campoDoZip(8, 2, 0x0800), campoDoZip(10, 2, 8), campoDoZip(12, 2, HORA_DOS_REPRODUZIVEL), campoDoZip(14, 2, DATA_DOS_2020_01_01),
      campoDoZip(16, 4, crc), campoDoZip(20, 4, comprimido.length), campoDoZip(24, 4, conteudo.length), campoDoZip(28, 2, nome.length),
      campoDoZip(42, 4, deslocamento),
    ]);
    diretorio.push(central, nome);

    deslocamento += local.length + nome.length + comprimido.length;
  }

  const tamanhoDoDiretorio = diretorio.reduce((soma, parte) => soma + parte.length, 0);
  const fim = cabecalho(22, [
    campoDoZip(0, 4, 0x06054b50), campoDoZip(8, 2, arquivos.length), campoDoZip(10, 2, arquivos.length),
    campoDoZip(12, 4, tamanhoDoDiretorio), campoDoZip(16, 4, deslocamento),
  ]);
  return Buffer.concat([...partes, ...diretorio, fim]);
}

function pastaDeSaida() {
  const i = process.argv.indexOf('--saida');
  return i === -1 ? path.join(RAIZ, 'dist') : path.resolve(process.argv[i + 1]);
}

function formatarTamanho(bytes) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

const manifesto = JSON.parse(fs.readFileSync(path.join(RAIZ, 'manifest.json'), 'utf8'));
const arquivos = arquivosDoPacote(RAIZ);
const erros = await validarManifesto(manifesto, arquivos);
if (erros.length) {
  console.error('Manifest inválido para a loja:');
  for (const erro of erros) console.error(`  - ${erro}`);
  process.exit(1);
}

const saida = pastaDeSaida();
fs.mkdirSync(saida, { recursive: true });
const destino = path.join(saida, `perpetualminer-${manifesto.version}.zip`);
const zip = montarZip(arquivos);
fs.writeFileSync(destino, zip);

console.log(`${manifesto.name} ${manifesto.version}: ${arquivos.length} arquivos`);
for (const arquivo of arquivos) console.log(`  ${arquivo}`);
console.log(`\n${destino}\n${formatarTamanho(zip.length)}`);

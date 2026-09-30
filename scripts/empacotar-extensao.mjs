#!/usr/bin/env node
'use strict';

// Gera dist/perpetualminer-<versão>.zip, o pacote que vai para a Chrome Web
// Store: só os arquivos que a extensão usa em execução, sem testes, docs, e2e,
// preview, bridge, engine, .git nem node_modules. Sem dependências: o zip é
// escrito aqui mesmo.
//
//   node scripts/empacotar-extensao.mjs [--saida <pasta>]

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Na raiz entram os .js/.html/.css da extensão (menos os test_*.js); das pastas
// entram só as de runtime. `lib/firebase/` fica de fora: nenhuma página carrega
// esses bundles, e código minificado sem uso só atrai pergunta na revisão.
const PASTAS_DE_RUNTIME = ['lib', 'veio'];
const FORA_DO_PACOTE = [/^lib\/firebase\//, /^veio\/README\.md$/, /^test_.*\.js$/];

function listar(pasta, prefixo = '') {
  return fs.readdirSync(path.join(RAIZ, pasta), { withFileTypes: true }).flatMap(entrada => {
    const relativo = prefixo + entrada.name;
    return entrada.isDirectory() ? listar(path.join(pasta, entrada.name), `${relativo}/`) : [relativo];
  });
}

function arquivosDoPacote() {
  const naRaiz = fs.readdirSync(RAIZ, { withFileTypes: true })
    .filter(e => e.isFile() && /\.(js|html|css)$/.test(e.name))
    .map(e => e.name);
  const dasPastas = PASTAS_DE_RUNTIME.flatMap(pasta => listar(pasta, `${pasta}/`));
  return [...naRaiz, 'manifest.json', ...dasPastas]
    .filter(arquivo => !FORA_DO_PACOTE.some(regra => regra.test(arquivo)))
    .sort();
}

// Os arquivos que o manifest, as páginas e o service worker apontam, para
// conferir que nenhum ficou de fora do pacote.
function referenciados(manifesto) {
  const lidos = new Set(['manifest.json']);
  const paginas = [];
  const ler = caminho => fs.readFileSync(path.join(RAIZ, caminho), 'utf8');

  const servico = manifesto.background?.service_worker;
  if (servico) {
    lidos.add(servico);
    for (const [, lista] of ler(servico).matchAll(/importScripts\(([^)]*)\)/g)) {
      for (const [, arquivo] of lista.matchAll(/'([^']+)'/g)) lidos.add(arquivo);
    }
  }
  for (const script of manifesto.content_scripts ?? []) {
    for (const arquivo of [...(script.js ?? []), ...(script.css ?? [])]) lidos.add(arquivo);
  }
  if (manifesto.action?.default_popup) paginas.push(manifesto.action.default_popup);
  for (const icone of Object.values({ ...manifesto.icons, ...manifesto.action?.default_icon })) lidos.add(icone);
  for (const grupo of manifesto.web_accessible_resources ?? []) {
    for (const recurso of grupo.resources) {
      if (recurso.includes('*')) continue;
      lidos.add(recurso);
      if (recurso.endsWith('.html')) paginas.push(recurso);
    }
  }
  for (const pagina of paginas) {
    lidos.add(pagina);
    for (const [, valor] of ler(pagina).matchAll(/\b(?:src|href)="([^"#?]+)"/g)) {
      if (!/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(valor)) lidos.add(valor);
    }
  }
  return [...lidos];
}

function validarManifesto(manifesto, arquivos) {
  const erros = [];
  if (manifesto.manifest_version !== 3) erros.push('manifest_version deve ser 3');
  if (!manifesto.name || manifesto.name.length > 75) erros.push('name é obrigatório e tem no máximo 75 caracteres');
  if (!manifesto.description || manifesto.description.length > 132) {
    erros.push('description é obrigatória e tem no máximo 132 caracteres');
  }
  if (!/^\d{1,5}(\.\d{1,5}){0,3}$/.test(manifesto.version ?? '')) {
    erros.push('version deve ter de 1 a 4 números separados por ponto (ex.: 5.0.1)');
  }
  if (manifesto.key) erros.push('o manifest não pode ter "key" no pacote da loja (a loja escolhe o ID)');
  if (!manifesto.icons?.['128']) erros.push('falta o ícone de 128 px em icons');

  const noPacote = new Set(arquivos);
  for (const arquivo of referenciados(manifesto)) {
    if (!noPacote.has(arquivo)) erros.push(`referenciado mas fora do pacote (ou inexistente): ${arquivo}`);
  }
  return erros;
}

// ─── zip (store + deflate, o bastante para a loja) ────────────────────────────

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

function montarZip(arquivos) {
  // Data fixa (2020-01-01): o mesmo conteúdo gera o mesmo zip.
  const hora = 0;
  const data = ((2020 - 1980) << 9) | (1 << 5) | 1;
  const partes = [];
  const diretorio = [];
  let deslocamento = 0;

  for (const arquivo of arquivos) {
    const nome = Buffer.from(arquivo, 'utf8');
    const conteudo = fs.readFileSync(path.join(RAIZ, arquivo));
    const comprimido = zlib.deflateRawSync(conteudo, { level: 9 });
    const crc = crc32(conteudo);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // nomes em UTF-8
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(hora, 10);
    local.writeUInt16LE(data, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(conteudo.length, 22);
    local.writeUInt16LE(nome.length, 26);
    partes.push(local, nome, comprimido);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(hora, 12);
    central.writeUInt16LE(data, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comprimido.length, 20);
    central.writeUInt32LE(conteudo.length, 24);
    central.writeUInt16LE(nome.length, 28);
    central.writeUInt32LE(deslocamento, 42);
    diretorio.push(central, nome);

    deslocamento += local.length + nome.length + comprimido.length;
  }

  const tamanhoDoDiretorio = diretorio.reduce((soma, parte) => soma + parte.length, 0);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(arquivos.length, 8);
  fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(tamanhoDoDiretorio, 12);
  fim.writeUInt32LE(deslocamento, 16);
  return Buffer.concat([...partes, ...diretorio, fim]);
}

// ─── execução ─────────────────────────────────────────────────────────────────

function pastaDeSaida() {
  const i = process.argv.indexOf('--saida');
  return i === -1 ? path.join(RAIZ, 'dist') : path.resolve(process.argv[i + 1]);
}

function formatarTamanho(bytes) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

const manifesto = JSON.parse(fs.readFileSync(path.join(RAIZ, 'manifest.json'), 'utf8'));
const arquivos = arquivosDoPacote();
const erros = validarManifesto(manifesto, arquivos);
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

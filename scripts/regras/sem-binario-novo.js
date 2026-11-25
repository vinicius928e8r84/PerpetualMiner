'use strict';

const fs = require('fs');
const path = require('path');
const { arquivoCriado } = require('./apoio-linhas-novas');

const id = 'sem-binario-novo';

const conserto = 'Não suba o binário. O que se gera (pacote, build, banco, cache, log) fica fora do repositório (.gitignore) e nasce de um script; '
  + 'uma dependência entra por package.json ou requirements.txt, não por um arquivo compilado. Uma imagem ou fonte do produto só entra '
  + 'nas pastas de PERMITIDOS em scripts/regras/sem-binario-novo.js, e uma referência visual ainda precisa da aprovação do dono '
  + '(aprovacao-visual). Se a pasta nova é legítima, acrescente-a à lista com o motivo no corpo da PR.';

const PERMITIDOS = [
  /^e2e\/tests\/[^/]+-snapshots\/[^/]+\.png$/,
  /^e2e\/pages\/[^/]+\.png$/,
  /^docs\/(?:assets|loja|design\/identidade-veio\/assets)\/[^/]+\.(?:png|webp)$/,
  /^veio\/icones\/[^/]+\.png$/,
  /^veio\/fontes\/[^/]+\.woff2$/,
  /^conexao\/perpetualminer\.ankiaddon$/,
];

const EXTENSOES_PROIBIDAS = new Set(['dmg', 'exe', 'msi', 'zip', 'tgz', 'gz', 'bz2', 'xz', '7z', 'rar', 'deb', 'rpm', 'pkg', 'appimage', 'tar',
  'iso', 'img', 'apk', 'ipa', 'jar', 'asar', 'dll', 'so', 'dylib', 'node', 'pyc', 'sqlite', 'db', 'crx', 'xpi']);

const LIXO = /(?:^|\/)(?:\.DS_Store|Thumbs\.db|node_modules\/.*)$|\.(?:bak|orig|rej|swp|log)$|~$|\.bak[-.][^/]*$|\.antes-[^/]*$/;

const ASSINATURAS = [
  ['executável Windows (MZ)', [0x4d, 0x5a]],
  ['executável Linux (ELF)', [0x7f, 0x45, 0x4c, 0x46]],
  ['Mach-O', [0xcf, 0xfa, 0xed, 0xfe]],
  ['Mach-O', [0xce, 0xfa, 0xed, 0xfe]],
  ['Mach-O universal', [0xca, 0xfe, 0xba, 0xbe]],
  ['arquivo ZIP', [0x50, 0x4b, 0x03, 0x04]],
  ['arquivo gzip', [0x1f, 0x8b]],
  ['pacote ar', [0x21, 0x3c, 0x61, 0x72, 0x63, 0x68, 0x3e]],
];

const TAMANHO_MAXIMO = 8 * 1024 * 1024;
const BYTES_LIDOS = 8000;

const seAplica = () => true;

function inicioDoArquivo(caminho) {
  const descritor = fs.openSync(caminho, 'r');
  try {
    const buffer = Buffer.alloc(BYTES_LIDOS);
    return buffer.subarray(0, fs.readSync(descritor, buffer, 0, BYTES_LIDOS, 0));
  } finally {
    fs.closeSync(descritor);
  }
}

const comecaCom = (inicio, bytes) => bytes.every((byte, i) => inicio[i] === byte);

function motivoDoBinario(arquivo, inicio) {
  const extensao = path.extname(arquivo).slice(1).toLowerCase();
  if (EXTENSOES_PROIBIDAS.has(extensao)) return `extensão .${extensao}`;
  const assinatura = ASSINATURAS.find(([, bytes]) => comecaCom(inicio, bytes));
  if (assinatura) return assinatura[0];
  return inicio.includes(0) ? 'conteúdo binário' : null;
}

function motivoDoArquivo(arquivo, caminho) {
  if (LIXO.test(arquivo)) return 'lixo de máquina ou de editor';
  if (fs.statSync(caminho).size > TAMANHO_MAXIMO) return `mais de ${TAMANHO_MAXIMO / 1024 / 1024} MB`;
  return motivoDoBinario(arquivo, inicioDoArquivo(caminho));
}

function verificar(arquivo, fonte, raiz, base) {
  if (PERMITIDOS.some(permitido => permitido.test(arquivo)) || !arquivoCriado(arquivo, raiz, base)) return [];
  const motivo = motivoDoArquivo(arquivo, path.join(raiz, arquivo));
  return motivo ? [{ linha: 1, detalhe: `arquivo novo que não deve entrar no repositório: ${motivo}` }] : [];
}

module.exports = { id, conserto, seAplica, verificar, PERMITIDOS };

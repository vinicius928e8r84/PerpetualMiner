'use strict';

// O pacote da loja leva só o que a extensão usa em execução.

const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const path = require('path');

const { PASTAS_QUE_NAO_SAO_RUNTIME } = require('./scripts/arquivos-do-pacote.js');

const saida = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-pacote-'));
const versao = JSON.parse(fs.readFileSync('manifest.json', 'utf8')).version;
const texto = execFileSync('node', ['scripts/empacotar-extensao.mjs', '--saida', saida], { encoding: 'utf8' });
const arquivos = texto.split('\n').filter(l => l.startsWith('  ')).map(l => l.trim());

for (const esperado of ['manifest.json', 'background.js', 'lib/auto-recarregar.js', 'lib/arquivos-da-extensao.js', 'painel.html', 'veio/tokens.css']) {
  assert(arquivos.includes(esperado), `falta ${esperado} no pacote`);
}
for (const arquivo of arquivos) {
  assert(!PASTAS_QUE_NAO_SAO_RUNTIME.includes(arquivo.split('/')[0]), `não devia entrar: ${arquivo}`);
  assert(!/^test_.*\.js$/.test(arquivo), `teste no pacote: ${arquivo}`);
  assert(!arquivo.startsWith('lib/firebase/'), `bundle sem uso no pacote: ${arquivo}`);
}

const zip = fs.readFileSync(path.join(saida, `perpetualminer-${versao}.zip`));
assert.strictEqual(zip.readUInt32LE(0), 0x04034b50, 'o arquivo não começa como um zip');
assert.strictEqual(zip.readUInt16LE(zip.length - 22 + 10), arquivos.length, 'o zip não tem todos os arquivos listados');

// O manifest do repositório tem `key` (fixa o ID da extensão carregada da pasta;
// o ID em si é conferido em e2e/tests/id-fixo.spec.js) e o zip da loja não tem.
function lerDoZip(bytes, nome) {
  const fim = bytes.length - 22;
  const total = bytes.readUInt16LE(fim + 10);
  let posicao = bytes.readUInt32LE(fim + 16);
  for (let i = 0; i < total; i++) {
    const tamanhoDoNome = bytes.readUInt16LE(posicao + 28);
    const arquivo = bytes.toString('utf8', posicao + 46, posicao + 46 + tamanhoDoNome);
    if (arquivo === nome) {
      const local = bytes.readUInt32LE(posicao + 42);
      const comprimido = bytes.readUInt32LE(posicao + 20);
      const inicio = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
      return zlib.inflateRawSync(bytes.subarray(inicio, inicio + comprimido)).toString('utf8');
    }
    posicao += 46 + tamanhoDoNome + bytes.readUInt16LE(posicao + 30) + bytes.readUInt16LE(posicao + 32);
  }
  throw new Error(`${nome} não está no zip`);
}

const manifestoDoRepo = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
assert(manifestoDoRepo.key, 'o manifest do repositório precisa da "key" que fixa o ID');

const manifestoDoZip = JSON.parse(lerDoZip(zip, 'manifest.json'));
assert(!('key' in manifestoDoZip), 'o manifest dentro do zip não pode ter "key"');
const { key, ...restoDoRepo } = manifestoDoRepo;
assert.deepStrictEqual(manifestoDoZip, restoDoRepo, 'o manifest do zip só pode diferir pela "key"');

// Todo host declarado tem justificativa em docs/publicar-chrome-web-store.md.
// Os do Firebase (`*.firebaseio.com`, `*.firebaseapp.com`) nunca foram chamados
// por nenhum código e saíram do manifest; quem precisar de um host novo o
// acrescenta aqui junto com a justificativa da loja.
const HOSTS_JUSTIFICADOS = [
  'http://127.0.0.1:8766/*',
  'http://localhost:8766/*',
  'https://generativelanguage.googleapis.com/*',
  'https://firestore.googleapis.com/*',
  'https://www.googleapis.com/*',
  'https://securetoken.googleapis.com/*',
  'https://identitytoolkit.googleapis.com/*',
];
const hostsDeclarados = manifestoDoRepo.host_permissions;
for (const host of ['https://*.firebaseio.com/*', 'https://*.firebaseapp.com/*']) {
  assert(!hostsDeclarados.includes(host), `host sem uso no manifest: ${host}`);
}
for (const host of hostsDeclarados) {
  assert(HOSTS_JUSTIFICADOS.includes(host), `host sem justificativa conhecida: ${host}`);
}
assert.deepStrictEqual(manifestoDoZip.host_permissions, hostsDeclarados, 'o zip declara outros hosts que o repositório');
const justificativas = fs.readFileSync('docs/publicar-chrome-web-store.md', 'utf8');
for (const host of hostsDeclarados) {
  assert(justificativas.includes(`\`${host}\``), `falta a justificativa de ${host} em docs/publicar-chrome-web-store.md`);
}

fs.rmSync(saida, { recursive: true, force: true });
console.log('empacotar tests passed');

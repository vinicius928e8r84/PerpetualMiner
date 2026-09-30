'use strict';

// O pacote da loja leva só o que a extensão usa em execução.

const assert = require('assert');
const { execFileSync } = require('child_process');
const crypto = require('crypto');
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

// O ID fixo: o manifest do repositório tem `key` (o Chrome e o Opera carregam a
// pasta com o mesmo ID do item da loja) e o zip da loja não tem.
const ID_DA_LOJA = 'ohpoogiccjmdgilgegholdidgfhjkadf';

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

function idDaChave(chave) {
  const hex = crypto.createHash('sha256').update(Buffer.from(chave, 'base64')).digest('hex').slice(0, 32);
  return [...hex].map(c => String.fromCharCode(97 + parseInt(c, 16))).join('');
}

const textoDoRepo = fs.readFileSync('manifest.json', 'utf8');
const manifestoDoRepo = JSON.parse(textoDoRepo);
assert(manifestoDoRepo.key, 'o manifest do repositório precisa da "key" que fixa o ID');
assert(/^[A-Za-z0-9+/]+=*$/.test(manifestoDoRepo.key), '"key" deve ser a chave em uma linha, sem cabeçalho PEM');
assert.strictEqual(idDaChave(manifestoDoRepo.key), ID_DA_LOJA, 'a "key" não gera o ID do item da loja');
crypto.createPublicKey({ key: Buffer.from(manifestoDoRepo.key, 'base64'), format: 'der', type: 'spki' });

const textoDoZip = lerDoZip(zip, 'manifest.json');
const manifestoDoZip = JSON.parse(textoDoZip);
assert(!('key' in manifestoDoZip), 'o manifest dentro do zip não pode ter "key"');
const { key, ...restoDoRepo } = manifestoDoRepo;
assert.deepStrictEqual(manifestoDoZip, restoDoRepo, 'o manifest do zip só pode diferir pela "key"');
assert.strictEqual(textoDoZip, textoDoRepo.replace(/^ *"key":.*\n/m, ''), 'o manifest do zip mudou além da linha da "key"');

// O scan dos arquivos referenciados (usado pelo auto-recarregar e pelo pacote)
// continua achando os mesmos arquivos com o campo novo.
require('./lib/arquivos-da-extensao.js');
(async () => {
  const lerTexto = async caminho => fs.readFileSync(caminho, 'utf8');
  const referenciados = await globalThis.PerpetualMiner.arquivosDaExtensao(lerTexto);
  assert(referenciados.includes('background.js') && referenciados.includes('painel.html'), 'o scan não achou os arquivos do manifest');
  for (const arquivo of referenciados) {
    assert(fs.existsSync(arquivo), `referenciado e inexistente: ${arquivo}`);
    assert(arquivos.includes(arquivo), `referenciado e fora do pacote: ${arquivo}`);
  }
  assert.strictEqual(manifestoDoRepo.manifest_version, 3);
  fs.rmSync(saida, { recursive: true, force: true });
  console.log('empacotar tests passed');
})();

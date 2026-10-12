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
}

const zip = fs.readFileSync(path.join(saida, `perpetualminer-${versao}.zip`));
assert.strictEqual(zip.readUInt32LE(0), 0x04034b50, 'o arquivo não começa como um zip');
assert.strictEqual(zip.readUInt16LE(zip.length - 22 + 10), arquivos.length, 'o zip não tem todos os arquivos listados');

// O manifest do repositório tem `key` (fixa o ID da extensão carregada da pasta;
// o ID em si é conferido em e2e/tests/id-fixo.spec.js) e o zip da loja não tem.
function lerBytesDoZip(bytes, nome) {
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
      return zlib.inflateRawSync(bytes.subarray(inicio, inicio + comprimido));
    }
    posicao += 46 + tamanhoDoNome + bytes.readUInt16LE(posicao + 30) + bytes.readUInt16LE(posicao + 32);
  }
  throw new Error(`${nome} não está no zip`);
}

const lerDoZip = (bytes, nome) => lerBytesDoZip(bytes, nome).toString('utf8');

const manifestoDoRepo = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
assert(manifestoDoRepo.key, 'o manifest do repositório precisa da "key" que fixa o ID');

const manifestoDoZip = JSON.parse(lerDoZip(zip, 'manifest.json'));
assert(!('key' in manifestoDoZip), 'o manifest dentro do zip não pode ter "key"');
const { key, ...restoDoRepo } = manifestoDoRepo;
assert.deepStrictEqual(manifestoDoZip, restoDoRepo, 'o manifest do zip só pode diferir pela "key"');

// A Conexão com o Anki chega ao Anki por um arquivo que a extensão entrega num link de download:
// o `.ankiaddon` vai dentro do pacote da loja, igual ao do repositório, e é um complemento que o Anki instala
// (`manifest.json` na raiz, com o `package` e o nome, e o código ao lado).
const ARQUIVO_DA_CONEXAO = 'conexao/perpetualminer.ankiaddon';
assert(arquivos.includes(ARQUIVO_DA_CONEXAO), `falta ${ARQUIVO_DA_CONEXAO} no pacote da loja`);
const arquivoDaConexao = lerBytesDoZip(zip, ARQUIVO_DA_CONEXAO);
assert(arquivoDaConexao.equals(fs.readFileSync(ARQUIVO_DA_CONEXAO)), 'o .ankiaddon do pacote difere do do repositório');
const manifestoDoComplemento = JSON.parse(lerBytesDoZip(arquivoDaConexao, 'manifest.json').toString('utf8'));
assert.strictEqual(manifestoDoComplemento.name, 'PerpetualMiner');
assert(manifestoDoComplemento.package, 'o manifesto do .ankiaddon precisa do `package`');
assert(lerBytesDoZip(arquivoDaConexao, '__init__.py').length > 0, 'o .ankiaddon não leva o código do complemento');

// O guia da loja é a fonte única dos hosts: o bloco "Host permission use" cita,
// entre crases, exatamente os hosts do manifest (nem a mais, nem a menos).
const guiaDaLoja = fs.readFileSync('docs/publicar-chrome-web-store.md', 'utf8');
const bloco = guiaDaLoja.match(/\*\*Campo "Host permission use"\*\*[^\n]*\n\n(> [^\n]*)/);
assert(bloco, 'falta o bloco "Host permission use" em docs/publicar-chrome-web-store.md');
const hostsDoBloco = [...bloco[1].matchAll(/`(https?:\/\/[^`]+)`/g)].map(m => m[1]);
assert.deepStrictEqual(
  [...hostsDoBloco].sort(),
  [...manifestoDoRepo.host_permissions].sort(),
  'os hosts do bloco "Host permission use" do guia da loja diferem dos do manifest'
);

// “Abrir o Anki sozinho” (#147): o abridor é chamado por Native Messaging, e `nativeMessaging` é uma
// permissão com aviso. Obrigatória, ela desativaria a extensão de quem já instalou até a pessoa aceitar o
// aviso novo; opcional, ela só é pedida quando a pessoa aperta Permitir abrir o Anki.
for (const [onde, manifesto] of [['do repositório', manifestoDoRepo], ['do zip', manifestoDoZip]]) {
  assert(!(manifesto.permissions || []).includes('nativeMessaging'),
    `o manifest ${onde} pede nativeMessaging como obrigatória: a extensão de quem já instalou seria desativada`);
  assert.deepStrictEqual(manifesto.optional_permissions, ['nativeMessaging'],
    `o manifest ${onde} tem de pedir nativeMessaging como permissão opcional, e só ela`);
}
assert(/\| `nativeMessaging` \(opcional\) \|/.test(guiaDaLoja),
  'falta a justificativa de `nativeMessaging` (opcional) na tabela de permissões de docs/publicar-chrome-web-store.md');

fs.rmSync(saida, { recursive: true, force: true });
console.log('empacotar tests passed');

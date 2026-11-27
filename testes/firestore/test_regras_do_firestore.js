'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { casosDasRegras, documento } = require('./casos-das-regras.js');

const RAIZ = path.resolve(__dirname, '..', '..');
const ARQUIVO_DE_REGRAS = path.join(RAIZ, 'docs', 'seguranca', 'firestore.rules');
const ARQUIVO_DO_RANKING = path.join(RAIZ, 'docs', 'seguranca', 'ranking-do-grupo.rules');
const JAR = { versao: '1.22.0', sha256: '9b6498b7f62714d67f48f59b3818883cd682dbcd46b9f59511de81c97bb5166c' };
const URL_DO_JAR = `https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v${JAR.versao}.jar`;
const PROJETO = 'demo-perpetualminer';

const sha256 = arquivo => crypto.createHash('sha256').update(fs.readFileSync(arquivo)).digest('hex');

async function acharOJar() {
  const candidatos = [process.env.PM_FIRESTORE_JAR, path.join(os.homedir(), '.cache', 'firebase', 'emulators', `cloud-firestore-emulator-v${JAR.versao}.jar`)].filter(Boolean);
  for (const candidato of candidatos) if (fs.existsSync(candidato) && sha256(candidato) === JAR.sha256) return candidato;
  const destino = path.join(os.tmpdir(), `pm-firestore-emulator-v${JAR.versao}.jar`);
  if (!fs.existsSync(destino) || sha256(destino) !== JAR.sha256) {
    const resposta = await fetch(URL_DO_JAR);
    assert.strictEqual(resposta.status, 200, `não baixei o emulador do Firestore (${URL_DO_JAR}): ${resposta.status}`);
    fs.writeFileSync(destino, Buffer.from(await resposta.arrayBuffer()));
  }
  assert.strictEqual(sha256(destino), JAR.sha256, 'o jar do emulador baixado não tem o SHA-256 esperado');
  return destino;
}

const portaLivre = () => new Promise((resolve, reject) => {
  const servidor = net.createServer();
  servidor.listen(0, '127.0.0.1', () => {
    const { port } = servidor.address();
    servidor.close(() => resolve(port));
  });
  servidor.on('error', reject);
});

async function ligarOEmulador() {
  const porta = await portaLivre();
  const java = process.env.PM_JAVA || 'java';
  const processo = spawn(java, ['-jar', await acharOJar(), '--host=127.0.0.1', `--port=${porta}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  let saida = '';
  processo.stdout.on('data', trecho => { saida += trecho; });
  processo.stderr.on('data', trecho => { saida += trecho; });
  let morreu = null;
  processo.on('exit', codigo => { morreu = codigo; });
  processo.on('error', erro => { morreu = erro.message; });
  const base = `http://127.0.0.1:${porta}`;
  for (let tentativa = 0; tentativa < 150; tentativa += 1) {
    if (morreu !== null) assert.fail(`o emulador do Firestore não subiu (${morreu}); precisa de Java 11+ (PM_JAVA). Saída:\n${saida.slice(-600)}`);
    if (await fetch(base).then(() => true, () => false)) return { base, processo };
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  processo.kill();
  return assert.fail(`o emulador do Firestore não respondeu a tempo. Saída:\n${saida.slice(-600)}`);
}

const jwt = uid => `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({ user_id: uid, sub: uid })).toString('base64url')}.`;
const CONSULTA_DO_RANKING = { structuredQuery: { from: [{ collectionId: 'ranking' }], where: { fieldFilter: { field: { fieldPath: 'topou' }, op: 'EQUAL', value: { booleanValue: true } } }, limit: 1 } };

function pedidoDoCaso(raiz, [, , quem, metodo, caminho, corpo]) {
  const cabecalho = { 'Content-Type': 'application/json', ...(quem ? { Authorization: `Bearer ${jwt(quem)}` } : {}) };
  if (metodo === 'CONSULTA') return [`${raiz}:runQuery`, { method: 'POST', headers: cabecalho, body: JSON.stringify(CONSULTA_DO_RANKING) }];
  return [`${raiz}/${caminho}`, { method: metodo, headers: cabecalho, body: corpo ? JSON.stringify(corpo) : undefined }];
}

async function carregarAsRegras(base) {
  const regras = fs.readFileSync(ARQUIVO_DE_REGRAS, 'utf8');
  const carga = await fetch(`${base}/emulator/v1/projects/${PROJETO}:securityRules`, { method: 'PUT', body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: regras }] } }) });
  assert.strictEqual(carga.status, 200, `o emulador recusou as regras: ${await carga.text()}`);
}

async function rodarOsCasos(base) {
  const raiz = `${base}/v1/projects/${PROJETO}/databases/(default)/documents`;
  const falhas = [];
  for (const caso of casosDasRegras()) {
    const resposta = await fetch(...pedidoDoCaso(raiz, caso));
    if (resposta.status !== caso[1]) falhas.push(`${caso[0]}: esperado ${caso[1]}, veio ${resposta.status}`);
  }
  assert.deepStrictEqual(falhas, [], `as regras não se comportam como o esperado:\n${falhas.join('\n')}`);
  const dono = await fetch(`${raiz}/usuarios/ana/frases/f1`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify(documento({ id: 'f1' })) });
  assert.strictEqual(dono.status, 200);
  return casosDasRegras().length + 1;
}

async function principal() {
  const { base, processo } = await ligarOEmulador();
  try {
    await carregarAsRegras(base);
    return await rodarOsCasos(base);
  } finally {
    processo.kill();
  }
}

function blocoDoRanking(texto) {
  const comeco = texto.indexOf('match /ranking/{docId} {');
  assert.ok(comeco >= 0, 'falta o match /ranking/{docId}');
  let fundo = 0;
  for (let i = texto.indexOf('{', comeco); i < texto.length; i += 1) {
    if (texto[i] === '{') fundo += 1;
    if (texto[i] === '}') fundo -= 1;
    if (fundo === 0) return texto.slice(comeco, i + 1);
  }
  return assert.fail('o match /ranking/{docId} não fecha');
}

assert.strictEqual(blocoDoRanking(fs.readFileSync(ARQUIVO_DO_RANKING, 'utf8')), blocoDoRanking(fs.readFileSync(ARQUIVO_DE_REGRAS, 'utf8')), 'o match /ranking de ranking-do-grupo.rules difere o de firestore.rules');

principal().then(total => console.log(`regras do Firestore (emulador): ${total + 1} provas passaram`), erro => {
  console.error(erro.stack || erro);
  process.exit(1);
});

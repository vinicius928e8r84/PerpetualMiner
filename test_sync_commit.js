'use strict';

const { criarSessao, nuvemHttp } = require('./lib/sincronizacao.js');

const DOCS = 'https://firestore.googleapis.com/v1/projects/perpetualminer-4c219/databases/(default)/documents';
const RECUSA_DAS_REGRAS = { status: 403, corpo: { error: { status: 'PERMISSION_DENIED', message: 'Missing or insufficient permissions.' } } };

let falhas = 0;
function assert(condicao, rotulo) {
  console.log(`  ${condicao ? '✓' : '✗ FALHOU:'} ${rotulo}`);
  if (!condicao) falhas++;
}

function firestoreQueRecusaOBatchWrite() {
  const pedidos = [];
  const buscar = async (url, opcoes = {}) => {
    const decodificada = decodeURIComponent(url);
    pedidos.push({ url: decodificada, metodo: opcoes.method || 'GET', corpo: opcoes.body ? JSON.parse(opcoes.body) : null });
    const { status = 200, corpo = {} } = decodificada === `${DOCS}:batchWrite` ? RECUSA_DAS_REGRAS : {};
    return { ok: status >= 200 && status < 300, status, json: async () => corpo };
  };
  const sessao = criarSessao({
    credenciais: { uid: 'u1', idToken: 'token-bom', refreshToken: 'refresh', expiresAt: Date.now() + 3600_000 },
    buscar,
  });
  return { nuvem: nuvemHttp({ sessao, buscar }), pedidos };
}

async function rodar() {
  console.log('\nGravar em lote: 500 por :commit, que as regras do Firestore aceitam com token de usuário (o :batchWrite dá 403)');
  const { nuvem, pedidos } = firestoreQueRecusaOBatchWrite();
  let erro = null;
  try { await nuvem.gravarFrases(Array.from({ length: 1001 }, (_, i) => ({ id: i + 1, texto: 't' }))); } catch (e) { erro = e; }
  assert(erro === null, `o lote é aceito${erro ? ` (${erro.message})` : ''}`);
  assert(!pedidos.some(p => p.url === `${DOCS}:batchWrite`), 'nenhum pedido vai ao :batchWrite');
  const lotes = pedidos.filter(p => p.metodo === 'POST' && p.url === `${DOCS}:commit`);
  assert(lotes.map(l => l.corpo.writes.length).join() === '500,500,1', 'três lotes: 500, 500 e 1');
  assert(lotes[0]?.corpo.writes[0].update.name === 'projects/perpetualminer-4c219/databases/(default)/documents/usuarios/u1/frases/1',
    'o nome do documento é o caminho completo');

  console.log(falhas ? `\n${falhas} falha(s)` : '\nTODOS OS TESTES PASSARAM');
  process.exit(falhas ? 1 : 0);
}

rodar().catch(err => { console.error(err); process.exit(1); });

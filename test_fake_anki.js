'use strict';

// O fake da Conexão com o Anki do e2e responde pelos exemplos do contrato
// (complemento/contrato/exemplos.json). Pedir uma situação que o contrato não tem
// não inventa uma resposta: diz para escrever o exemplo antes.

const assert = require('assert');
const { criarFakeAnki, exemploDaExtensao } = require('./e2e/fakes/anki');

const fake = criarFakeAnki();
assert.deepStrictEqual(fake.respostaDoContrato('GET', '/health').json.perfil, 'Usuário 1');

fake.abrirPerfil('Perfil sem exemplo');
assert.throws(() => fake.respostaDoContrato('GET', '/health'), /não tem exemplo de GET \/health/);

// Cada pedido que a extensão faz de verdade, pelo mesmo ponto em que o Playwright entrega o pedido ao fake.
const contrato = require('./complemento/contrato/exemplos.json');

/** Entrega ao fake o pedido `metodo caminho` (com `corpo`, se tiver) como o Playwright o entregaria; devolve `{ status, json }` ou `{ abortado }`. */
async function pedirAoFake(fakeDaConexao, metodo, caminho, corpo = null) {
  let entregue = null;
  await fakeDaConexao.tratar({
    request: () => ({ method: () => metodo, url: () => `http://127.0.0.1:8766${caminho}`, postData: () => (corpo ? JSON.stringify(corpo) : null) }),
    fulfill: resposta => { entregue = { status: resposta.status, json: JSON.parse(resposta.body) }; },
    abort: () => { entregue = { abortado: true }; },
  });
  return entregue;
}

async function conferirOsExemplos() {
  for (const exemplo of contrato.exemplos.filter(exemploDaExtensao)) {
    const fakeDoExemplo = criarFakeAnki();
    fakeDoExemplo.abrirPerfil(exemplo.contexto.perfil);
    if (exemplo.contexto.falhaNoPerfil) fakeDoExemplo.falharLeituraDoPerfil();
    if (exemplo.contexto.openai) fakeDoExemplo.responderOpenAI(exemplo.contexto.openai);
    if (exemplo.contexto.chaveNaConexao) fakeDoExemplo.guardarChaveNaConexao(exemplo.contexto.chaveNaConexao);
    const entregue = await pedirAoFake(fakeDoExemplo, exemplo.pedido.metodo, exemplo.pedido.caminho, exemplo.pedido.corpo);
    assert.deepStrictEqual(entregue, exemplo.resposta,
      `O fake e o contrato se separaram no exemplo "${exemplo.nome}" (complemento/contrato/exemplos.json).`);
  }
  console.log('fake anki tests passed');
}

// A chave que a Conexão aceita fica como cópia dela; a que a OpenAI recusa não fica; o estado só diz os 4 últimos.
async function conferirACopiaDaChave() {
  const pedir = (fakeDaChave, caminho, corpo) => pedirAoFake(fakeDaChave, 'POST', caminho, corpo);
  const chave = 'sk-proj-outra-chave-do-teste-7c2e';

  const aceita = criarFakeAnki();
  assert.deepStrictEqual((await pedir(aceita, '/ia/openai/chave', { chave })).json, { ok: true, ultimos4: '7c2e' });
  assert.strictEqual(aceita.chaveNaConexao(), chave);
  const estado = await pedir(aceita, '/ia/estado', {});
  assert.deepStrictEqual(estado.json, { openai: { configurada: true, ultimos4: '7c2e' } });
  assert.ok(!JSON.stringify(estado).includes(chave));

  const recusada = criarFakeAnki();
  recusada.responderOpenAI('recusa');
  assert.strictEqual((await pedir(recusada, '/ia/openai/chave', { chave })).status, 401);
  assert.strictEqual(recusada.chaveNaConexao(), null);
}

conferirOsExemplos().then(conferirACopiaDaChave).then(() => console.log('fake anki key tests passed')).catch(erro => { console.error(erro); process.exit(1); });

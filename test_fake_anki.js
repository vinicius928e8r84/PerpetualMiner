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

async function conferirOsExemplos() {
  for (const exemplo of contrato.exemplos.filter(exemploDaExtensao)) {
    const fakeDoExemplo = criarFakeAnki();
    fakeDoExemplo.abrirPerfil(exemplo.contexto.perfil);
    if (exemplo.contexto.falhaNoPerfil) fakeDoExemplo.falharLeituraDoPerfil();
    if (exemplo.contexto.openai) fakeDoExemplo.responderOpenAI(exemplo.contexto.openai);
    if (exemplo.contexto.chaveNaConexao) fakeDoExemplo.guardarChaveNaConexao(exemplo.contexto.chaveNaConexao);
    let entregue = null;
    const corpo = exemplo.pedido.corpo ? JSON.stringify(exemplo.pedido.corpo) : null;
    await fakeDoExemplo.tratar({
      request: () => ({ method: () => exemplo.pedido.metodo, url: () => `http://127.0.0.1:8766${exemplo.pedido.caminho}`, postData: () => corpo }),
      fulfill: resposta => { entregue = { status: resposta.status, json: JSON.parse(resposta.body) }; },
      abort: () => { entregue = { abortado: true }; },
    });
    assert.deepStrictEqual(entregue, exemplo.resposta,
      `O fake e o contrato se separaram no exemplo "${exemplo.nome}" (complemento/contrato/exemplos.json).`);
  }
  console.log('fake anki tests passed');
}

// A chave que a Conexão aceita fica como cópia dela; a que a OpenAI recusa não fica; o estado só diz os 4 últimos.
async function conferirACopiaDaChave() {
  const pedir = async (fakeDaChave, caminho, corpo) => {
    let entregue = null;
    await fakeDaChave.tratar({
      request: () => ({ method: () => 'POST', url: () => `http://127.0.0.1:8766${caminho}`, postData: () => JSON.stringify(corpo) }),
      fulfill: resposta => { entregue = { status: resposta.status, json: JSON.parse(resposta.body) }; },
      abort: () => { entregue = { abortado: true }; },
    });
    return entregue;
  };
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

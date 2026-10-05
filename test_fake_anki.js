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
    if (exemplo.contexto.perfil !== undefined) fakeDoExemplo.abrirPerfil(exemplo.contexto.perfil);
    if (exemplo.contexto.falhaNoPerfil) fakeDoExemplo.falharLeituraDoPerfil();
    if (exemplo.contexto.itemDeLogin) fakeDoExemplo.definirItemDeLogin(exemplo.contexto.itemDeLogin);
    let entregue = null;
    await fakeDoExemplo.tratar({
      request: () => ({ method: () => exemplo.pedido.metodo, url: () => `http://127.0.0.1:8766${exemplo.pedido.caminho}`, postData: () => (exemplo.pedido.corpo === undefined ? null : JSON.stringify(exemplo.pedido.corpo)) }),
      fulfill: resposta => { entregue = { status: resposta.status, json: JSON.parse(resposta.body) }; },
      abort: () => { entregue = { abortado: true }; },
    });
    assert.deepStrictEqual(entregue, exemplo.resposta,
      `O fake e o contrato se separaram no exemplo "${exemplo.nome}" (complemento/contrato/exemplos.json).`);
  }
  console.log('fake anki tests passed');
}

conferirOsExemplos().catch(erro => { console.error(erro); process.exit(1); });

'use strict';

// O fake da Conexão com o Anki do e2e responde pelos exemplos do contrato
// (complemento/contrato/exemplos.json). Pedir uma situação que o contrato não tem
// não inventa uma resposta: diz para escrever o exemplo antes.

const assert = require('assert');
const { criarFakeAnki, exemploDaExtensao, diferencaDoContrato } = require('./e2e/fakes/anki');

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
    if ('colecao' in exemplo.contexto) fakeDoExemplo.abrirColecao(exemplo.contexto.colecao);
    let entregue = null;
    await fakeDoExemplo.tratar({
      request: () => ({
        method: () => exemplo.pedido.metodo,
        url: () => `http://127.0.0.1:8766${exemplo.pedido.caminho}`,
        postData: () => (exemplo.pedido.corpo === undefined ? null : JSON.stringify(exemplo.pedido.corpo)),
      }),
      fulfill: resposta => { entregue = { status: resposta.status, json: JSON.parse(resposta.body) }; },
      abort: () => { entregue = { abortado: true }; },
    });
    assert.strictEqual(entregue.status, exemplo.resposta.status, `O fake e o contrato se separaram no exemplo "${exemplo.nome}" (complemento/contrato/exemplos.json).`);
    assert.strictEqual(diferencaDoContrato(entregue.json, exemplo.resposta.json), null,
      `O fake e o contrato se separaram no exemplo "${exemplo.nome}" (complemento/contrato/exemplos.json): ${diferencaDoContrato(entregue.json, exemplo.resposta.json)}`);
  }

  // Os três corpos que Baralhos e termos pede de verdade, com os dois Baralhos dos Ajustes de envio
  // (painel-anki-baralhos.js: a primeira leitura; depois de um reparo ou de salvar outro Baralho, `refresh`;
  // Atualizar e Tentar de novo, `refresh` e `launch`), todos com resposta no contrato.
  const baralhosDosAjustes = [{ deckName: 'Inglês', lang: 'en' }, { deckName: 'Alemão', lang: 'ru' }];
  for (const extra of [{}, { refresh: true }, { refresh: true, launch: true }]) {
    const doPainel = criarFakeAnki();
    doPainel.abrirColecao('inglês com subbaralho');
    assert.strictEqual(doPainel.respostaDoContrato('POST', '/anki/stats/decks', { decks: baralhosDosAjustes, ...extra }).status, 200,
      `o contrato não tem o pedido de Baralhos e termos com ${JSON.stringify(extra)}`);
  }

  // O vocabulário, os Baralhos e os números que o teste de tela monta (sem coleção do contrato) seguem a mesma forma.
  const dosTestes = criarFakeAnki();
  dosTestes.definirVocabulario('en', [{ word: 'gave up', type: 'term', maduros: 1 }, 'smoking']);
  dosTestes.definirBaralho('Inglês', { cartoes: 4, termos: 3, palavras: 11, porCartao: 2.75, novos: 1, aprendendo: 1, recentes: 1, maduros: 1 });
  const lido = async (caminho, corpo) => {
    let entregue = null;
    await dosTestes.tratar({
      request: () => ({ method: () => 'POST', url: () => `http://127.0.0.1:8766${caminho}`, postData: () => JSON.stringify(corpo) }),
      fulfill: resposta => { entregue = JSON.parse(resposta.body); },
      abort: () => {},
    });
    return entregue;
  };
  const exemploDe = nome => contrato.exemplos.find(e => e.nome === nome).resposta.json;
  const formas = (obtido, esperado, caminho = '') => {
    // As chaves de cada objeto são as do contrato, nos objetos que o fake monta (`sourceDetail` é do Anki fechado).
    if (Array.isArray(esperado)) return esperado.length ? formas(obtido[0], esperado[0], `${caminho}[]`) : null;
    if (!esperado || typeof esperado !== 'object') return null;
    assert.deepStrictEqual(Object.keys(obtido).sort(), Object.keys(esperado).sort(), `a forma do fake não é a do contrato em ${caminho || '/'}`);
    for (const chave of Object.keys(esperado)) formas(obtido[chave], esperado[chave], `${caminho}/${chave}`);
    return null;
  };
  formas(await lido('/anki/vocabulary', { deck: 'Inglês', lang: 'en', limit: 10000 }), exemploDe('Vocabulário de um Baralho'));
  formas(await lido('/anki/stats/decks', { decks: [{ deckName: 'Inglês', lang: 'en' }, { deckName: 'Alemão', lang: 'en' }] }),
    exemploDe('Números de um Baralho que existe e de um que não existe'));
  console.log('fake anki tests passed');
}

conferirOsExemplos().catch(erro => { console.error(erro); process.exit(1); });

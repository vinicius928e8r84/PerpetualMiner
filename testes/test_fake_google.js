'use strict';

const assert = require('assert');
const { criarFakeGoogle } = require('../e2e/fakes/google');

const RAIZ = 'https://firestore.googleapis.com/v1/projects/perpetualminer-4c219/databases/(default)/documents';

async function pedirAoFirestore(fake, { metodo, caminho, mascara = [], corpo = null }) {
  let entregue = null;
  const consulta = mascara.map(campo => `updateMask.fieldPaths=${encodeURIComponent(campo)}`).join('&');
  const url = `${RAIZ}/${caminho}${consulta ? `?${consulta}` : ''}`;
  await fake.tratar({
    request: () => ({ url: () => url, method: () => metodo, postDataJSON: () => corpo, headers: () => ({}) }),
    fulfill: ({ status, body }) => { entregue = { status, json: JSON.parse(body) }; },
  });
  return entregue;
}

const gravar = (fake, caminho, fields, mascara) => pedirAoFirestore(fake, { metodo: 'PATCH', caminho, mascara, corpo: { fields } });
const ler = (fake, caminho) => pedirAoFirestore(fake, { metodo: 'GET', caminho });

async function osTiposDeCampoIdaEVolta() {
  const fake = criarFakeGoogle();
  const frase = { id: 'f1', texto: 'olá', sequencia: 7, marcada: true, palavras: ['um', 'dois'], contexto: { fonte: 'Netflix', minuto: 12 }, ausente: null };

  fake.gravarFrases('u1', [frase]);

  const lida = await ler(fake, 'usuarios/u1/frases/f1');
  assert.strictEqual(lida.status, 200);
  assert.deepStrictEqual(lida.json.fields, {
    id: { stringValue: 'f1' },
    texto: { stringValue: 'olá' },
    sequencia: { integerValue: '7' },
    marcada: { booleanValue: true },
    palavras: { arrayValue: { values: [{ stringValue: 'um' }, { stringValue: 'dois' }] } },
    contexto: { mapValue: { fields: { fonte: { stringValue: 'Netflix' }, minuto: { integerValue: '12' } } } },
  }, 'o campo null não é guardado e cada tipo vira o seu campo do Firestore');
  assert.deepStrictEqual(fake.frasesDe('u1'), [{ id: 'f1', texto: 'olá', sequencia: 7, marcada: true, palavras: ['um', 'dois'], contexto: { fonte: 'Netflix', minuto: 12 } }]);
}

async function aMascaraMexeSoNosCamposDela() {
  const fake = criarFakeGoogle();
  fake.gravarFrases('u1', [{ id: 'f1', keywords: 'antigas', dados: { a: 'x', b: 'y' } }]);

  const resposta = await gravar(fake, 'usuarios/u1/frases/f1', {
    keywords: { stringValue: 'novas' },
    dados: { mapValue: { fields: { a: { stringValue: 'novo' } } } },
  }, ['keywords', 'dados.a', 'dados.b']);

  assert.strictEqual(resposta.status, 200);
  assert.deepStrictEqual(fake.frasesDe('u1'), [{ id: 'f1', keywords: 'novas', dados: { a: 'novo' } }],
    'o campo da máscara que falta no corpo é apagado; o que a máscara não cita fica');
}

async function oNomeEntreCrasesCriaOMapaInteiro() {
  const fake = criarFakeGoogle();
  const marca = { booleanValue: true };

  const resposta = await gravar(fake, 'usuarios/u1/meta/deleted', { ids: { mapValue: { fields: { 123: marca, '4`5': marca } } } },
    ['ids.`123`', 'ids.`4\\`5`']);

  assert.strictEqual(resposta.status, 200);
  assert.deepStrictEqual(fake.apagadasDe('u1').sort(), ['123', '4`5']);
}

async function oCaminhoDeCampoMalFormadoEhRecusado() {
  for (const mascara of ['ids.123', 'ids..a', 'ids.', '', 'a b', 'a.`b', 'a`b`', '.a']) {
    const fake = criarFakeGoogle();
    const resposta = await gravar(fake, 'usuarios/u1/meta/deleted', { ids: { mapValue: { fields: {} } } }, [mascara]);
    assert.strictEqual(resposta.status, 400, `a máscara ${JSON.stringify(mascara)} devia ser recusada`);
    assert.strictEqual(resposta.json.error.status, 'INVALID_ARGUMENT');
    assert.strictEqual(resposta.json.error.message, `Invalid property path "${mascara}".`);
    assert.deepStrictEqual(fake.apagadasDe('u1'), [], 'o pedido recusado não grava nada');
  }
}

const CASOS = [
  ['cada tipo de campo vai e volta do Firestore', osTiposDeCampoIdaEVolta],
  ['a máscara mexe só nos campos dela', aMascaraMexeSoNosCamposDela],
  ['o nome entre crases cria o mapa inteiro', oNomeEntreCrasesCriaOMapaInteiro],
  ['o caminho de campo mal formado é recusado', oCaminhoDeCampoMalFormadoEhRecusado],
];

(async () => {
  for (const [nome, caso] of CASOS) {
    await caso();
    console.log(`ok - ${nome}`);
  }
})().catch(erro => {
  console.error(erro);
  process.exit(1);
});

'use strict';

const assert = require('assert');
const { criarSincronizacao } = require('../lib/sincronizacao.js');

function areaEmMemoria(dados = {}) {
  return {
    get: async pedido => (pedido === null ? { ...dados }
      : Object.fromEntries(Object.entries(pedido).map(([chave, padrao]) => [chave, chave in dados ? dados[chave] : padrao]))),
    set: async valores => { Object.assign(dados, valores); },
    remove: async chaves => { for (const chave of [].concat(chaves)) delete dados[chave]; },
  };
}

function nuvemEmMemoria(frases) {
  const naNuvem = new Map(frases.map(frase => [String(frase.id), frase]));
  const apagadas = new Set();
  return {
    naNuvem,
    apagadas,
    uid: 'uid-teste',
    listarFrases: async () => [...naNuvem.values()],
    gravarFrase: async frase => { naNuvem.set(String(frase.id), frase); },
    gravarFrases: async lista => { for (const frase of lista) naNuvem.set(String(frase.id), frase); },
    apagarFrases: async ids => { for (const id of ids) naNuvem.delete(String(id)); },
    lerTombstones: async () => new Map([...apagadas].map(id => [id, Date.now()])),
    gravarTombstones: async ids => { for (const id of ids) apagadas.add(String(id)); },
  };
}

const frase = (id, texto) => ({ id, texto, data: '19/11/2026', streaming: 'manual', idioma: 'Inglês' });

async function comContaApagaDaNuvemSoAsFrasesAteOMomentoConfirmado() {
  const nuvem = nuvemEmMemoria([
    frase(1_000, 'He barely made it to the station.'),
    frase(2_000, 'Mined on the other computer before the dialog.'),
    frase(4_000, 'The ferry left the harbour.'),
  ]);
  const local = areaEmMemoria();
  const sincronizacao = criarSincronizacao({ nuvem, armazenamento: { local, sync: areaEmMemoria() }, agora: () => 5_000 });

  const { ok } = await sincronizacao.apagarTudo(['1000'], 3_000);

  assert.strictEqual(ok, true);
  assert.deepStrictEqual([...nuvem.naNuvem.keys()], ['4000'], 'a Frase minerada depois do momento confirmado fica na nuvem');
  assert.deepStrictEqual([...nuvem.apagadas].sort(), ['1000', '2000'], 'e não ganha tombstone, então não some no próximo carregar');
  assert.deepStrictEqual(await local.get({ pm_apagar_tudo: null }), { pm_apagar_tudo: null }, 'o Apagar tudo pendente foi concluído');
}

async function oApagarTudoPendenteVaiAteOMomentoConfirmado() {
  const nuvem = nuvemEmMemoria([frase(1_000, 'He barely made it to the station.')]);
  nuvem.listarFrases = async () => { throw new Error('nuvem fora do ar'); };
  const local = areaEmMemoria();
  const sincronizacao = criarSincronizacao({ nuvem, armazenamento: { local, sync: areaEmMemoria() }, agora: () => 5_000 });

  const { ok } = await sincronizacao.apagarTudo(['1000'], 3_000);

  assert.strictEqual(ok, false);
  assert.deepStrictEqual(await local.get({ pm_apagar_tudo: null }), { pm_apagar_tudo: { uid: 'uid-teste', ate: 3_000 } },
    'a volta seguinte apaga só até o momento confirmado');
}

async function umaSubidaEmVooDeUmaFraseContadaNaoARessuscitaNoOutroComputador() {
  const nuvem = nuvemEmMemoria([]);
  const sincronizacao = criarSincronizacao({ nuvem, armazenamento: { local: areaEmMemoria(), sync: areaEmMemoria() }, agora: () => 5_000 });

  await sincronizacao.apagarTudo(['1000'], 3_000);
  await nuvem.gravarFrase(frase(1_000, 'He barely made it to the station.'));
  const outroComputador = criarSincronizacao({ nuvem, armazenamento: { local: areaEmMemoria(), sync: areaEmMemoria() }, agora: () => 6_000 });
  const { frases } = await outroComputador.carregar();

  assert.deepStrictEqual([...nuvem.apagadas], ['1000'], 'a Frase contada ganha tombstone mesmo antes de chegar à nuvem');
  assert.deepStrictEqual(frases, [], 'e o outro computador não a vê quando a subida termina');
}

async function semOMomentoApagaTudoQueEstaNaNuvemAgora() {
  const nuvem = nuvemEmMemoria([frase(1_000, 'One.'), frase(4_000, 'Two.')]);
  const sincronizacao = criarSincronizacao({ nuvem, armazenamento: { local: areaEmMemoria(), sync: areaEmMemoria() }, agora: () => 5_000 });

  await sincronizacao.apagarTudo(['1000']);

  assert.deepStrictEqual([...nuvem.naNuvem.keys()], []);
}

(async () => {
  const casos = [
    comContaApagaDaNuvemSoAsFrasesAteOMomentoConfirmado,
    oApagarTudoPendenteVaiAteOMomentoConfirmado,
    umaSubidaEmVooDeUmaFraseContadaNaoARessuscitaNoOutroComputador,
    semOMomentoApagaTudoQueEstaNaNuvemAgora,
  ];
  let falhas = 0;
  for (const caso of casos) {
    try {
      await caso();
      console.log(`ok  ${caso.name}`);
    } catch (erro) {
      falhas++;
      console.log(`FALHOU  ${caso.name}\n${erro.message}`);
    }
  }
  if (falhas) process.exit(1);
  console.log('test_apagar_tudo.js: tudo certo');
})();

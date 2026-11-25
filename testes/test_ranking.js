'use strict';

const assert = require('assert');

globalThis.PerpetualMiner = {};
require('../lib/sincronizacao.js');
require('../lib/ajustes-de-envio.js');
require('../lib/quiz-de-nivel.js');
require('../lib/ranking.js');
const { Ranking, Sincronizacao } = globalThis.PerpetualMiner;

const comOutrosNiveis = { PerpetualMiner: { Sincronizacao, QuizDeNivel: { NIVEIS: { A: 'basico', B: 'fluente' } } } };
require('vm').runInNewContext(require('fs').readFileSync('./lib/ranking.js', 'utf8'), comOutrosNiveis);
assert.strictEqual(comOutrosNiveis.PerpetualMiner.Ranking.nota({ nivel: 'fluente', acertos: 0, perguntas: 3 }), 1000);

const rankingAntes = { PerpetualMiner: { Sincronizacao } };
require('vm').runInNewContext(require('fs').readFileSync('./lib/ranking.js', 'utf8'), rankingAntes);
rankingAntes.PerpetualMiner.QuizDeNivel = { NIVEIS: { A: 'basico', B: 'fluente' } };
assert.strictEqual(rankingAntes.PerpetualMiner.Ranking.nota({ nivel: 'fluente', acertos: 0, perguntas: 3 }), 1000,
  'o ranking carregado antes do quiz de nível lê os níveis quando é usado');

const resultado = (nivel, acertos, perguntas, melhorSequencia) => ({ nivel, acertos, perguntas, melhorSequencia });

assert(Ranking.nota(resultado('intermediario', 0, 6, 0)) > Ranking.nota(resultado('iniciante', 3, 3, 3)), 'o nível pesa mais que os acertos');
assert(Ranking.nota(resultado('avancado', 6, 6, 6)) > Ranking.nota(resultado('avancado', 5, 6, 5)));
assert.strictEqual(Ranking.nota(resultado('iniciante', 1, 3, 1)), Ranking.nota(resultado('iniciante', 2, 6, 1)), 'a mesma parte de acertos vale igual em 3 ou 6 perguntas');

const perfil = { uid: 'u1', nome: 'Ana', foto: 'https://foto/ana.png' };
const registro = Ranking.registro({ ...perfil, idioma: 'en', resultado: resultado('avancado', 4, 6, 3), em: 1000 });
assert.deepStrictEqual(registro, {
  uid: 'u1', idioma: 'en', nome: 'Ana', foto: 'https://foto/ana.png', nivel: 'avancado', melhorSequencia: 3,
  nota: Ranking.nota(resultado('avancado', 4, 6, 3)), acertos: 4, perguntas: 6, grupos: [], topou: true, em: 1000,
});
assert.strictEqual(Ranking.idDoRegistro('en', 'u1'), 'en_u1');

const doGrupo = [
  { uid: 'a', nota: 100 }, { uid: 'b', nota: 1050 }, { uid: 'c', nota: 2000 }, { uid: 'u1', nota: 1500 },
];
assert.strictEqual(Ranking.melhorQue(1500, doGrupo, 'u1'), 67, '2 de 3 abaixo, a própria pessoa fora da conta');
assert.strictEqual(Ranking.melhorQue(1500, [{ uid: 'u1', nota: 1500 }], 'u1'), null, 'ninguém além dela');
assert.strictEqual(Ranking.melhorQue(0, [{ uid: 'a', nota: 0 }], 'u1'), 0, 'empate não é ser melhor');
assert.strictEqual(Ranking.melhorQue(3000, [{ uid: 'a', nota: 0 }, { uid: 'b', nota: 10 }], 'u1'), 100);

assert.deepStrictEqual(Ranking.ordenar([
  { uid: 'a', nota: 10, melhorSequencia: 1 }, { uid: 'b', nota: 20, melhorSequencia: 1 }, { uid: 'c', nota: 10, melhorSequencia: 3 },
]).map(p => p.uid), ['b', 'c', 'a']);

async function comNuvem(fazer) {
  const pedidos = [];
  const resposta = {};
  const buscar = async (url, opcoes) => {
    pedidos.push({ url, metodo: opcoes.method, corpo: opcoes.body ? JSON.parse(opcoes.body) : null, autorizacao: opcoes.headers.Authorization });
    const { status = 200, corpo = {} } = resposta.proxima || {};
    return { ok: status < 300, status, json: async () => corpo };
  };
  const sessao = { uid: 'u1', token: async () => 'tok', invalidar() {}, verificarAtiva() {} };
  const nuvem = Ranking.nuvem({ sessao, buscar });
  await fazer(nuvem, pedidos, resposta);
}

(async () => {
  await comNuvem(async (nuvem, pedidos) => {
    await nuvem.entrar(registro);
    assert.strictEqual(pedidos[0].metodo, 'PATCH');
    assert(pedidos[0].url.endsWith('/documents/ranking/en_u1'), pedidos[0].url);
    assert.strictEqual(pedidos[0].autorizacao, 'Bearer tok');
    assert.deepStrictEqual(Sincronizacao.deCampos(pedidos[0].corpo.fields), registro);

    await nuvem.sair('en');
    assert.strictEqual(pedidos[1].metodo, 'DELETE');
    assert(pedidos[1].url.endsWith('/documents/ranking/en_u1'));
  });

  await comNuvem(async (nuvem, pedidos, resposta) => {
    resposta.proxima = { corpo: [
      { document: { name: 'x/ranking/en_a', fields: Sincronizacao.paraCampos(Ranking.registro({ uid: 'a', nome: 'Bia', foto: '', idioma: 'en', resultado: resultado('iniciante', 3, 3, 3), em: 1 })) } },
      { readTime: '2026-11-06T00:00:00Z' },
    ] };
    const pessoas = await nuvem.listar('en');
    assert.deepStrictEqual(pessoas.map(p => p.uid), ['a']);
    const consulta = pedidos[0].corpo.structuredQuery;
    assert(pedidos[0].url.endsWith('/documents:runQuery'), pedidos[0].url);
    assert.deepStrictEqual(consulta.from, [{ collectionId: 'ranking' }]);
    assert.deepStrictEqual(consulta.where.compositeFilter.filters.map(f => [f.fieldFilter.field.fieldPath, Object.values(f.fieldFilter.value)[0]]),
      [['topou', true], ['idioma', 'en']], 'a consulta pede só quem topou, do idioma');
  });

  await comNuvem(async (nuvem, pedidos, resposta) => {
    resposta.proxima = { status: 403, corpo: { error: { status: 'PERMISSION_DENIED', message: 'Missing or insufficient permissions.' } } };
    await assert.rejects(nuvem.listar('en'), erro => erro.motivo === Sincronizacao.MOTIVO.RECUSADO);
  });

  await comNuvem(async (nuvem, pedidos, resposta) => {
    resposta.proxima = { status: 401, corpo: { error: { message: 'expired' } } };
    await assert.rejects(nuvem.listar('en'), erro => erro.motivo === Sincronizacao.MOTIVO.EXPIROU && erro.message === 'expired');
    resposta.proxima = { status: 500 };
    await assert.rejects(nuvem.listar('en'), erro => !erro.motivo && erro.status === 500 && erro.message === 'HTTP 500');
    assert(pedidos.every(p => p.url.startsWith(Sincronizacao.URL_DOS_DOCUMENTOS)), 'os pedidos vão à raiz dos documentos da sincronização');
  });

  console.log('ok: ranking');
})().catch(erro => { console.error(erro); process.exit(1); });

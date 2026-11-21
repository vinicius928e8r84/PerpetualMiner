'use strict';

const assert = require('assert');

const { ENDERECO, criarConexao, resposta, carregarAPagina, lerJson, igual, parearComChaveGuardada } = require('../e2e/pagina-de-mentira-do-pareamento');

const CAMINHO_DO_CONFERIR = '/pareamento/conferir';
const PROVA_DE_OUTRO_SEGREDO = 'AAAA'.repeat(10) + 'AAA=';
const caminhoDe = url => new URL(url).pathname;
const caminhosVistos = conexao => [...new Set(conexao.vistos.map(v => v.caminho))];

const impostorQueResponde = (corpoDoConferir, { status = 401, versao = '9.9.9' } = {}) => criarConexao({
  impostor: async ({ caminho }) => (caminho === '/health' ? resposta(200, { ok: true, versao, perfil: 'X' }) : resposta(status, corpoDoConferir)),
});

async function pareadaCom(conexao) {
  const pagina = carregarAPagina(conexao);
  await parearComChaveGuardada(pagina);
  return pagina;
}

async function trocarONavegadorPorUmNovo(pagina, conexaoReal) {
  conexaoReal.pareamento.sortearCodigo('K7M4PX');
  igual(await pagina.Pareamento.comecar(ENDERECO), { ok: true });
  igual(await pagina.Pareamento.concluir(ENDERECO, 'K7M-4PX'), { ok: true });
}

async function oImpostorSemProvaNaoVeAChave() {
  const conexao = impostorQueResponde({ sessao: 'a'.repeat(32), prova: PROVA_DE_OUTRO_SEGREDO }, { status: 200, versao: '0.4.25' });
  const pagina = await pareadaCom(conexao);
  const antes = conexao.vistos.length;
  const negado = await pagina.pedir(pagina.PedidoAoAnki.chaveDaOpenAI('sk-proj-segredo-da-pessoa'));
  igual([negado.ok, negado.motivo, negado.codigo, negado.status], [false, 'sem_resposta', 'sem_prova', null]);
  assert.match(negado.detalhes, /não provou/);
  igual(conexao.vistos.slice(antes).map(v => v.caminho), [CAMINHO_DO_CONFERIR], 'o impostor viu o desafio e mais nada');
  assert.ok(!JSON.stringify(conexao.vistos).includes('sk-proj-segredo-da-pessoa'));
  assert.strictEqual(pagina.Pareamento.estado(), 'nao_confirmada');
}

const ADULTERACOES = [
  ['sem a prova', r => new Response(r.body, { status: r.status })],
  ['com a prova de outro corpo', async r => new Response('{"ok":false}', { status: r.status, headers: r.headers })],
  ['com a prova de outro status', async r => new Response(await r.clone().text(), { status: 500, headers: r.headers })],
];

function adulterarOEstadoDaIA(conexao, original, adulterar) {
  conexao.fetch = async (url, opcoes) => {
    const r = await original(url, opcoes);
    return caminhoDe(url) === '/ia/estado' ? adulterar(r) : r;
  };
}

async function aRespostaAdulteradaNaoPassa() {
  const conexao = criarConexao();
  const pagina = await pareadaCom(conexao);
  const original = conexao.fetch;
  for (const [nome, adulterar] of ADULTERACOES) {
    adulterarOEstadoDaIA(conexao, original, adulterar);
    const adulterada = await pagina.pedir(pagina.PedidoAoAnki.estadoDaIA());
    igual([adulterada.ok, adulterada.motivo, adulterada.codigo, adulterada.dados], [false, 'sem_resposta', 'sem_prova', null], nome);
    assert.match(adulterada.detalhes, /prova/, nome);
    assert.strictEqual(pagina.Pareamento.estado(), 'nao_confirmada', nome);
    conexao.fetch = original;
    await pagina.Pareamento.provar(ENDERECO);
  }
  assert.strictEqual(pagina.Pareamento.estado(), 'pareada');
}

async function aConexaoAntigaSoVeOConferir() {
  const conexao = criarConexao({ antiga: true });
  const pagina = await pareadaCom(conexao);
  const lida = await pagina.pedir(pagina.PedidoAoAnki.chaveDaOpenAI('sk-proj-x'));
  igual([lida.motivo, lida.status, lida.codigo], ['antiga', 404, 'not_found']);
  assert.ok(conexao.vistos.every(v => v.caminho === CAMINHO_DO_CONFERIR), 'a Conexão antiga só viu o conferir');
  assert.strictEqual(pagina.Pareamento.estado(), 'antiga');
  for (const pedido of [pagina.PedidoAoAnki.atualizarAConexao(), pagina.PedidoAoAnki.reiniciarOAnki()]) {
    conexao.vistos.length = 0;
    assert.strictEqual((await pagina.pedir(pedido)).status, 404);
    igual(conexao.vistos.map(v => v.caminho), [CAMINHO_DO_CONFERIR], `${pedido.caminho}: a Conexão antiga só viu o conferir`);
  }
}

async function aConexaoAntigaSemPareamentoNaoVeAChave() {
  const conexao = criarConexao({ antiga: true, navegadores: [] });
  const pagina = carregarAPagina(conexao);
  assert.strictEqual((await pagina.Pareamento.provar(ENDERECO)).estado, 'antiga');
  const lida = await pagina.pedir(pagina.PedidoAoAnki.chaveDaOpenAI('sk-proj-x'));
  igual([lida.motivo, lida.status, lida.codigo], ['antiga', 404, 'not_found']);
  igual(caminhosVistos(conexao), [CAMINHO_DO_CONFERIR], 'a Conexão antiga só viu o conferir');
  assert.ok(!JSON.stringify(conexao.vistos).includes('sk-proj-x'));
}

async function aRevogacaoProvadaApagaACredencial() {
  const conexao = criarConexao();
  const pagina = await pareadaCom(conexao);
  await pagina.pedir(pagina.PedidoAoAnki.estadoDaIA());
  const antes = (await pagina.Pareamento.lerACredencial()).cliente;
  conexao.pareamento.desconectar();
  const lida = await pagina.pedir(pagina.PedidoAoAnki.estadoDaIA());
  igual([lida.status, (await lerJson(lida)).error], [401, 'pairing_required']);
  assert.strictEqual(pagina.Pareamento.estado(), 'a_parear');
  assert.strictEqual(await pagina.Pareamento.lerACredencial(), null, 'a prova da revogação apaga a credencial');
  await trocarONavegadorPorUmNovo(pagina, conexao);
  assert.notStrictEqual((await pagina.Pareamento.lerACredencial()).cliente, antes, 'um navegador novo para a Conexão');
  assert.strictEqual((await pagina.Pareamento.provar(ENDERECO)).estado, 'pareada');
}

const REVOGACOES_SEM_PROVA = [
  ['sem prova', { error: 'pairing_revoked' }],
  ['com a prova de outro segredo', { error: 'pairing_revoked', prova: PROVA_DE_OUTRO_SEGREDO }],
];

async function aRevogacaoSemProvaGuardaACredencial() {
  for (const [nome, corpo] of REVOGACOES_SEM_PROVA) {
    const pagina = await pareadaCom(impostorQueResponde(corpo));
    assert.strictEqual((await pagina.Pareamento.provar(ENDERECO)).estado, 'nao_confirmada', nome);
    assert.ok(await pagina.Pareamento.lerACredencial(), `${nome}: a credencial fica`);
  }
}

async function provaDeUmaRevogacaoVelha(conexao, pagina) {
  const velha = await conexao.fetch(`${ENDERECO}${CAMINHO_DO_CONFERIR}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'chrome-extension://x' },
    body: JSON.stringify({ cliente: (await pagina.Pareamento.lerACredencial()).cliente, desafio: 'desafio-que-o-impostor-viu-0123456789' }),
  });
  return (await velha.json()).prova;
}

async function aRevogacaoRepetidaNaoApaga() {
  const conexao = criarConexao();
  const pagina = await pareadaCom(conexao);
  conexao.pareamento.desconectar();
  const repetida = { error: 'pairing_revoked', prova: await provaDeUmaRevogacaoVelha(conexao, pagina) };
  conexao.fetch = impostorQueResponde(repetida).fetch;
  assert.strictEqual((await pagina.Pareamento.provar(ENDERECO)).estado, 'nao_confirmada');
  assert.ok(await pagina.Pareamento.lerACredencial());
}

async function oPedidoRecusadoSemProvaNaoApaga() {
  const conexao = criarConexao();
  const pagina = await pareadaCom(conexao);
  const original = conexao.fetch;
  conexao.fetch = async (url, opcoes) => (caminhoDe(url) === '/ia/estado' ? resposta(401, { error: 'pairing_required' }) : original(url, opcoes));
  const lida = await pagina.pedir(pagina.PedidoAoAnki.estadoDaIA());
  assert.strictEqual(lida.status, 401);
  assert.strictEqual(pagina.Pareamento.estado(), 'nao_confirmada');
  assert.ok(await pagina.Pareamento.lerACredencial());
}

async function oImpostorQuePedePareamentoNaoVeAChave(conexao, pagina) {
  assert.strictEqual((await pagina.Pareamento.provar(ENDERECO)).estado, 'a_parear');
  const negada = await pagina.pedir(pagina.PedidoAoAnki.chaveDaOpenAI('sk-proj-x'));
  igual([negada.status, await lerJson(negada)], [401, { error: 'pairing_required' }]);
  igual(caminhosVistos(conexao), [CAMINHO_DO_CONFERIR]);
}

async function depoisDoImpostorPareiaComAConexaoReal() {
  const conexao = impostorQueResponde({ error: 'pairing_required' });
  const pagina = await pareadaCom(conexao);
  await oImpostorQuePedePareamentoNaoVeAChave(conexao, pagina);
  const antes = (await pagina.Pareamento.lerACredencial()).cliente;
  const real = criarConexao({ navegadores: [] });
  conexao.fetch = real.fetch;
  await trocarONavegadorPorUmNovo(pagina, real);
  const depois = (await pagina.Pareamento.lerACredencial()).cliente;
  assert.notStrictEqual(depois, antes);
  assert.deepStrictEqual([...real.pareamento.pareados().keys()], [depois]);
}

const ATAQUES = [
  oImpostorSemProvaNaoVeAChave,
  aRespostaAdulteradaNaoPassa,
  aConexaoAntigaSoVeOConferir,
  aConexaoAntigaSemPareamentoNaoVeAChave,
  aRevogacaoProvadaApagaACredencial,
  aRevogacaoSemProvaGuardaACredencial,
  aRevogacaoRepetidaNaoApaga,
  oPedidoRecusadoSemProvaNaoApaga,
  depoisDoImpostorPareiaComAConexaoReal,
];

async function main() {
  for (const ataque of ATAQUES) await ataque();
  console.log('pareamento do anki (ataques) tests passed');
}

main().catch(erro => { console.error(erro); process.exit(1); });

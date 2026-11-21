'use strict';

const assert = require('assert');
const { webcrypto } = require('crypto');

const { NAVEGADORES, assinaturaDoPedido, provaDaRevogacao } = require('../e2e/pareamento-de-teste');
const contrato = require('../complemento/contrato/carregar');
const { ENDERECO, criarConexao, carregarAPagina, lerJson, igual, parear, parearComChaveGuardada } = require('../e2e/pagina-de-mentira-do-pareamento');

const CAMINHO_DO_CONFERIR = '/pareamento/conferir';
const caminhoDe = url => new URL(url).pathname;
const chaveHmac = segredo => webcrypto.subtle.importKey('raw', Buffer.from(segredo, 'base64'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
const paginaSemNavegadores = () => { const conexao = criarConexao({ navegadores: [] }); return { conexao, pagina: carregarAPagina(conexao) }; };

async function paginaPareada() {
  const conexao = criarConexao();
  const pagina = carregarAPagina(conexao);
  await parearComChaveGuardada(pagina);
  return { conexao, pagina };
}

async function aExtensaoEOFakeAssinamComoOComplemento() {
  const vetor = contrato.vetorDeAssinatura;
  const { Pareamento } = carregarAPagina(criarConexao());
  const pedido = { sessao: vetor.sessao, nonce: vetor.nonce, metodo: vetor.metodo, caminho: vetor.caminho };
  const feita = await Pareamento.contas.assinaturaDoPedido(await chaveHmac(vetor.segredo), { ...pedido, corpo: new TextEncoder().encode(vetor.corpo) });
  assert.strictEqual(feita, vetor.assinatura, 'a extensão assina como o complemento');
  assert.strictEqual(assinaturaDoPedido(vetor.segredo, { ...pedido, corpo: vetor.corpo }), vetor.assinatura, 'o fake do e2e assina como o complemento');
  const revogacao = contrato.vetorDaRevogacao;
  assert.strictEqual(await Pareamento.contas.provaDaRevogacao(await chaveHmac(revogacao.segredo), revogacao.desafio), revogacao.prova, 'a extensão confere a prova da revogação como o complemento a dá');
  assert.strictEqual(provaDaRevogacao(revogacao.segredo, revogacao.desafio), revogacao.prova, 'o fake do e2e a dá como o complemento');
}

async function semCredencialSoOConferirSai() {
  const { conexao, pagina } = paginaSemNavegadores();
  const lida = await pagina.pedir(pagina.PedidoAoAnki.estadoDaIA());
  igual([lida.status, await lerJson(lida)], [401, { error: 'pairing_required' }]);
  igual(conexao.vistos.map(v => v.caminho), [CAMINHO_DO_CONFERIR], 'sem credencial a Conexão só vê o conferir, de um cliente que ninguém tem, e nenhum cabeçalho de assinatura');
  assert.ok(!Object.keys(conexao.vistos[0].cabecalhos).some(nome => nome.startsWith('x-perpetualminer')));
  assert.strictEqual(pagina.Pareamento.estado(), 'a_parear');
  const saude = await pagina.pedir(pagina.PedidoAoAnki.saude());
  assert.strictEqual(saude.status, 200, 'a saúde segue aberta');
}

async function oCodigoCertoGuardaUmaChaveQueNaoSeLe(conexao, pagina) {
  igual(await pagina.Pareamento.concluir(ENDERECO, 'AAA-AAA'), { erro: 'errado', restam: 4 });
  assert.strictEqual(await pagina.Pareamento.lerACredencial(), null, 'o código errado não guarda nada');
  igual(await pagina.Pareamento.concluir(ENDERECO, 'k7m 4px'), { ok: true });
  const credencial = await pagina.Pareamento.lerACredencial();
  assert.strictEqual(credencial.chave.extractable, false, 'nem o código da extensão lê os bytes do segredo');
  await assert.rejects(webcrypto.subtle.exportKey('raw', credencial.chave));
  assert.strictEqual(conexao.pareamento.pareados().size, 1);
}

async function oPedidoPrivadoVaiAssinadoSemOSegredo(conexao, pagina) {
  const lida = await pagina.pedir(pagina.PedidoAoAnki.estadoDaIA());
  igual([lida.status, await lerJson(lida)], [200, { ok: true, caminho: '/ia/estado' }]);
  const privado = conexao.vistos.at(-1);
  assert.ok(privado.cabecalhos['x-perpetualminer-assinatura'] && privado.cabecalhos['x-perpetualminer-nonce'], 'o pedido privado vai assinado');
  assert.strictEqual(pagina.Pareamento.estado(), 'pareada');
  const segredo = conexao.pareamento.pareados().values().next().value;
  const vezesQueOSegredoSaiu = conexao.vistos.filter(v => JSON.stringify(v).includes(segredo)).length;
  assert.strictEqual(vezesQueOSegredoSaiu, 0, 'a extensão nunca manda o segredo');
}

async function pareiaPeloCodigoDoAnki() {
  const { conexao, pagina } = paginaSemNavegadores();
  conexao.pareamento.sortearCodigo('K7M4PX');
  igual(await pagina.Pareamento.comecar(ENDERECO), { ok: true });
  assert.strictEqual(conexao.pareamento.codigoNoAnki(), 'K7M-4PX');
  await oCodigoCertoGuardaUmaChaveQueNaoSeLe(conexao, pagina);
  await oPedidoPrivadoVaiAssinadoSemOSegredo(conexao, pagina);
}

function perderARespostaDoPrimeiroConcluir(conexao) {
  const original = conexao.fetch;
  let perdeu = false;
  conexao.fetch = async (url, opcoes) => {
    const r = await original(url, opcoes);
    if (!perdeu && caminhoDe(url) === '/pareamento/concluir') { perdeu = true; throw new TypeError('Failed to fetch'); }
    return r;
  };
}

async function aSegundaTentativaUsaOMesmoCliente() {
  const { conexao, pagina } = paginaSemNavegadores();
  conexao.pareamento.sortearCodigo('K7M4PX');
  await pagina.Pareamento.comecar(ENDERECO);
  perderARespostaDoPrimeiroConcluir(conexao);
  igual(await pagina.Pareamento.concluir(ENDERECO, 'K7M-4PX'), { erro: 'falhou' });
  igual(await pagina.Pareamento.concluir(ENDERECO, 'K7M-4PX'), { ok: true });
  assert.strictEqual(conexao.pareamento.pareados().size, 1, 'um navegador só: o cliente da segunda tentativa foi o mesmo');
}

async function oCodigoVencido() {
  const { conexao, pagina } = paginaSemNavegadores();
  await pagina.Pareamento.comecar(ENDERECO);
  conexao.pareamento.vencerOCodigo();
  igual(await pagina.Pareamento.concluir(ENDERECO, 'K7M-4PX'), { erro: 'venceu' });
}

function provarNaAntigaEPedirNaNova(conexao, antiga, nova) {
  let provouNaAntiga = false;
  conexao.fetch = (url, opcoes) => {
    if (caminhoDe(url) !== CAMINHO_DO_CONFERIR || provouNaAntiga) return nova.fetch(url, opcoes);
    provouNaAntiga = true;
    return antiga.fetch(url, opcoes);
  };
}

async function aSessaoVencidaConfereDeNovo() {
  const { conexao, pagina } = await paginaPareada();
  const antiga = criarConexao();
  const nova = criarConexao();
  provarNaAntigaEPedirNaNova(conexao, antiga, nova);
  const lida = await pagina.pedir(pagina.PedidoAoAnki.estadoDaIA());
  assert.strictEqual(lida.status, 200);
  igual(nova.vistos.map(v => v.caminho), ['/ia/estado', CAMINHO_DO_CONFERIR, '/ia/estado'], 'session_expired, conferir e o pedido de novo');
}

async function cadaPedidoConfereAntes() {
  const { conexao, pagina } = await paginaPareada();
  const conferencias = () => conexao.vistos.filter(v => v.caminho === CAMINHO_DO_CONFERIR).length;
  for (const pedido of [pagina.PedidoAoAnki.estadoDaIA(), pagina.PedidoAoAnki.estadoDaIA(), pagina.PedidoAoAnki.chaveDaOpenAI('sk-proj-x')]) {
    const antes = conferencias();
    await pagina.pedir(pedido);
    assert.strictEqual(conferencias(), antes + 1, `${pedido.caminho}: um conferir novo antes do pedido`);
  }
}

async function outraPaginaUsaACredencialGuardada() {
  const { conexao, pagina: paginaA } = paginaSemNavegadores();
  igual(await parear(paginaA, conexao), { ok: true });
  const paginaB = carregarAPagina(conexao, paginaA.indexedDB);
  const lida = await paginaB.pedir(paginaB.PedidoAoAnki.estadoDaIA());
  assert.strictEqual(lida.status, 200);
}

const ehPedidoAberto = pedido => (pedido.metodo === 'GET' && pedido.caminho === '/health') || pedido.caminho.startsWith('/pareamento/');
const exemploDoPedido = (caminho, daExtensao = false) => contrato.exemplos.find(e => (daExtensao ? e.daExtensao : true) && e.pedido.caminho === caminho).pedido.corpo;

async function soOsPedidosAbertosVaoSemAssinatura() {
  const { conexao, pagina } = await paginaPareada();
  const CHAVE = exemploDoPedido('/ia/openai/chave').chave;
  const ENVIO = exemploDoPedido('/jobs', true);
  const variantes = pagina.Variantes.variantes([{ deckName: 'Inglês', lang: 'en' }, { deckName: 'Alemão', lang: 'ru' }], CHAVE, ENVIO);
  assert.ok(variantes.length > 40);
  for (const { nome, pedido } of variantes) {
    conexao.vistos.length = 0;
    await pagina.pedir(pedido);
    const assinado = Boolean(conexao.vistos.at(-1).cabecalhos['x-perpetualminer-assinatura']);
    const aberto = ehPedidoAberto(pedido);
    assert.strictEqual(assinado, !aberto, `${nome}: ${aberto ? 'o pedido aberto não leva assinatura' : 'o pedido privado vai assinado'}`);
  }
}

const CASOS = [
  aExtensaoEOFakeAssinamComoOComplemento,
  semCredencialSoOConferirSai,
  pareiaPeloCodigoDoAnki,
  aSegundaTentativaUsaOMesmoCliente,
  oCodigoVencido,
  aSessaoVencidaConfereDeNovo,
  cadaPedidoConfereAntes,
  outraPaginaUsaACredencialGuardada,
  soOsPedidosAbertosVaoSemAssinatura,
];

async function main() {
  for (const casoDoPareamento of CASOS) await casoDoPareamento();
  assert.ok(NAVEGADORES.primeiro, 'o fake tem o primeiro navegador');
  assert.ok(NAVEGADORES.segundo, 'o fake tem o segundo navegador');
  console.log('pareamento do anki tests passed');
}

main().catch(erro => { console.error(erro); process.exit(1); });

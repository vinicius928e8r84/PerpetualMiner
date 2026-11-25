'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { isDeepStrictEqual } = require('util');

const { criarFakeAnki, exemploDaExtensao } = require('../e2e/fakes/anki');
const contrato = require('../complemento/contrato/carregar');

const enviados = [];
const comoValores = valor => JSON.parse(JSON.stringify(valor));
const respostaDeMentira = { ok: true, status: 200, text: () => Promise.resolve('{}') };
const contexto = vm.createContext({
  fetch: (url, opcoes) => { enviados.push({ url, ...opcoes }); return Promise.resolve(respostaDeMentira); },
  TextEncoder, TextDecoder, Response, JSON,
});
contexto.globalThis = contexto;
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'lib', 'pedido-ao-anki.js'), 'utf8'), contexto);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'e2e', 'variantes-do-pedido-ao-anki.js'), 'utf8'), contexto);
const { PedidoAoAnki, ConversaComOAnki, VariantesDoPedidoAoAnki } = contexto.PerpetualMiner;
contexto.PerpetualMiner.PareamentoComOAnki = {
  pedirAssinado: async (endereco, pedido, opcoes, enviar) => {
    const recebida = await enviar(endereco, pedido, pedido.corpo === undefined ? undefined : JSON.stringify(pedido.corpo), opcoes, { 'X-Assinatura': 'a' });
    return { status: recebida.status, texto: await recebida.text() };
  },
};
const conversa = ConversaComOAnki.criar({ endereco: 'http://127.0.0.1:8766', sinalDoPrazo: () => 'sinal' });

const CHAVE_DE_EXEMPLO = contrato.exemplos.find(e => e.pedido.caminho === '/ia/openai/chave').pedido.corpo.chave;
const BARALHOS = [{ deckName: 'Inglês', lang: 'en' }, { deckName: 'Alemão', lang: 'ru' }];
const ENVIO_DE_EXEMPLO = contrato.exemplos.find(e => e.daExtensao && e.pedido.caminho === '/jobs').pedido.corpo;

const CHAVE_DO_OUVIR = contrato.exemplos.find(e => e.pedido.corpo?.provedor === 'openai' && e.resposta.status === 200).contexto.chaveNaConexao;

const MASCARA_DA_CHAVE = { deckName: '<baralho>', deck: '<baralho>', chave: '<chave>', profile: '<perfil>', guid: '<guid>' };
const MASCARADAS_SE_TEXTO = new Set(['cliente', 'desafio', 'codigo', 'nome']);
function mascarar(chave, valor) {
  if (Object.hasOwn(MASCARA_DA_CHAVE, chave)) return MASCARA_DA_CHAVE[chave];
  return MASCARADAS_SE_TEXTO.has(chave) && typeof valor === 'string' ? `<${chave}>` : valor;
}
const formaDoCorpo = corpo => JSON.parse(JSON.stringify(corpo ?? null), mascarar);
const exemplosDa = pedido => contrato.exemplos.filter(e => exemploDaExtensao(e)
  && e.pedido.metodo === pedido.metodo && e.pedido.caminho === pedido.caminho
  && isDeepStrictEqual(formaDoCorpo(e.pedido.corpo), formaDoCorpo(pedido.corpo)));

function aResponseCruaNaoSaiDePedidoAoAnki() {
  assert.deepStrictEqual([PedidoAoAnki.pedir, PedidoAoAnki.ausenciaDaRota], [undefined, undefined],
    'a Response crua não sai mais de PedidoAoAnki: quem pede é ConversaComOAnki.pedir, que devolve o desfecho');
}

function asVariantesListamOPareamentoEOPerfil(variantes) {
  assert.ok(variantes.length >= 7, 'os construtores montam os pedidos de saúde, Baralhos, números (3 leituras) e vocabulário');
  const listaOPedido = caminho => variantes.some(({ pedido }) => pedido.caminho === caminho);
  for (const caminho of ['/pareamento/comecar', '/pareamento/concluir', '/pareamento/conferir']) {
    assert.ok(listaOPedido(caminho), `as variantes não listam o pedido ${caminho} do pareamento`);
  }
  for (const caminho of ['/anki/profiles', '/anki/profile', '/anki/profile/open']) {
    assert.ok(listaOPedido(caminho), `PedidoAoAnki.variantes não lista o pedido ${caminho} do perfil fixo`);
  }
}

function fakeProntoPara(pedido, exemplo) {
  const fake = criarFakeAnki();
  fake.abrirColecao('inglês com subbaralho');
  if (pedido.caminho.startsWith('/anki/profile')) fake.definirPerfis(['Ana', 'Beto'], { marcado: 'Ana', aberto: 'Ana' });
  if (pedido.corpo?.provedor === 'openai') fake.guardarChaveNaConexao(CHAVE_DO_OUVIR);
  if (pedido.caminho.startsWith('/atualizacao/')) fake.definirAtualizacao({ ankiweb: exemplo.contexto.ankiweb });
  return fake;
}

function aVarianteTemExemploEOFakeRespondeIgual({ nome, pedido: doContexto }) {
  const pedido = comoValores(doContexto);
  const exemplos = exemplosDa(pedido);
  assert.ok(exemplos.length > 0,
    `A extensão pede "${nome}" (${pedido.metodo} ${pedido.caminho} com ${JSON.stringify(pedido.corpo)}) e o contrato `
    + '(complemento/contrato/exemplos.json) não tem um exemplo desse pedido (daExtensao: true). Escreva o exemplo, '
    + 'com a resposta do complemento; os testes do complemento e o fake do e2e leem o mesmo arquivo.');
  if (pedido.caminho.startsWith('/pareamento/')) return;
  const { status } = fakeProntoPara(pedido, exemplos[0]).respostaDoContrato(pedido.metodo, pedido.caminho, pedido.corpo);
  assert.strictEqual(status, exemplos[0].resposta.status, `o fake respondeu "${nome}" diferente do exemplo "${exemplos[0].nome}"`);
}

async function aConversaMandaOPedidoAssinado() {
  enviados.length = 0;
  const atualizar = PedidoAoAnki.estatisticas(BARALHOS, { deNovo: true, abrirOAnki: true });
  assert.deepStrictEqual(comoValores(await conversa.pedir(atualizar)), { ok: true, status: 200, dados: {} });
  assert.deepStrictEqual(comoValores(enviados.map(({ url, method, headers, body, signal }) => ({ url, method, headers, body, signal }))), [{
    url: 'http://127.0.0.1:8766/anki/stats/decks',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Assinatura': 'a' },
    body: '{"decks":[{"deckName":"Inglês","lang":"en"},{"deckName":"Alemão","lang":"ru"}],"refresh":true,"launch":true}',
    signal: 'sinal',
  }]);
  enviados.length = 0;
  await conversa.pedir(PedidoAoAnki.saude());
  assert.deepStrictEqual(comoValores(enviados), [{ url: 'http://127.0.0.1:8766/health', method: 'GET', signal: 'sinal' }], 'o GET da saúde vai sem corpo nem cabeçalho');
  await assert.rejects(conversa.pedir({ metodo: 'POST', caminho: '/anki/stats/decks', corpo: { decks: [] } }), /não saiu de PedidoAoAnki/);
}

async function soOPareamentoVaiSemAssinatura() {
  enviados.length = 0;
  await PedidoAoAnki.enviarSemAssinatura('http://127.0.0.1:8766', PedidoAoAnki.conferirOPareamento('cliente', 'desafio'), { signal: 'sinal' });
  assert.deepStrictEqual(comoValores(enviados.map(({ url, method, headers, body }) => ({ url, method, headers, body }))),
    [{ url: 'http://127.0.0.1:8766/pareamento/conferir', method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"cliente":"cliente","desafio":"desafio"}' }],
    'o Pareamento manda os pedidos dele, que não levam assinatura');
  assert.throws(() => PedidoAoAnki.enviarSemAssinatura('http://127.0.0.1:8766', PedidoAoAnki.baralhos()), /só vai assinado/,
    'um pedido privado não sai sem assinatura, e a Response crua dele não chega a ninguém');
  assert.throws(() => PedidoAoAnki.enviarSemAssinatura('http://127.0.0.1:8766', { metodo: 'GET', caminho: '/health', semAssinatura: true }), /não saiu de PedidoAoAnki/);
  assert.deepStrictEqual(enviados.length, 1);
  assert.throws(() => PedidoAoAnki.estatisticas(BARALHOS, { deNovo: false, abrirOAnki: true }), /leitura dos números sem exemplo no contrato/);
}

function carregarOAbridor() {
  const doAbridor = vm.createContext({});
  doAbridor.globalThis = doAbridor;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'lib', 'abridor.js'), 'utf8'), doAbridor);
  return doAbridor.PerpetualMiner.Abridor;
}

function cadaMensagemAoAbridorTemExemplo() {
  const Abridor = carregarOAbridor();
  assert.strictEqual(Abridor.HOST, contrato.abridor.host, 'a extensão chama o host que a Conexão registra');
  const mensagens = Abridor.variantes();
  assert.ok(mensagens.length >= 1, 'a extensão manda ao menos o conferir');
  const exemplosDoAbridor = [...contrato.abridor.exemplos, ...contrato.conserto.exemplos].filter(e => e.daExtensao);
  for (const { nome, mensagem } of mensagens) {
    assert.ok(exemplosDoAbridor.some(e => isDeepStrictEqual(e.mensagem, comoValores(mensagem))),
      `A extensão manda ao abridor "${nome}" (${JSON.stringify(mensagem)}) e o contrato (complemento/contrato/exemplos.json › abridor) `
      + 'não tem um exemplo dela (daExtensao: true). Escreva o exemplo; o script de verdade e o fake do e2e leem o mesmo arquivo.');
  }
}

async function main() {
  aResponseCruaNaoSaiDePedidoAoAnki();
  const variantes = VariantesDoPedidoAoAnki.variantes(BARALHOS, CHAVE_DE_EXEMPLO, ENVIO_DE_EXEMPLO);
  asVariantesListamOPareamentoEOPerfil(variantes);
  for (const variante of variantes) aVarianteTemExemploEOFakeRespondeIgual(variante);
  await aConversaMandaOPedidoAssinado();
  await soOPareamentoVaiSemAssinatura();
  cadaMensagemAoAbridorTemExemplo();
  console.log('contrato fechado tests passed');
}

main().catch(erro => { console.error(erro); process.exit(1); });

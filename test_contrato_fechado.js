'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { isDeepStrictEqual } = require('util');

const { criarFakeAnki, exemploDaExtensao } = require('./e2e/fakes/anki');
const contrato = require('./complemento/contrato/carregar');

const enviados = [];
const comoValores = valor => JSON.parse(JSON.stringify(valor)); // os objetos do `vm` têm outro protótipo
const respostaDeMentira = { ok: true, status: 200, statusText: '', headers: new Map([['X-P', 'prova']]), arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) };
const contexto = vm.createContext({
  fetch: (url, opcoes) => { enviados.push({ url, ...opcoes }); return Promise.resolve(respostaDeMentira); },
  TextEncoder, TextDecoder, Response, JSON,
});
contexto.globalThis = contexto;
vm.runInContext(fs.readFileSync(path.join(__dirname, 'lib', 'pedido-ao-anki.js'), 'utf8'), contexto);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'e2e', 'variantes-do-pedido-ao-anki.js'), 'utf8'), contexto);
const { PedidoAoAnki, VariantesDoPedidoAoAnki } = contexto.PerpetualMiner;
contexto.PerpetualMiner.PareamentoComOAnki = {
  pedirAssinado: async (endereco, pedido, opcoes, enviar) => enviar(endereco, pedido, pedido.corpo === undefined ? undefined : JSON.stringify(pedido.corpo), opcoes, { 'X-Assinatura': 'a' }),
};

const CHAVE_DE_EXEMPLO = contrato.exemplos.find(e => e.pedido.caminho === '/ia/openai/chave').pedido.corpo.chave;
const BARALHOS = [{ deckName: 'Inglês', lang: 'en' }, { deckName: 'Alemão', lang: 'ru' }];
const ENVIO_DE_EXEMPLO = contrato.exemplos.find(e => e.daExtensao && e.pedido.caminho === '/jobs').pedido.corpo;

const CHAVE_DO_OUVIR = contrato.exemplos.find(e => e.pedido.corpo?.provedor === 'openai' && e.resposta.status === 200).contexto.chaveNaConexao;

const formaDoCorpo = corpo => JSON.parse(JSON.stringify(corpo ?? null), function (chave, valor) {
  return chave === 'deckName' || chave === 'deck' ? '<baralho>' : chave === 'chave' ? '<chave>' : chave === 'profile' ? '<perfil>' : chave === 'guid' ? '<guid>'
    : ['cliente', 'desafio', 'codigo', 'nome'].includes(chave) && typeof valor === 'string' ? `<${chave}>` : valor;
});
const exemplosDa = pedido => contrato.exemplos.filter(e => exemploDaExtensao(e)
  && e.pedido.metodo === pedido.metodo && e.pedido.caminho === pedido.caminho
  && isDeepStrictEqual(formaDoCorpo(e.pedido.corpo), formaDoCorpo(pedido.corpo)));

async function main() {
  assert.strictEqual(PedidoAoAnki.ausenciaDaRota(404), 'antiga');
  assert.strictEqual(PedidoAoAnki.ausenciaDaRota(500), 'falhou');
  assert.strictEqual(PedidoAoAnki.ausenciaDaRota(undefined), 'falhou');

  const variantes = VariantesDoPedidoAoAnki.variantes(BARALHOS, CHAVE_DE_EXEMPLO, ENVIO_DE_EXEMPLO);
  assert.ok(variantes.length >= 7, 'os construtores montam os pedidos de saúde, Baralhos, números (3 leituras) e vocabulário');
  for (const caminho of ['/pareamento/comecar', '/pareamento/concluir', '/pareamento/conferir']) {
    assert.ok(variantes.some(({ pedido }) => pedido.caminho === caminho), `as variantes não listam o pedido ${caminho} do pareamento`);
  }
  for (const caminho of ['/anki/profiles', '/anki/profile', '/anki/profile/open']) {
    assert.ok(variantes.some(({ pedido }) => pedido.caminho === caminho), `PedidoAoAnki.variantes não lista o pedido ${caminho} do perfil fixo`);
  }

  for (const { nome, pedido: doContexto } of variantes) {
    // O objeto vem de outro contexto do `vm`: uma cópia em JSON, para a comparação de objetos ser a de valores.
    const pedido = comoValores(doContexto);
    const exemplos = exemplosDa(pedido);
    assert.ok(exemplos.length > 0,
      `A extensão pede "${nome}" (${pedido.metodo} ${pedido.caminho} com ${JSON.stringify(pedido.corpo)}) e o contrato `
      + '(complemento/contrato/exemplos.json) não tem um exemplo desse pedido (daExtensao: true). Escreva o exemplo, '
      + 'com a resposta do complemento; os testes do complemento e o fake do e2e leem o mesmo arquivo.');

    if (pedido.caminho.startsWith('/pareamento/')) continue;
    const fake = criarFakeAnki();
    fake.abrirColecao('inglês com subbaralho');
    if (pedido.caminho.startsWith('/anki/profile')) fake.definirPerfis(['Ana', 'Beto'], { marcado: 'Ana', aberto: 'Ana' });
    if (pedido.corpo?.provedor === 'openai') fake.guardarChaveNaConexao(CHAVE_DO_OUVIR);
    if (pedido.caminho.startsWith('/atualizacao/')) fake.definirAtualizacao({ ankiweb: exemplos[0].contexto.ankiweb });
    const { status } = fake.respostaDoContrato(pedido.metodo, pedido.caminho, pedido.corpo);
    assert.strictEqual(status, exemplos[0].resposta.status, `o fake respondeu "${nome}" diferente do exemplo "${exemplos[0].nome}"`);
  }

  enviados.length = 0;
  const atualizar = PedidoAoAnki.estatisticas(BARALHOS, { deNovo: true, abrirOAnki: true });
  await PedidoAoAnki.pedir('http://127.0.0.1:8766', atualizar, { signal: 'sinal' });
  assert.deepStrictEqual(comoValores(enviados.map(({ url, method, headers, body, signal }) => ({ url, method, headers, body, signal }))), [{
    url: 'http://127.0.0.1:8766/anki/stats/decks',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Assinatura': 'a' },
    body: '{"decks":[{"deckName":"Inglês","lang":"en"},{"deckName":"Alemão","lang":"ru"}],"refresh":true,"launch":true}',
    signal: 'sinal',
  }]);
  enviados.length = 0;
  await PedidoAoAnki.pedir('http://127.0.0.1:8766', PedidoAoAnki.saude());
  assert.deepStrictEqual(comoValores(enviados), [{ url: 'http://127.0.0.1:8766/health', method: 'GET' }], 'o GET da saúde vai sem corpo nem cabeçalho');

  assert.throws(() => PedidoAoAnki.pedir('http://127.0.0.1:8766', { metodo: 'POST', caminho: '/anki/stats/decks', corpo: { decks: [] } }),
    /não saiu de PedidoAoAnki/);
  assert.throws(() => PedidoAoAnki.estatisticas(BARALHOS, { deNovo: false, abrirOAnki: true }), /leitura dos números sem exemplo no contrato/);

  const doAbridor = vm.createContext({});
  doAbridor.globalThis = doAbridor;
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'lib', 'abridor.js'), 'utf8'), doAbridor);
  const { Abridor } = doAbridor.PerpetualMiner;
  assert.strictEqual(Abridor.HOST, contrato.abridor.host, 'a extensão chama o host que a Conexão registra');
  const mensagens = Abridor.variantes();
  assert.ok(mensagens.length >= 1, 'a extensão manda ao menos o conferir');
  for (const { nome, mensagem } of mensagens) {
    assert.ok([...contrato.abridor.exemplos, ...contrato.conserto.exemplos].some(e => e.daExtensao && isDeepStrictEqual(e.mensagem, comoValores(mensagem))),
      `A extensão manda ao abridor "${nome}" (${JSON.stringify(mensagem)}) e o contrato (complemento/contrato/exemplos.json › abridor) `
      + 'não tem um exemplo dela (daExtensao: true). Escreva o exemplo; o script de verdade e o fake do e2e leem o mesmo arquivo.');
  }

  console.log('contrato fechado tests passed');
}

main().catch(erro => { console.error(erro); process.exit(1); });

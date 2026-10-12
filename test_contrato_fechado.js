'use strict';

// O contrato da Conexão com o Anki (complemento/contrato/exemplos.json) tem um exemplo de cada pedido que a
// extensão faz de verdade. Os pedidos não são copiados aqui: saem de `PerpetualMiner.PedidoAoAnki`
// (lib/pedido-ao-anki.js), o único que monta um pedido, e `variantes` lista todos. Foi o #190: Atualizar
// pedia os dois Baralhos, o contrato só tinha o de Inglês, e o complemento aceitava o que o fake recusava.
// Do lado do complemento, `complemento/test_servidor.py` exige um exemplo para cada resposta que o servidor real dá.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { isDeepStrictEqual } = require('util');

const { criarFakeAnki, exemploDaExtensao } = require('./e2e/fakes/anki');
const contrato = require('./complemento/contrato/exemplos.json');

// A lib como o service worker e as páginas a carregam: um script comum, com `fetch` à mão para ver o que sai.
const enviados = [];
const comoValores = valor => JSON.parse(JSON.stringify(valor)); // os objetos do `vm` têm outro protótipo
const contexto = vm.createContext({ fetch: (url, opcoes) => { enviados.push({ url, ...opcoes }); return Promise.resolve({ ok: true }); } });
contexto.globalThis = contexto;
vm.runInContext(fs.readFileSync(path.join(__dirname, 'lib', 'pedido-ao-anki.js'), 'utf8'), contexto);
const { PedidoAoAnki } = contexto.PerpetualMiner;

// Os dois Baralhos dos Ajustes de envio, um por idioma, como a tela de Baralhos e termos os pede.
// A chave que o exemplo do contrato entrega (o fake compara o corpo inteiro).
const CHAVE_DE_EXEMPLO = contrato.exemplos.find(e => e.pedido.caminho === '/ia/openai/chave').pedido.corpo.chave;
const BARALHOS = [{ deckName: 'Inglês', lang: 'en' }, { deckName: 'Alemão', lang: 'ru' }];
// O corpo de um Envio que o exemplo de criar entrega; o `jobId` dele é o que os outros pedidos do Envio levam.
const ENVIO_DE_EXEMPLO = contrato.exemplos.find(e => e.daExtensao && e.pedido.caminho === '/jobs').pedido.corpo;

// Um pedido é o mesmo para o contrato quando só o nome do Baralho muda: o resto do corpo (quantos Baralhos, `refresh`, `launch`) conta.
const formaDoCorpo = corpo => JSON.parse(JSON.stringify(corpo ?? null), function (chave, valor) {
  return chave === 'deckName' || chave === 'deck' ? '<baralho>' : chave === 'chave' ? '<chave>' : valor;
});
const exemplosDa = pedido => contrato.exemplos.filter(e => exemploDaExtensao(e)
  && e.pedido.metodo === pedido.metodo && e.pedido.caminho === pedido.caminho
  && isDeepStrictEqual(formaDoCorpo(e.pedido.corpo), formaDoCorpo(pedido.corpo)));

async function main() {
  const variantes = PedidoAoAnki.variantes(BARALHOS, CHAVE_DE_EXEMPLO, ENVIO_DE_EXEMPLO);
  assert.ok(variantes.length >= 7, 'os construtores montam os pedidos de saúde, Baralhos, números (3 leituras) e vocabulário');

  for (const { nome, pedido: doContexto } of variantes) {
    // O objeto vem de outro contexto do `vm`: uma cópia em JSON, para a comparação de objetos ser a de valores.
    const pedido = comoValores(doContexto);
    const exemplos = exemplosDa(pedido);
    assert.ok(exemplos.length > 0,
      `A extensão pede "${nome}" (${pedido.metodo} ${pedido.caminho} com ${JSON.stringify(pedido.corpo)}) e o contrato `
      + '(complemento/contrato/exemplos.json) não tem um exemplo desse pedido (daExtensao: true). Escreva o exemplo, '
      + 'com a resposta do complemento; os testes do complemento e o fake do e2e leem o mesmo arquivo.');

    // O fake responde o mesmo pedido, com o corpo exato, como o complemento responde: pelo exemplo.
    const fake = criarFakeAnki();
    fake.abrirColecao('inglês com subbaralho');
    const { status } = fake.respostaDoContrato(pedido.metodo, pedido.caminho, pedido.corpo);
    assert.strictEqual(status, exemplos[0].resposta.status, `o fake respondeu "${nome}" diferente do exemplo "${exemplos[0].nome}"`);
  }

  // `pedir` envia exatamente o que o construtor montou, e só isso.
  enviados.length = 0;
  const atualizar = PedidoAoAnki.estatisticas(BARALHOS, { deNovo: true, abrirOAnki: true });
  await PedidoAoAnki.pedir('http://127.0.0.1:8766', atualizar, { signal: 'sinal' });
  assert.deepStrictEqual(comoValores(enviados.map(({ url, method, headers, body, signal }) => ({ url, method, headers, body, signal }))), [{
    url: 'http://127.0.0.1:8766/anki/stats/decks',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"decks":[{"deckName":"Inglês","lang":"en"},{"deckName":"Alemão","lang":"ru"}],"refresh":true,"launch":true}',
    signal: 'sinal',
  }]);
  enviados.length = 0;
  await PedidoAoAnki.pedir('http://127.0.0.1:8766', PedidoAoAnki.saude());
  assert.deepStrictEqual(comoValores(enviados), [{ url: 'http://127.0.0.1:8766/health', method: 'GET' }], 'o GET da saúde vai sem corpo nem cabeçalho');

  // Um pedido montado à mão, ou uma leitura que o contrato não tem, não sai.
  assert.throws(() => PedidoAoAnki.pedir('http://127.0.0.1:8766', { metodo: 'POST', caminho: '/anki/stats/decks', corpo: { decks: [] } }),
    /não saiu de PedidoAoAnki/);
  assert.throws(() => PedidoAoAnki.estatisticas(BARALHOS, { deNovo: false, abrirOAnki: true }), /leitura dos números sem exemplo no contrato/);

  // O abridor (#147) não é HTTP, é Native Messaging, mas o contrato é o mesmo: cada mensagem que a extensão
  // manda nasce de `PerpetualMiner.Abridor` (lib/abridor.js), e o contrato tem um exemplo `daExtensao` de cada.
  const doAbridor = vm.createContext({});
  doAbridor.globalThis = doAbridor;
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'lib', 'abridor.js'), 'utf8'), doAbridor);
  const { Abridor } = doAbridor.PerpetualMiner;
  assert.strictEqual(Abridor.HOST, contrato.abridor.host, 'a extensão chama o host que a Conexão registra');
  const mensagens = Abridor.variantes();
  assert.ok(mensagens.length >= 1, 'a extensão manda ao menos o conferir');
  for (const { nome, mensagem } of mensagens) {
    assert.ok(contrato.abridor.exemplos.some(e => e.daExtensao && isDeepStrictEqual(e.mensagem, comoValores(mensagem))),
      `A extensão manda ao abridor "${nome}" (${JSON.stringify(mensagem)}) e o contrato (complemento/contrato/exemplos.json › abridor) `
      + 'não tem um exemplo dela (daExtensao: true). Escreva o exemplo; o script de verdade e o fake do e2e leem o mesmo arquivo.');
  }

  console.log('contrato fechado tests passed');
}

main().catch(erro => { console.error(erro); process.exit(1); });

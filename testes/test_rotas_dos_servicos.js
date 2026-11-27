'use strict';

const assert = require('assert');
const { criarRotasDosServicos } = require('../e2e/fakes/rotas-dos-servicos');

function montar({ itemLigado = true, statusDoItem = 200 } = {}) {
  const estado = { contexto: { itemDeLogin: 'desligado', outro: 1 }, perdaDaRespostaDoItem: null, agora: () => new Date('2026-11-27T12:00:00Z'), registrosDeCusto: new Map() };
  const chamadas = [];
  const chatgpt = { naConexao: (route, url, respostaDoContrato) => { chamadas.push(['chatgpt', url.pathname, respostaDoContrato.name]); return 'do-chatgpt'; } };
  const voz = { naConexao: (dados, respostaDoContrato, caminho) => { chamadas.push(['voz', dados, caminho, respostaDoContrato.name]); return { status: 202, json: { voz: caminho } }; } };
  function respostaDoContrato(metodo, caminho, corpo) {
    chamadas.push(['contrato', metodo, caminho, corpo]);
    return { status: statusDoItem, json: { ligado: itemLigado, de: caminho } };
  }
  const { rotas, api } = criarRotasDosServicos({ estado, chatgpt, voz, respostaDoContrato });
  return { estado, chamadas, rotas, api };
}

function pedir(rotas, metodo, caminho, { corpo, dados } = {}) {
  const respostas = [];
  const route = { abort: motivo => { respostas.push(['abort', motivo]); return 'abortado'; } };
  const req = { method: () => metodo, postData: () => (corpo === undefined ? null : JSON.stringify(corpo)) };
  const pedidoDaRota = { req, url: new URL(`http://127.0.0.1:8766${caminho}`), route, dados, responder: (status, json) => { respostas.push(['responder', status, json]); return 'respondido'; } };
  for (const rota of rotas) {
    const resultado = rota(pedidoDaRota);
    if (resultado) return { feito: resultado.feito, respostas };
  }
  return { feito: undefined, respostas };
}

const CASOS = [];
const caso = (nome, corpo) => CASOS.push({ nome, corpo });

caso('o POST em /ia/chatgpt/ e o GET em /auth/callback vão ao fake do ChatGPT; os outros métodos passam', () => {
  const { rotas, chamadas } = montar();
  assert.strictEqual(pedir(rotas, 'POST', '/ia/chatgpt/entrar').feito, 'do-chatgpt');
  assert.strictEqual(pedir(rotas, 'POST', '/ia/chatgpt/sair').feito, 'do-chatgpt');
  assert.strictEqual(pedir(rotas, 'GET', '/auth/callback').feito, 'do-chatgpt');
  assert.deepStrictEqual(chamadas.map(([quem, caminho]) => [quem, caminho]), [['chatgpt', '/ia/chatgpt/entrar'], ['chatgpt', '/ia/chatgpt/sair'], ['chatgpt', '/auth/callback']]);
  for (const [metodo, caminho] of [['GET', '/ia/chatgpt/entrar'], ['POST', '/auth/callback'], ['POST', '/ia/chatgptx']]) assert.strictEqual(pedir(rotas, metodo, caminho).feito, undefined, `${metodo} ${caminho}`);
});

caso('o POST em /voz/ responde o que o fake da voz diz, com o corpo (ou {}) e o caminho', () => {
  const { rotas, chamadas } = montar();
  const { respostas } = pedir(rotas, 'POST', '/voz/ouvir', { dados: { texto: 'oi' } });
  assert.deepStrictEqual(respostas, [['responder', 202, { voz: '/voz/ouvir' }]]);
  pedir(rotas, 'POST', '/voz/ouvir');
  assert.deepStrictEqual(chamadas.map(c => c.slice(0, 3)), [['voz', { texto: 'oi' }, '/voz/ouvir'], ['voz', {}, '/voz/ouvir']]);
  assert.strictEqual(pedir(rotas, 'GET', '/voz/ouvir').feito, undefined);
});

caso('o POST em /ia/estado responde o exemplo do contrato com o corpo vazio', () => {
  const { rotas, chamadas } = montar();
  const { respostas } = pedir(rotas, 'POST', '/ia/estado');
  assert.deepStrictEqual(respostas, [['responder', 200, { ligado: true, de: '/ia/estado' }]]);
  assert.deepStrictEqual(chamadas, [['contrato', 'POST', '/ia/estado', {}]]);
  assert.strictEqual(pedir(rotas, 'GET', '/ia/estado').feito, undefined);
});

caso('o POST em /ia/termos responde o exemplo da linha pedida; a recusa vale para qualquer linha e a linha sem exemplo, quando a Conexão responderia, quebra', () => {
  const pedidas = [];
  const exemplos = { "She can't put up with him": { status: 200, json: { termos: ['put up with'], pagou: 'chave' } } };
  const parado = { status: 409, json: { error: 'openai_key_missing' } };
  let situacao = 'chave';
  function respostaDoContrato(metodo, caminho, corpo) {
    pedidas.push(corpo.texto);
    const exemplo = situacao === 'parado' ? parado : exemplos[corpo.texto];
    if (!exemplo) throw new Error('sem exemplo');
    return exemplo;
  }
  const estado = { agora: () => new Date('2026-11-27T12:00:00Z'), registrosDeCusto: new Map() };
  const { rotas, api } = criarRotasDosServicos({ estado, chatgpt: {}, voz: {}, respostaDoContrato });
  const termos = texto => pedir(rotas, 'POST', '/ia/termos', { dados: { lang: 'en', texto } }).respostas;
  assert.deepStrictEqual(termos("She can't put up with him"), [['responder', 200, { termos: ['put up with'], pagou: 'chave' }]]);
  assert.deepStrictEqual(api.custosDosTermos(), [['termos-en-2026-11', [{ date: '2026-11-27T12:00:00.000Z', type: 'terms_tokens', cost_usd: 0.000081 }]]]);
  assert.throws(() => termos('Outra linha'), /sem exemplo/);
  situacao = 'parado';
  assert.deepStrictEqual(termos('Outra linha'), [['responder', 409, { error: 'openai_key_missing' }]]);
  assert.strictEqual(api.custosDosTermos().length, 1);
  assert.strictEqual(pedir(rotas, 'GET', '/ia/termos').feito, undefined);
});

caso('o item de login: a resposta do contrato vale e, se é 200, o contexto passa a ligado ou desligado', () => {
  const ligando = montar({ itemLigado: true });
  const { respostas } = pedir(ligando.rotas, 'POST', '/abrir-com-o-computador', { corpo: { ligar: true } });
  assert.deepStrictEqual(respostas, [['responder', 200, { ligado: true, de: '/abrir-com-o-computador' }]]);
  assert.deepStrictEqual(ligando.chamadas, [['contrato', 'POST', '/abrir-com-o-computador', { ligar: true }]]);
  assert.deepStrictEqual(ligando.estado.contexto, { itemDeLogin: 'ligado', outro: 1 });
  const desligando = montar({ itemLigado: false });
  desligando.api.definirItemDeLogin('ligado');
  pedir(desligando.rotas, 'POST', '/abrir-com-o-computador', { corpo: {} });
  assert.deepStrictEqual(desligando.estado.contexto, { itemDeLogin: 'desligado', outro: 1 });
});

caso('o item de login com resposta que não é 200 não mexe no contexto, e a de /estado nunca mexe', () => {
  const recusado = montar({ statusDoItem: 409 });
  const { respostas } = pedir(recusado.rotas, 'POST', '/abrir-com-o-computador', { corpo: {} });
  assert.strictEqual(respostas[0][1], 409);
  assert.strictEqual(recusado.estado.contexto.itemDeLogin, 'desligado');
  const estado = montar({ itemLigado: true });
  pedir(estado.rotas, 'POST', '/abrir-com-o-computador/estado');
  assert.deepStrictEqual(estado.chamadas, [['contrato', 'POST', '/abrir-com-o-computador/estado', undefined]]);
  assert.strictEqual(estado.estado.contexto.itemDeLogin, 'desligado');
  assert.strictEqual(pedir(estado.rotas, 'GET', '/abrir-com-o-computador').feito, undefined);
});

caso('a resposta perdida do item: aborta com connectionreset uma vez só, e só no pedido principal', () => {
  const aplicada = montar();
  aplicada.api.perderARespostaDoItemDeLogin({ aplicada: true });
  const { respostas } = pedir(aplicada.rotas, 'POST', '/abrir-com-o-computador', { corpo: {} });
  assert.deepStrictEqual(respostas, [['abort', 'connectionreset']]);
  assert.strictEqual(aplicada.estado.perdaDaRespostaDoItem, null);
  assert.strictEqual(aplicada.estado.contexto.itemDeLogin, 'ligado');
  assert.strictEqual(pedir(aplicada.rotas, 'POST', '/abrir-com-o-computador', { corpo: {} }).respostas[0][0], 'responder');
  const naoAplicada = montar();
  naoAplicada.api.perderARespostaDoItemDeLogin({ aplicada: false });
  const { respostas: perdidas } = pedir(naoAplicada.rotas, 'POST', '/abrir-com-o-computador', { corpo: {} });
  assert.deepStrictEqual(perdidas, [['abort', 'connectionreset']]);
  assert.deepStrictEqual(naoAplicada.chamadas, []);
  assert.strictEqual(naoAplicada.estado.contexto.itemDeLogin, 'desligado');
  const estado = montar();
  estado.api.perderARespostaDoItemDeLogin({ aplicada: true });
  assert.strictEqual(pedir(estado.rotas, 'POST', '/abrir-com-o-computador/estado').respostas[0][0], 'responder');
  assert.deepStrictEqual(estado.estado.perdaDaRespostaDoItem, { aplicada: true });
});

caso('a api diz o item de login e se ele está instalado (só quando ligado)', () => {
  const { api, estado } = montar();
  assert.deepStrictEqual([api.itemDeLogin(), api.itemInstalado()], ['desligado', false]);
  api.definirItemDeLogin('ligado');
  assert.deepStrictEqual([api.itemDeLogin(), api.itemInstalado(), estado.contexto.outro], ['ligado', true, 1]);
  api.definirItemDeLogin('quebrado');
  assert.deepStrictEqual([api.itemDeLogin(), api.itemInstalado()], ['quebrado', false]);
});

caso('as rotas vêm nesta ordem: ChatGPT, voz, estado da IA, Termos da linha, item de login', () => {
  const { rotas } = montar();
  assert.strictEqual(rotas.length, 5);
  const quemAtende = (metodo, caminho) => rotas.findIndex(rota => rota({ req: { method: () => metodo, postData: () => null }, url: new URL(`http://x${caminho}`), route: { abort() {} }, dados: {}, responder: () => 1 }));
  assert.deepStrictEqual([['POST', '/ia/chatgpt/entrar'], ['POST', '/voz/x'], ['POST', '/ia/estado'], ['POST', '/ia/termos'], ['POST', '/abrir-com-o-computador']].map(([m, c]) => quemAtende(m, c)), [0, 1, 2, 3, 4]);
});

for (const { nome, corpo } of CASOS) {
  try {
    corpo();
  } catch (erro) {
    console.error(`falhou: ${nome}`);
    throw erro;
  }
}
console.log(`test_rotas_dos_servicos: ${CASOS.length} casos ok`);

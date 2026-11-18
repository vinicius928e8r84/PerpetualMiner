'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const contrato = require('./complemento/contrato/carregar');
const { ENDERECO, criarConexao, resposta, carregarAPagina, igual, parearComChaveGuardada } = require('./e2e/pagina-de-mentira-do-pareamento');

globalThis.PerpetualMiner = {};
require('./lib/pedido-ao-anki.js');
require('./e2e/variantes-do-pedido-ao-anki.js');
const { PedidoAoAnki, ConversaComOAnki, VariantesDoPedidoAoAnki } = globalThis.PerpetualMiner;

const MOTIVO_NO_CONTRATO = {
  a_parear: ['401 pairing_invalid', '401 pairing_required', '401 pairing_revoked'],
  antiga: ['404 not_found'],
  anki_ocupado: [
    '503 anki_browse_unavailable', '503 anki_card_front_unavailable', '503 anki_card_preview_unavailable', '503 anki_decks_unavailable',
    '503 anki_note_types_unavailable', '503 anki_stats_unavailable', '503 anki_vocabulary_unavailable',
  ],
};

const ENVIO_DE_EXEMPLO = contrato.exemplos.find(e => e.daExtensao && e.pedido.caminho === '/jobs').pedido.corpo;
const variantes = VariantesDoPedidoAoAnki.variantes([{ deckName: 'Inglês', lang: 'en' }], 'sk-proj-de-exemplo', ENVIO_DE_EXEMPLO);
const UM_PEDIDO_QUALQUER = PedidoAoAnki.tiposDeNota();
const pedidoDaRota = ({ metodo, caminho }) => variantes.find(v => v.pedido.metodo === metodo && v.pedido.caminho === caminho)?.pedido || UM_PEDIDO_QUALQUER;

const respondendo = (status, texto) => ConversaComOAnki.criar({ transporte: async () => ({ status, texto }) });
const falhando = erro => ConversaComOAnki.criar({ transporte: async () => { throw erro; } });

function esperadoDoExemplo({ status, json }) {
  if (status >= 200 && status < 300) return { ok: true, status, dados: json };
  const resposta = `${status} ${json.error}`;
  return {
    ok: false,
    motivo: Object.keys(MOTIVO_NO_CONTRATO).find(motivo => MOTIVO_NO_CONTRATO[motivo].includes(resposta)) || 'recusado',
    codigo: json.error,
    status,
    dados: json,
    detalhes: [`HTTP ${status}`, json.error, json.detail].filter(Boolean).join(' · '),
  };
}

async function cadaExemploDoContratoTemOSeuDesfecho() {
  const vistas = new Set();
  for (const exemplo of contrato.exemplos) {
    const { status, json } = exemplo.resposta;
    vistas.add(`${status} ${json.error}`);
    const desfecho = await respondendo(status, JSON.stringify(json)).pedir(pedidoDaRota(exemplo.pedido));
    assert.deepStrictEqual(desfecho, esperadoDoExemplo(exemplo.resposta), `o exemplo "${exemplo.nome}" do contrato (${exemplo.pedido.metodo} ${exemplo.pedido.caminho} → ${status})`);
  }
  assert.ok(contrato.exemplos.length >= 307, 'a tabela são todos os exemplos do contrato');
  for (const resposta of Object.values(MOTIVO_NO_CONTRATO).flat()) {
    assert.ok(vistas.has(resposta), `"${resposta}" está em MOTIVO_NO_CONTRATO e nenhum exemplo do contrato a responde mais: tire-a daqui`);
  }
  const comDetalhe = new Set(contrato.exemplos.filter(e => e.resposta.status === 503 && typeof e.resposta.json.detail === 'string').map(e => `503 ${e.resposta.json.error}`));
  assert.deepStrictEqual([...comDetalhe].sort(), MOTIVO_NO_CONTRATO.anki_ocupado, 'o Anki ocupado é o 503 que diz o motivo no detail (sem coleção, sem responder, sincronizando)');
}

async function oPrazoEAFaltaDeResposta() {
  const prazos = [];
  const sinais = [];
  const relogio = [];
  const conversa = ConversaComOAnki.criar({
    sinalDoPrazo: ms => {
      prazos.push(ms);
      relogio.push(new AbortController());
      return relogio.at(-1).signal;
    },
    transporte: (pedido, sinal) => new Promise((resolver, rejeitar) => {
      sinais.push(sinal);
      sinal.addEventListener('abort', () => rejeitar(sinal.reason));
    }),
  });

  const semPrazoDito = conversa.pedir(PedidoAoAnki.baralhos());
  const comPrazoDito = conversa.pedir(PedidoAoAnki.atualizarAConexao(), { prazoMs: 60000 });
  const daVoz = [
    conversa.pedir(PedidoAoAnki.ouvirAVoz('en', 'google', 'co.uk')),
    conversa.pedir(PedidoAoAnki.ouvirAVoz('en', 'openai')),
    conversa.pedir(PedidoAoAnki.falarAFrase('en', 'co.uk', 'Could you tell me where the nearest pharmacy is?')),
    conversa.pedir(PedidoAoAnki.falarAFrase('en', 'co.uk', 'Hi'), { prazoMs: 3000 }),
  ];
  await new Promise(setImmediate);
  assert.deepStrictEqual(prazos.slice(0, 2), [ConversaComOAnki.PRAZO_PADRAO_MS, 60000], 'todo pedido sai com prazo: o padrão, ou o que o chamador disser');
  assert.strictEqual(ConversaComOAnki.PRAZO_PADRAO_MS, 15000);
  assert.deepStrictEqual(prazos.slice(2), [20000, 20000, 20000, 3000],
    'a voz espera mais que os 15 s que a Conexão dá ao Google e à OpenAI (TEMPO_DE_CADA_PEDIDO): quem diz que a voz não veio é ela; o chamador ainda pode dizer outro prazo');
  assert.deepStrictEqual(sinais, relogio.map(c => c.signal), 'o transporte recebe o sinal do prazo');
  relogio.forEach(controle => controle.abort(new DOMException('The operation timed out.', 'TimeoutError')));
  for (const desfecho of [await semPrazoDito, await comPrazoDito, ...await Promise.all(daVoz)]) {
    assert.deepStrictEqual(desfecho, { ok: false, motivo: 'sem_resposta', codigo: 'prazo', status: null, dados: null, detalhes: 'The operation timed out.' });
  }

  assert.deepStrictEqual(await falhando(new TypeError('Failed to fetch')).pedir(PedidoAoAnki.baralhos()),
    { ok: false, motivo: 'sem_resposta', codigo: 'rede', status: null, dados: null, detalhes: 'Failed to fetch' });
}

async function aRespostaForaDoContrato() {
  const pedido = PedidoAoAnki.tiposDeNota();
  for (const texto of ['<html>não é JSON</html>', '', '[]', 'null', '"texto"', '{"noteTypes":']) {
    assert.deepStrictEqual(await respondendo(200, texto).pedir(pedido),
      { ok: false, motivo: 'invalida', codigo: 'json_quebrado', status: 200, dados: null, detalhes: 'HTTP 200 · json_quebrado' }, `um 200 com ${JSON.stringify(texto)}`);
  }

  const comLista = { formato: dados => Array.isArray(dados.noteTypes) };
  assert.deepStrictEqual(await respondendo(200, '{"noteTypes":[]}').pedir(pedido, comLista), { ok: true, status: 200, dados: { noteTypes: [] } });
  assert.deepStrictEqual(await respondendo(200, '{"noteTypes":"nenhum"}').pedir(pedido, comLista),
    { ok: false, motivo: 'invalida', codigo: 'fora_do_formato', status: 200, dados: { noteTypes: 'nenhum' }, detalhes: 'HTTP 200 · fora_do_formato' });
  const recusa = await respondendo(503, '{"error":"anki_note_types_unavailable","detail":"anki_busy"}').pedir(pedido, { formato: () => assert.fail('o formato só confere a resposta aceita') });
  assert.strictEqual(recusa.motivo, 'anki_ocupado');

  assert.deepStrictEqual(await respondendo(500, 'Internal Server Error').pedir(pedido),
    { ok: false, motivo: 'recusado', codigo: null, status: 500, dados: null, detalhes: 'HTTP 500' }, 'uma recusa sem JSON segue sendo recusa, sem código');
  assert.strictEqual((await respondendo(404, 'Not Found').pedir(pedido)).motivo, 'antiga', 'o 404 sem código é de quem não conhece a rota');
  assert.strictEqual((await respondendo(404, '{"error":"job_not_found"}').pedir(pedido)).motivo, 'recusado', 'o 404 com código do contrato é a recusa da rota');
  assert.strictEqual((await respondendo(503, '{"error":"models_unavailable"}').pedir(pedido)).motivo, 'recusado', 'o 503 sem detail não é o Anki ocupado');
  assert.strictEqual((await respondendo(401, '{"error":"openai_key_rejected"}').pedir(pedido)).motivo, 'recusado', 'o 401 da OpenAI não é o Pareamento');
}

async function soOPedidoDeUmConstrutor() {
  let pedidos = 0;
  const conversa = ConversaComOAnki.criar({ transporte: async () => { pedidos += 1; return { status: 200, texto: '{}' }; } });
  await assert.rejects(conversa.pedir({ metodo: 'POST', caminho: '/anki/note-types', corpo: {} }), /não saiu de PedidoAoAnki/);
  assert.strictEqual(pedidos, 0, 'o pedido escrito à mão é erro de quem chama, não um desfecho, e nem sai');
}

async function peloHttpAssinado() {
  {
    const conexao = criarConexao();
    const pagina = carregarAPagina(conexao);
    await parearComChaveGuardada(pagina);
    const conversa = pagina.Conversa.criar({ endereco: ENDERECO });
    igual(await conversa.pedir(pagina.PedidoAoAnki.estadoDaIA()), { ok: true, status: 200, dados: { ok: true, caminho: '/ia/estado' } });
    assert.ok(conexao.vistos.at(-1).cabecalhos['x-perpetualminer-assinatura'], 'o pedido da conversa vai assinado');

    const original = conexao.fetch;
    conexao.fetch = async (url, opcoes) => {
      const recebida = await original(url, opcoes);
      return new URL(url).pathname === '/ia/estado' ? new Response(recebida.body, { status: recebida.status }) : recebida;
    };
    const semProva = await conversa.pedir(pagina.PedidoAoAnki.estadoDaIA());
    igual([semProva.ok, semProva.motivo, semProva.codigo, semProva.status, semProva.dados], [false, 'sem_resposta', 'sem_prova', null, null]);
    assert.match(semProva.detalhes, /prova/);
    assert.strictEqual(pagina.Pareamento.estado(), 'nao_confirmada');

    conexao.fetch = async () => { throw new TypeError('Failed to fetch'); };
    igual(await conversa.pedir(pagina.PedidoAoAnki.estadoDaIA()), { ok: false, motivo: 'sem_resposta', codigo: 'rede', status: null, dados: null, detalhes: 'Failed to fetch' });
  }
  {
    const conexao = criarConexao({ impostor: async ({ caminho }) => (caminho === '/health'
      ? resposta(200, { ok: true, versao: '0.4.25', perfil: 'X' })
      : resposta(200, { sessao: 'a'.repeat(32), prova: 'AAAA'.repeat(10) + 'AAA=' })) });
    const pagina = carregarAPagina(conexao);
    await parearComChaveGuardada(pagina);
    const desfecho = await pagina.Conversa.criar({ endereco: ENDERECO }).pedir(pagina.PedidoAoAnki.estadoDaIA());
    igual([desfecho.motivo, desfecho.codigo], ['sem_resposta', 'sem_prova'], 'quem não prova ter o segredo não respondeu');
    igual(conexao.vistos.map(v => v.caminho), ['/pareamento/conferir'], 'e não recebe o pedido');
  }
  {
    const conexao = criarConexao({ navegadores: [] });
    const pagina = carregarAPagina(conexao);
    igual(await pagina.Conversa.criar({ endereco: ENDERECO }).pedir(pagina.PedidoAoAnki.estadoDaIA()),
      { ok: false, motivo: 'a_parear', codigo: 'pairing_required', status: 401, dados: { error: 'pairing_required' }, detalhes: 'HTTP 401 · pairing_required' });
    igual(conexao.vistos.map(v => v.caminho), ['/pareamento/conferir'], 'sem credencial o pedido não sai');
    assert.strictEqual(pagina.Pareamento.estado(), 'a_parear');
  }
  {
    const conexao = criarConexao({ antiga: true });
    const pagina = carregarAPagina(conexao);
    await parearComChaveGuardada(pagina);
    const desfecho = await pagina.Conversa.criar({ endereco: ENDERECO }).pedir(pagina.PedidoAoAnki.atualizarAConexao());
    igual([desfecho.ok, desfecho.motivo, desfecho.codigo, desfecho.status], [false, 'antiga', 'not_found', 404]);
  }
}

async function ondeNaoHaConexaoAnki() {
  const conexao = criarConexao();
  const enderecos = new Set();
  const original = conexao.fetch;
  conexao.fetch = (url, opcoes) => {
    enderecos.add(new URL(url).origin);
    return original(url, opcoes);
  };
  const servico = carregarAPagina(conexao);
  await parearComChaveGuardada(servico);
  igual(await servico.Conversa.pedir(servico.PedidoAoAnki.estadoDaIA()), { ok: true, status: 200, dados: { ok: true, caminho: '/ia/estado' } },
    'o service worker carrega lib/pedido-ao-anki.js sem lib/conexao-anki.js, e a conversa da extensão responde lá também');
  assert.strictEqual(servico.Conversa.ENDERECO, ENDERECO);
  assert.deepStrictEqual([...enderecos], [ENDERECO], 'todo pedido da conversa da extensão vai ao endereço da Conexão');
}

function oEnderecoCarregaAntesDeQuemOLe() {
  for (const pagina of ['painel.html', 'popup.html']) {
    const html = fs.readFileSync(path.join(__dirname, pagina), 'utf8');
    const lugar = arquivo => html.indexOf(`<script src="lib/${arquivo}"></script>`);
    assert.ok(lugar('pedido-ao-anki.js') >= 0 && lugar('pedido-ao-anki.js') < lugar('conexao-anki.js'),
      `${pagina}: lib/pedido-ao-anki.js (o endereço da Conexão) carrega antes de lib/conexao-anki.js, que o lê ao carregar`);
  }
}

async function main() {
  oEnderecoCarregaAntesDeQuemOLe();
  await cadaExemploDoContratoTemOSeuDesfecho();
  await oPrazoEAFaltaDeResposta();
  await aRespostaForaDoContrato();
  await soOPedidoDeUmConstrutor();
  await peloHttpAssinado();
  await ondeNaoHaConexaoAnki();
  console.log('conversa com o Anki tests passed');
}

main().catch(erro => { console.error(erro); process.exit(1); });

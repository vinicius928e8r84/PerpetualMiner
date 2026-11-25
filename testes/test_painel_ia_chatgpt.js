'use strict';

const assert = require('assert');

const { prepararAPagina, noComId, esperar } = require('./painel_de_mentira.js');

const { documento, raiz } = prepararAPagina();
require('../lib/pedido-ao-anki.js');
const { textoDaVoz } = raiz;

const seguidores = [];
const pedidos = [];
const releituras = [];
const campos = [];
const avisos = [];
const fila = { estado: [], sair: [] };
const ROTAS = { '/ia/chatgpt/estado': 'estado', '/ia/chatgpt/sair': 'sair' };
const LOGIN = { conectada: { status: 200, dados: { conectada: true } }, nenhum: { status: 200, dados: { conectada: false } }, acabou: { status: 200, dados: { conectada: false, acabou: 'chatgpt_signed_out' } } };

raiz.ConexaoAnki = {
  SITUACAO: { CONECTANDO: 'conectando', LIGADA: 'ligada', DESLIGADA: 'desligada' },
  acompanhar: seguidor => seguidores.push(seguidor),
  situacao: () => 'ligada',
};
raiz.Veio = { ...raiz.Veio, mostrarToastDeSucesso: texto => avisos.push(texto) };
raiz.ModeloDosCartoes = { reler: () => releituras.push('reler') };
raiz.CartaoDaIA = { temChave: () => true, baixarConexao: () => {} };
raiz.ConversaComOAnki = {
  ...raiz.ConversaComOAnki,
  pedir: async pedido => {
    const rota = ROTAS[pedido.caminho];
    pedidos.push(rota);
    return fila[rota].shift();
  },
};
globalThis.chrome.storage.local.get = (padrao, quando) => quando({ pm_plano_do_chatgpt_avisado: true });
globalThis.chrome.tabs = { create: () => {} };
globalThis.addEventListener = () => {};
globalThis.window = { addEventListener() {}, open() {} };

const lugar = { prefixo: 'cfg' };
const campo = noComId(documento, 'cfg-ia-campo');
campo.focus = () => campos.push('foco');

require('../painel/painel-ia-chatgpt.js');
documento.disparar('DOMContentLoaded');
const coluna = raiz.ColunaDoChatGPT.coluna(lugar);
documento.body.append(coluna);

const botoes = () => coluna.querySelectorAll('button').map(botao => botao.textContent);
const botao = rotulo => coluna.querySelectorAll('button').find(b => b.textContent === rotulo)
  || raiz.ColunaDoChatGPT.faixa(lugar).querySelectorAll('button').find(b => b.textContent === rotulo);
const faixa = () => raiz.ColunaDoChatGPT.faixa(lugar).textContent;
const toasts = () => avisos.slice();
const feitos = () => pedidos.splice(0);

async function entrarNaTelaCom(login) {
  fila.estado.push(LOGIN[login]);
  seguidores[0]('ligada');
  await esperar();
  assert.deepStrictEqual(feitos(), ['estado']);
}

async function sairDe(resposta, depois = LOGIN.nenhum) {
  fila.sair.push(resposta);
  fila.estado.push(depois);
  botao(textoDaVoz('CFG-35.chatgptSair')).disparar('click');
  await esperar();
  await esperar();
}

async function sairComARevogacaoMostraOAvisoEOEstadoNovo() {
  await entrarNaTelaCom('conectada');
  assert.ok(botoes().includes(textoDaVoz('CFG-35.chatgptSair')));
  await sairDe({ status: 200, dados: { ok: true, revogada: true } });
  assert.deepStrictEqual(feitos(), ['sair', 'estado']);
  assert.deepStrictEqual(toasts(), [textoDaVoz('CFG-35.chatgptSaiu')]);
  assert.strictEqual(faixa(), '');
  assert.deepStrictEqual(botoes(), [textoDaVoz('CFG-35.chatgptBotao')]);
}

async function sairSemRevogacaoDizQueOChatGPTNaoConfirmou() {
  await entrarNaTelaCom('conectada');
  await sairDe({ status: 200, dados: { ok: true, revogada: false } }, LOGIN.conectada);
  assert.deepStrictEqual(feitos(), ['sair', 'estado']);
  assert.deepStrictEqual(toasts(), [textoDaVoz('CFG-35.chatgptSaiu')], 'o aviso da saída anterior segue na tela, o novo não aparece');
  assert.ok(faixa().includes(textoDaVoz('CFG-35.erroChatgptSemRevogar')), faixa());
  assert.ok(faixa().includes('revogada: false'), faixa());
  assert.ok(botoes().includes(textoDaVoz('CFG-35.chatgptSair')));
}

async function cadaRespostaQueNaoDizOkViraAFaixaDoPedido() {
  const casos = [
    ['ok falso', { status: 200, dados: { ok: false } }, 'CFG-35.erroChatgptFalhou', 'HTTP 200'],
    ['sem corpo', { status: 200, dados: null }, 'CFG-35.erroChatgptFalhou', 'HTTP 200'],
    ['erro do servidor', { status: 500, dados: { error: 'internal_error' } }, 'CFG-35.erroChatgptFalhou', 'HTTP 500 · internal_error'],
    ['Conexão antiga', { status: 404, dados: null }, 'CFG-35.erroChatgptAntiga', 'HTTP 404'],
    ['sem resposta', { status: null, dados: null }, 'CFG-35.erroChatgptSemConexao', 'sem resposta'],
  ];
  for (const [nome, resposta, voz, detalhe] of casos) {
    await entrarNaTelaCom('conectada');
    fila.sair.push(resposta);
    botao(textoDaVoz('CFG-35.chatgptSair')).disparar('click');
    await esperar();
    assert.deepStrictEqual(feitos(), ['sair'], nome);
    assert.ok(faixa().includes(textoDaVoz(voz)), `${nome}: ${faixa()}`);
    assert.ok(faixa().includes(detalhe), `${nome}: ${faixa()}`);
    assert.ok(botoes().includes(textoDaVoz('CFG-35.chatgptSair')), nome);
  }
}

async function doisCliquesSeguidosPedemUmaSaidaSo() {
  await entrarNaTelaCom('conectada');
  fila.sair.push({ status: 200, dados: { ok: true, revogada: true } });
  fila.estado.push(LOGIN.nenhum);
  const sair = botao(textoDaVoz('CFG-35.chatgptSair'));
  sair.disparar('click');
  sair.disparar('click');
  await esperar();
  await esperar();
  assert.deepStrictEqual(feitos(), ['sair', 'estado']);
}

async function usarAChaveDoLoginQueAcabouSaiSemAvisarOCampoRecebeOFoco() {
  const toastsAntes = toasts().length;
  await entrarNaTelaCom('acabou');
  assert.ok(faixa().includes(textoDaVoz('CFG-46.acabou')), faixa());
  fila.sair.push({ status: 200, dados: { ok: true, revogada: true } });
  fila.estado.push(LOGIN.nenhum);
  botao(textoDaVoz('CFG-35.erroChatgptUsarChave')).disparar('click');
  await esperar();
  await esperar();
  assert.deepStrictEqual(feitos(), ['sair', 'estado']);
  assert.strictEqual(toasts().length, toastsAntes, 'sair calado não avisa');
  assert.deepStrictEqual(campos, ['foco']);
  assert.strictEqual(faixa(), '');
}

async function usarAChaveSemLoginAcabadoSoLevaOFoco() {
  campos.length = 0;
  await entrarNaTelaCom('conectada');
  fila.estado.push({ status: 200, dados: { conectada: false, falha: 'chatgpt_not_eligible' } });
  seguidores[0]('ligada');
  await esperar();
  feitos();
  assert.ok(faixa().includes(textoDaVoz('CFG-35.erroChatgptNaoServe')), faixa());
  botao(textoDaVoz('CFG-35.erroChatgptUsarChave')).disparar('click');
  await esperar();
  assert.deepStrictEqual([feitos(), campos], [[], ['foco']]);
}

async function main() {
  for (const caso of [
    sairComARevogacaoMostraOAvisoEOEstadoNovo,
    sairSemRevogacaoDizQueOChatGPTNaoConfirmou,
    cadaRespostaQueNaoDizOkViraAFaixaDoPedido,
    doisCliquesSeguidosPedemUmaSaidaSo,
    usarAChaveDoLoginQueAcabouSaiSemAvisarOCampoRecebeOFoco,
    usarAChaveSemLoginAcabadoSoLevaOFoco,
  ]) {
    await caso();
  }
}

main().catch(erro => { console.error(erro); process.exit(1); });

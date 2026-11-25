'use strict';

const assert = require('assert');

const { prepararAPagina, noComId, esperar } = require('./painel_de_mentira.js');

const { documento, raiz } = prepararAPagina();
require('../lib/pedido-ao-anki.js');
const { textoDaVoz } = raiz;

const seguidores = [];
const pedidos = [];
const avisos = [];
const campos = [];
const fila = { estado: [], sair: [], entrar: [] };
const ROTAS = { '/ia/chatgpt/estado': 'estado', '/ia/chatgpt/sair': 'sair', '/ia/chatgpt/entrar': 'entrar' };
const LOGIN = {
  conectada: { status: 200, dados: { conectada: true } },
  nenhum: { status: 200, dados: { conectada: false } },
  acabou: { status: 200, dados: { conectada: false, acabou: 'chatgpt_signed_out' } },
  entrando: { status: 200, dados: { conectada: false, entrando: true } },
  semPlano: { status: 200, dados: { conectada: false, falha: 'chatgpt_not_eligible' } },
};
const mundo = { temChave: true };

raiz.ConexaoAnki = {
  SITUACAO: { CONECTANDO: 'conectando', LIGADA: 'ligada', DESLIGADA: 'desligada' },
  acompanhar: seguidor => seguidores.push(seguidor),
  situacao: () => 'ligada',
};
raiz.Veio = { ...raiz.Veio, mostrarToastDeSucesso: texto => avisos.push(texto) };
raiz.ModeloDosCartoes = { reler: () => {} };
raiz.CartaoDaIA = { temChave: () => mundo.temChave, baixarConexao: () => {} };
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
noComId(documento, 'cfg-ia-campo').focus = () => campos.push('foco');

require('../painel/painel-ia-chatgpt.js');
documento.disparar('DOMContentLoaded');
const coluna = raiz.ColunaDoChatGPT.coluna(lugar);
documento.body.append(coluna);

const faixa = () => raiz.ColunaDoChatGPT.faixa(lugar);
const botoes = no => no.querySelectorAll('button');
const botao = rotulo => [...botoes(coluna), ...botoes(faixa())].find(b => b.textContent === rotulo);
const tela = () => ({
  coluna: coluna.childNodes.map(no => [no.localName, no.className, no.textContent, botoes(no).map(b => [b.textContent, b.getAttribute('aria-disabled')])]),
  faixa: faixa().textContent,
});
const feitos = () => pedidos.splice(0);
const sair = () => textoDaVoz('CFG-35.chatgptSair');

async function lerComoLogin(login) {
  fila.estado.push(LOGIN[login]);
  seguidores[0]('ligada');
  await esperar();
  assert.deepStrictEqual(feitos(), ['estado']);
}

async function clicar(rotulo, resposta, depois) {
  const avisosAntes = avisos.length;
  if (resposta) fila.sair.push(resposta);
  if (resposta && depois) fila.estado.push(LOGIN[depois]);
  botao(rotulo).disparar('click');
  await esperar();
  await esperar();
  return { pedidos: feitos(), avisos: avisos.slice(avisosAntes), ...tela() };
}

const OK = revogada => ({ status: 200, dados: { ok: true, revogada } });
const SAIDAS = [
  ['com revogação', OK(true), 'nenhum'],
  ['sem revogação', OK(false), 'conectada'],
  ['ok falso', { status: 200, dados: { ok: false } }],
  ['sem corpo', { status: 200, dados: null }],
  ['erro do servidor', { status: 500, dados: { error: 'internal_error' } }],
  ['Conexão antiga', { status: 404, dados: null }],
  ['sem resposta', { status: null, dados: null }],
];

async function recomecar() {
  await lerComoLogin('conectada');
  await clicar(sair(), OK(true), 'nenhum');
}

async function cadaDesfechoDoSair() {
  const vistos = {};
  await recomecar();
  for (const [nome, resposta, depois] of SAIDAS) {
    await lerComoLogin('conectada');
    vistos[nome] = await clicar(sair(), resposta, depois);
  }
  return vistos;
}

async function cadaEstadoDaColuna() {
  const vistos = {};
  await recomecar();
  for (const [nome, login, temChave] of [['plano com chave', 'conectada', true], ['plano sem chave', 'conectada', false], ['sem login', 'nenhum', true], ['esperando', 'entrando', true]]) {
    mundo.temChave = temChave;
    await lerComoLogin(login);
    vistos[nome] = tela();
  }
  vistos.cancelado = (await clicar(textoDaVoz('CFG-35.chaveCancelar'))).coluna;
  for (const login of ['acabou', 'semPlano']) {
    await lerComoLogin(login);
    vistos[login] = tela();
  }
  mundo.temChave = true;
  return vistos;
}

async function cadaEntradaQueNaoAbre() {
  const vistos = {};
  await recomecar();
  await lerComoLogin('nenhum');
  for (const [nome, resposta] of [['sem conexão', { status: null, dados: null }], ['sem endereço', { status: 200, dados: { url: 'https://evil.exemplo/' } }]]) {
    fila.entrar.push(resposta);
    vistos[nome] = await clicar(textoDaVoz('CFG-35.chatgptBotao'));
  }
  return vistos;
}

async function usarAChave() {
  const vistos = {};
  await recomecar();
  for (const [nome, login, resposta] of [['com o login acabado', 'acabou', OK(true)], ['sem login acabado', 'semPlano']]) {
    campos.length = 0;
    await lerComoLogin(login);
    vistos[nome] = { ...(await clicar(textoDaVoz('CFG-35.erroChatgptUsarChave'), resposta, 'nenhum')), campos: campos.slice() };
  }
  return vistos;
}

async function doisCliquesSeguidosPedemUmaSaidaSo() {
  await recomecar();
  await lerComoLogin('conectada');
  fila.sair.push(OK(true));
  fila.estado.push(LOGIN.nenhum);
  const botaoDeSair = botao(sair());
  botaoDeSair.disparar('click');
  botaoDeSair.disparar('click');
  await esperar();
  await esperar();
  return feitos();
}

const CASOS = { cadaDesfechoDoSair, cadaEstadoDaColuna, cadaEntradaQueNaoAbre, usarAChave, doisCliquesSeguidosPedemUmaSaidaSo };

async function main() {
  const vistos = {};
  for (const [nome, caso] of Object.entries(CASOS)) vistos[nome] = await caso();
  if (process.env.GRAVAR_O_ESPERADO === '1') {
    console.log(`'use strict';\n\nmodule.exports = {\n${Object.entries(vistos).map(([nome, valor]) => `  ${nome}: ${JSON.stringify(valor)},`).join('\n')}\n};`);
    return;
  }
  const esperado = require('./painel_ia_chatgpt_esperado.js');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(vistos)), esperado);
  console.log('painel ia chatgpt tests passed');
}

main().catch(erro => { console.error(erro); process.exit(1); });

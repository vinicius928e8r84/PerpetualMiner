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
const { login: LOGIN, cenarios: CENARIOS } = require('./painel_ia_chatgpt_cenarios.json');
const mundo = { temChave: true };

Object.assign(raiz, {
  ConexaoAnki: { SITUACAO: { CONECTANDO: 'conectando', LIGADA: 'ligada', DESLIGADA: 'desligada' }, acompanhar: seguidor => seguidores.push(seguidor), situacao: () => 'ligada' },
  Veio: { ...raiz.Veio, mostrarToastDeSucesso: texto => avisos.push(texto) },
  ModeloDosCartoes: { reler: () => {} },
  CartaoDaIA: { temChave: () => mundo.temChave, baixarConexao: () => {} },
  ConversaComOAnki: { ...raiz.ConversaComOAnki, pedir: async pedido => responder(ROTAS[pedido.caminho]) },
});
Object.assign(globalThis, { addEventListener: () => {}, window: { addEventListener() {}, open() {} } });
Object.assign(globalThis.chrome, { tabs: { create: () => {} } });
globalThis.chrome.storage.local.get = (padrao, quando) => quando({ pm_plano_do_chatgpt_avisado: true });

function responder(rota) {
  pedidos.push(rota);
  return fila[rota].shift();
}

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
const SAIU = { status: 200, dados: { ok: true, revogada: true } };
const RECOMECO = { login: 'conectada', rotulo: 'CFG-35.chatgptSair', resposta: SAIU, depois: 'nenhum' };

async function lerComoLogin(login) {
  fila.estado.push(LOGIN[login]);
  seguidores[0]('ligada');
  await esperar();
  assert.deepStrictEqual(feitos(), ['estado']);
}

async function clicar({ rotulo, resposta, depois, cliques = 1 }) {
  const avisosAntes = avisos.length;
  if (resposta) fila.sair.push(resposta);
  if (resposta && depois) fila.estado.push(LOGIN[depois]);
  for (let vez = 0; vez < cliques; vez++) botao(textoDaVoz(rotulo)).disparar('click');
  await esperar();
  await esperar();
  return { pedidos: feitos(), avisos: avisos.slice(avisosAntes), ...tela() };
}

const DO_RESULTADO = {
  soAColuna: visto => visto.coluna,
  soOsPedidos: visto => visto.pedidos,
  comOFoco: visto => ({ ...visto, campos: campos.slice() }),
};

async function rodar(cenario) {
  mundo.temChave = cenario.temChave ?? true;
  campos.length = 0;
  await lerComoLogin(cenario.login);
  if (cenario.entrar) fila.entrar.push(cenario.entrar);
  if (!cenario.rotulo) return tela();
  const visto = await clicar(cenario);
  const forma = Object.keys(DO_RESULTADO).find(nome => cenario[nome]);
  return forma ? DO_RESULTADO[forma](visto) : visto;
}

async function percorrer(cenarios) {
  await rodar(RECOMECO);
  const vistos = {};
  for (const cenario of cenarios) vistos[cenario.nome] = await rodar(cenario);
  return vistos;
}

async function main() {
  const vistos = {};
  for (const [nome, cenarios] of Object.entries(CENARIOS)) vistos[nome] = await percorrer(cenarios);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(vistos)), require('./painel_ia_chatgpt_esperado.js'));
  console.log('painel ia chatgpt tests passed');
}

main().catch(erro => { console.error(erro); process.exit(1); });

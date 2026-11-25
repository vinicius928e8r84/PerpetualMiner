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

async function clicar(rotulo, resposta, depois, cliques = 1) {
  const avisosAntes = avisos.length;
  if (resposta) fila.sair.push(resposta);
  if (resposta && depois) fila.estado.push(LOGIN[depois]);
  for (let vez = 0; vez < cliques; vez++) botao(rotulo).disparar('click');
  await esperar();
  await esperar();
  return { pedidos: feitos(), avisos: avisos.slice(avisosAntes), ...tela() };
}

const SAIU = { status: 200, dados: { ok: true, revogada: true } };
async function rodar({ login, temChave = true, rotulo, resposta, depois, entrar, cliques, soAColuna, soOsPedidos, comOFoco }) {
  mundo.temChave = temChave;
  campos.length = 0;
  await lerComoLogin(login);
  if (entrar) fila.entrar.push(entrar);
  if (!rotulo) return tela();
  const visto = await clicar(textoDaVoz(rotulo), resposta, depois, cliques);
  if (soAColuna) return visto.coluna;
  if (soOsPedidos) return visto.pedidos;
  return comOFoco ? { ...visto, campos: campos.slice() } : visto;
}

async function recomecar() {
  await lerComoLogin('conectada');
  await clicar(sair(), SAIU, 'nenhum');
}

async function coletar(entradas, passo) {
  const vistos = {};
  for (const [nome, entrada] of entradas) vistos[nome] = await passo(entrada);
  return vistos;
}

async function percorrer(cenarios) {
  await recomecar();
  return coletar(cenarios.map(cenario => [cenario.nome, cenario]), rodar);
}

async function main() {
  const vistos = await coletar(Object.entries(CENARIOS), percorrer);
  if (process.env.GRAVAR_O_ESPERADO === '1') {
    console.log(`'use strict';\n\nmodule.exports = {\n${Object.entries(vistos).map(([nome, valor]) => `  ${nome}: ${JSON.stringify(valor)},`).join('\n')}\n};`);
    return;
  }
  const esperado = require('./painel_ia_chatgpt_esperado.js');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(vistos)), esperado);
  console.log('painel ia chatgpt tests passed');
}

main().catch(erro => { console.error(erro); process.exit(1); });

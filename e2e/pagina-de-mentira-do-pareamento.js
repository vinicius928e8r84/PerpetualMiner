'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');

const { criarPareamento } = require('./fakes/pareamento');
const { NAVEGADORES } = require('./pareamento-de-teste');

const ENDERECO = 'http://127.0.0.1:8766';
const comoValores = valor => JSON.parse(JSON.stringify(valor));

function criarIndexedDB() {
  const bancos = new Map();
  const pedido = fazer => {
    const r = { result: undefined };
    setTimeout(() => { r.result = fazer(); r.onsuccess?.(); });
    return r;
  };
  return {
    bancos,
    open(nome) {
      const abertura = { result: null };
      setTimeout(() => {
        const novo = !bancos.has(nome);
        if (novo) bancos.set(nome, new Map());
        const lojas = bancos.get(nome);
        abertura.result = {
          createObjectStore: loja => lojas.set(loja, new Map()),
          close() {},
          transaction(loja) {
            const t = {};
            const dados = lojas.get(loja);
            t.objectStore = () => ({
              put: (valor, chave) => { const p = pedido(() => { dados.set(chave, valor); return chave; }); setTimeout(() => t.oncomplete?.(), 2); return p; },
              get: chave => { const p = pedido(() => dados.get(chave)); setTimeout(() => t.oncomplete?.(), 2); return p; },
              delete: chave => { const p = pedido(() => { dados.delete(chave); return undefined; }); setTimeout(() => t.oncomplete?.(), 2); return p; },
            });
            return t;
          },
        };
        if (novo) abertura.onupgradeneeded?.();
        abertura.onsuccess?.();
      });
      return abertura;
    },
  };
}

const doPedido = (url, opcoes) => ({
  metodo: opcoes.method || 'GET',
  caminho: new URL(url).pathname,
  cabecalhos: Object.fromEntries(Object.entries(opcoes.headers || {}).map(([nome, valor]) => [nome.toLowerCase(), valor])),
  corpo: opcoes.body,
});

const daConexaoAntiga = ({ caminho }) => (caminho.startsWith('/pareamento/') ? resposta(404, { error: 'not_found' }) : resposta(200, { estado: 'instalada' }));

async function privadaAssinada(conexao, req, caminho, assinou) {
  conexao.privadas += 1;
  let entregue = null;
  const route = conexao.pareamento.comProva({ request: () => req, fulfill: r => { entregue = r; } }, assinou);
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, caminho }) });
  return new Response(entregue.body, { status: entregue.status, headers: entregue.headers });
}

async function daConexaoNova(conexao, { metodo, caminho, cabecalhos, corpo }) {
  const req = { method: () => metodo, postData: () => corpo ?? null, headers: () => cabecalhos };
  const doPareamento = conexao.pareamento.responder(metodo, caminho, corpo ? JSON.parse(corpo) : null);
  if (doPareamento) return resposta(doPareamento.status, doPareamento.json);
  if (metodo === 'GET' && caminho === '/health') return resposta(200, { ok: true, versao: '0.4.25', perfil: 'Usuário 1' });
  const assinou = conexao.pareamento.verificar(req, caminho);
  if (assinou.erro) return resposta(401, { error: assinou.erro });
  return privadaAssinada(conexao, req, caminho, assinou);
}

function criarConexao({ navegadores = ['primeiro'], impostor = null, antiga = false } = {}) {
  const pareamento = criarPareamento({ agora: () => new Date() });
  pareamento.desconectar();
  navegadores.forEach(n => pareamento.parear(n));
  const conexao = { pareamento, vistos: [], privadas: 0, sessao: pareamento.sessao(), reiniciar: null };
  conexao.fetch = async (url, opcoes = {}) => {
    const pedido = doPedido(url, opcoes);
    conexao.vistos.push(pedido);
    if (impostor) return impostor({ ...pedido });
    return antiga ? daConexaoAntiga(pedido) : daConexaoNova(conexao, pedido);
  };
  return conexao;
}

const resposta = (status, json, headers = {}) => new Response(JSON.stringify(json), { status, headers });

function carregarAPagina(conexao, indexedDB = criarIndexedDB()) {
  const contexto = vm.createContext({
    fetch: (url, opcoes) => conexao.fetch(url, opcoes), indexedDB, crypto: webcrypto, TextEncoder, TextDecoder, atob, btoa, AbortSignal, Date, JSON, Uint8Array,
    setTimeout, navigator: { userAgentData: { brands: [{ brand: 'Chromium' }, { brand: 'Google Chrome' }] } },
  });
  contexto.globalThis = contexto;
  for (const arquivo of ['pedido-ao-anki.js', 'pareamento.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'lib', arquivo), 'utf8'), contexto);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'variantes-do-pedido-ao-anki.js'), 'utf8'), contexto);
  const { PedidoAoAnki, PareamentoComOAnki, ConversaComOAnki, VariantesDoPedidoAoAnki } = contexto.PerpetualMiner;
  const conversa = ConversaComOAnki.criar({ endereco: ENDERECO });
  return { PedidoAoAnki, Pareamento: PareamentoComOAnki, Conversa: ConversaComOAnki, pedir: conversa.pedir, Variantes: VariantesDoPedidoAoAnki, indexedDB };
}

const lerJson = async desfecho => desfecho.dados;
const igual = (obtido, esperado, mensagem) => assert.deepStrictEqual(comoValores(obtido), esperado, mensagem);

async function parear(pagina, conexao, codigoSorteado = 'K7M4PX') {
  conexao.pareamento.sortearCodigo(codigoSorteado);
  igual(await pagina.Pareamento.comecar(ENDERECO), { ok: true });
  return pagina.Pareamento.concluir(ENDERECO, conexao.pareamento.codigoNoAnki());
}


async function parearComChaveGuardada(pagina, navegador = 'primeiro') {
  const { cliente, segredo } = NAVEGADORES[navegador];
  const chave = await webcrypto.subtle.importKey('raw', Buffer.from(segredo, 'base64'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const lojas = pagina.indexedDB.bancos.get('pm-pareamento') || pagina.indexedDB.bancos.set('pm-pareamento', new Map()).get('pm-pareamento');
  if (!lojas.has('conexao')) lojas.set('conexao', new Map());
  lojas.get('conexao').set('credencial', { cliente, chave });
}


module.exports = { ENDERECO, comoValores, criarConexao, resposta, carregarAPagina, lerJson, igual, parear, parearComChaveGuardada };

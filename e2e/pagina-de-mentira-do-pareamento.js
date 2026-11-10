'use strict';

// O apoio dos testes do pareamento visto da extensão (`test_pareamento_do_anki.js`, `test_pareamento_do_anki_ataques.js`): uma Conexão de mentira que faz o que o complemento
// faz (o pareamento do fake do e2e, as rotas privadas e o que um impostor na porta veria), um IndexedDB de mentira e as páginas da extensão (`lib/pedido-ao-anki.js` e
// `lib/pareamento.js` carregados como as páginas os carregam).

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');

const { criarPareamento } = require('./fakes/pareamento');
const { NAVEGADORES } = require('./pareamento-de-teste');

const ENDERECO = 'http://127.0.0.1:8766';
const comoValores = valor => JSON.parse(JSON.stringify(valor));

/** O IndexedDB do navegador, o que `lib/pareamento.js` usa dele: um objeto por banco, guardado como está. */
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

/** Uma Conexão de mentira em `ENDERECO`: o pareamento do fake do e2e, as rotas privadas e o que um impostor na porta veria (`vistos`). */
function criarConexao({ navegadores = ['primeiro'], impostor = null, antiga = false } = {}) {
  const agora = () => new Date();
  const pareamento = criarPareamento({ agora });
  pareamento.desconectar();
  navegadores.forEach(n => pareamento.parear(n));
  const conexao = { pareamento, vistos: [], privadas: 0, sessao: pareamento.sessao(), reiniciar: null };
  conexao.fetch = async (url, opcoes = {}) => {
    const caminho = new URL(url).pathname;
    const metodo = opcoes.method || 'GET';
    const cabecalhos = Object.fromEntries(Object.entries(opcoes.headers || {}).map(([nome, valor]) => [nome.toLowerCase(), valor]));
    conexao.vistos.push({ metodo, caminho, cabecalhos, corpo: opcoes.body });
    if (impostor) return impostor({ metodo, caminho, cabecalhos, corpo: opcoes.body });
    if (antiga) return caminho.startsWith('/pareamento/') ? resposta(404, { error: 'not_found' }) : resposta(200, { estado: 'instalada' });   // a de antes do pareamento atende pela origem
    const req = { method: () => metodo, postData: () => opcoes.body ?? null, headers: () => cabecalhos };
    const doPareamento = pareamento.responder(metodo, caminho, opcoes.body ? JSON.parse(opcoes.body) : null);
    if (doPareamento) return resposta(doPareamento.status, doPareamento.json);
    if (metodo === 'GET' && caminho === '/health') return resposta(200, { ok: true, versao: '0.4.25', perfil: 'Usuário 1' });
    const assinou = pareamento.verificar(req, caminho);
    if (assinou.erro) return resposta(401, { error: assinou.erro });
    conexao.privadas += 1;
    let entregue = null;
    const route = pareamento.comProva({ request: () => req, fulfill: r => { entregue = r; } }, assinou);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, caminho }) });
    return new Response(entregue.body, { status: entregue.status, headers: entregue.headers });
  };
  return conexao;
}

const resposta = (status, json, headers = {}) => new Response(JSON.stringify(json), { status, headers });

/** As páginas da extensão: um contexto novo (outra aba, ou o service worker) com os dois módulos e o `fetch` da Conexão dada. */
function carregarAPagina(conexao, indexedDB = criarIndexedDB()) {
  const contexto = vm.createContext({
    fetch: (url, opcoes) => conexao.fetch(url, opcoes), indexedDB, crypto: webcrypto, TextEncoder, TextDecoder, Response, atob, btoa, AbortSignal, Date, JSON, Uint8Array,
    setTimeout, navigator: { userAgentData: { brands: [{ brand: 'Chromium' }, { brand: 'Google Chrome' }] } },
  });
  contexto.globalThis = contexto;
  for (const arquivo of ['pedido-ao-anki.js', 'pareamento.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'lib', arquivo), 'utf8'), contexto);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'variantes-do-pedido-ao-anki.js'), 'utf8'), contexto);
  const { PedidoAoAnki, PareamentoComOAnki, VariantesDoPedidoAoAnki } = contexto.PerpetualMiner;
  return { PedidoAoAnki, Pareamento: PareamentoComOAnki, Variantes: VariantesDoPedidoAoAnki, indexedDB };
}

const lerJson = async r => r.json();
const igual = (obtido, esperado, mensagem) => assert.deepStrictEqual(comoValores(obtido), esperado, mensagem); // os objetos do `vm` têm outro protótipo

async function parear(pagina, conexao, codigoSorteado = 'K7M4PX') {
  conexao.pareamento.sortearCodigo(codigoSorteado);
  igual(await pagina.Pareamento.comecar(ENDERECO), { ok: true });
  return pagina.Pareamento.concluir(ENDERECO, conexao.pareamento.codigoNoAnki());
}


/** A página já pareada: o segredo do navegador `primeiro` na credencial, como a fixture do e2e a deixa. */
async function parearComChaveGuardada(pagina, navegador = 'primeiro') {
  const { cliente, segredo } = NAVEGADORES[navegador];
  const chave = await webcrypto.subtle.importKey('raw', Buffer.from(segredo, 'base64'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const lojas = pagina.indexedDB.bancos.get('pm-pareamento') || pagina.indexedDB.bancos.set('pm-pareamento', new Map()).get('pm-pareamento');
  if (!lojas.has('conexao')) lojas.set('conexao', new Map());   // o banco como a extensão o cria
  lojas.get('conexao').set('credencial', { cliente, chave });
}


module.exports = { ENDERECO, comoValores, criarIndexedDB, criarConexao, resposta, carregarAPagina, lerJson, igual, parear, parearComChaveGuardada };

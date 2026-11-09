'use strict';

// O pareamento visto da extensão (#192): `lib/pareamento.js` e o `pedir` assinado de `lib/pedido-ao-anki.js`, carregados como as páginas os
// carregam, diante de uma Conexão de mentira que faz o que `complemento/pareamento.py` faz (a mesma conta, as mesmas recusas: e2e/fakes/pareamento.js).
// O que a pessoa e um impostor na porta enxergam: o que sai, o que volta, o que fica guardado. A mesma conta nos dois lados é o vetor do contrato.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');

const { criarPareamento } = require('./e2e/fakes/pareamento');
const { NAVEGADORES, assinaturaDoPedido } = require('./e2e/pareamento-de-teste');
const contrato = require('./complemento/contrato/carregar');

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
    if (antiga && caminho.startsWith('/pareamento/')) return resposta(404, { error: 'not_found' });
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
  for (const arquivo of ['pedido-ao-anki.js', 'pareamento.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, 'lib', arquivo), 'utf8'), contexto);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'e2e', 'variantes-do-pedido-ao-anki.js'), 'utf8'), contexto);
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

async function main() {
  // A mesma conta nos dois lados: o vetor do contrato (o mesmo que complemento/test_pareamento.py confere em Python).
  {
    const vetor = contrato.vetorDeAssinatura;
    const chave = await webcrypto.subtle.importKey('raw', Buffer.from(vetor.segredo, 'base64'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const { Pareamento } = carregarAPagina(criarConexao());
    const feita = await Pareamento.contas.assinaturaDoPedido(chave, { sessao: vetor.sessao, nonce: vetor.nonce, metodo: vetor.metodo, caminho: vetor.caminho, corpo: new TextEncoder().encode(vetor.corpo) });
    assert.strictEqual(feita, vetor.assinatura, 'a extensão assina como o complemento');
    assert.strictEqual(assinaturaDoPedido(vetor.segredo, { sessao: vetor.sessao, nonce: vetor.nonce, metodo: vetor.metodo, caminho: vetor.caminho, corpo: vetor.corpo }), vetor.assinatura, 'o fake do e2e assina como o complemento');
  }

  // Sem pareamento nada privado sai: a resposta é um 401 na hora, e a Conexão só viu o que o pareamento pede.
  {
    const conexao = criarConexao({ navegadores: [] });
    const pagina = carregarAPagina(conexao);
    const lida = await pagina.PedidoAoAnki.pedir(ENDERECO, pagina.PedidoAoAnki.estadoDaIA());
    igual([lida.status, await lerJson(lida)], [401, { error: 'pairing_required' }]);
    igual(conexao.vistos, [], 'sem credencial a extensão não manda nada à Conexão');
    assert.strictEqual(pagina.Pareamento.estado(), 'a_parear');
    const saude = await pagina.PedidoAoAnki.pedir(ENDERECO, pagina.PedidoAoAnki.saude());
    assert.strictEqual(saude.status, 200, 'a saúde segue aberta');
  }

  // Parear: o código errado diz as tentativas; o certo guarda o segredo como CryptoKey não extraível, e o pedido seguinte sai assinado e volta provado.
  {
    const conexao = criarConexao({ navegadores: [] });
    const pagina = carregarAPagina(conexao);
    conexao.pareamento.sortearCodigo('K7M4PX');
    igual(await pagina.Pareamento.comecar(ENDERECO), { ok: true });
    assert.strictEqual(conexao.pareamento.codigoNoAnki(), 'K7M-4PX');
    igual(await pagina.Pareamento.concluir(ENDERECO, 'AAA-AAA'), { erro: 'errado', restam: 4 });
    assert.strictEqual(await pagina.Pareamento.lerACredencial(), null, 'o código errado não guarda nada');
    igual(await pagina.Pareamento.concluir(ENDERECO, 'k7m 4px'), { ok: true });
    const credencial = await pagina.Pareamento.lerACredencial();
    assert.strictEqual(credencial.chave.extractable, false, 'nem o código da extensão lê os bytes do segredo');
    await assert.rejects(webcrypto.subtle.exportKey('raw', credencial.chave));
    assert.strictEqual(conexao.pareamento.pareados().size, 1);
    const lida = await pagina.PedidoAoAnki.pedir(ENDERECO, pagina.PedidoAoAnki.estadoDaIA());
    igual([lida.status, await lerJson(lida)], [200, { ok: true, caminho: '/ia/estado' }]);
    const privado = conexao.vistos.at(-1);
    assert.ok(privado.cabecalhos['x-perpetualminer-assinatura'] && privado.cabecalhos['x-perpetualminer-nonce'], 'o pedido privado vai assinado');
    assert.strictEqual(pagina.Pareamento.estado(), 'pareada');
    // O segredo passou pela rede uma vez só, na resposta do `concluir`.
    const vezesQueOSegredoSaiu = conexao.vistos.filter(v => JSON.stringify(v).includes(conexao.pareamento.pareados().values().next().value)).length;
    assert.strictEqual(vezesQueOSegredoSaiu, 0, 'a extensão nunca manda o segredo');
  }

  // A resposta do `concluir` se perde: tentar de novo com o mesmo código dá o mesmo segredo, sem outro navegador.
  {
    const conexao = criarConexao({ navegadores: [] });
    const pagina = carregarAPagina(conexao);
    conexao.pareamento.sortearCodigo('K7M4PX');
    await pagina.Pareamento.comecar(ENDERECO);
    const original = conexao.fetch;
    let perdeu = false;
    conexao.fetch = async (url, opcoes) => {
      const r = await original(url, opcoes);
      if (!perdeu && new URL(url).pathname === '/pareamento/concluir') { perdeu = true; throw new TypeError('Failed to fetch'); }
      return r;
    };
    igual(await pagina.Pareamento.concluir(ENDERECO, 'K7M-4PX'), { erro: 'falhou' });
    igual(await pagina.Pareamento.concluir(ENDERECO, 'K7M-4PX'), { ok: true });
    assert.strictEqual(conexao.pareamento.pareados().size, 1, 'um navegador só: o cliente da segunda tentativa foi o mesmo');
  }

  // O código venceu ou foi gasto: a tela recebe `venceu` (e o `cliente` seguinte é outro).
  {
    const conexao = criarConexao({ navegadores: [] });
    const pagina = carregarAPagina(conexao);
    await pagina.Pareamento.comecar(ENDERECO);
    conexao.pareamento.vencerOCodigo();
    igual(await pagina.Pareamento.concluir(ENDERECO, 'K7M-4PX'), { erro: 'venceu' });
  }

  // O impostor na porta: responde a saúde e o `conferir` com o que quiser. A extensão não manda nada privado e passa a dizer "não confirmada".
  {
    const conexao = criarConexao({ impostor: async ({ caminho }) => (caminho === '/health'
      ? resposta(200, { ok: true, versao: '0.4.25', perfil: 'X' })
      : resposta(200, { sessao: 'a'.repeat(32), prova: 'AAAA'.repeat(10) + 'AAA=' })) });
    const pagina = carregarAPagina(conexao);
    await parearComChaveGuardada(pagina);
    const antes = conexao.vistos.length;
    await assert.rejects(pagina.PedidoAoAnki.pedir(ENDERECO, pagina.PedidoAoAnki.chaveDaOpenAI('sk-proj-segredo-da-pessoa')), /não provou/);
    const depois = conexao.vistos.slice(antes);
    igual(depois.map(v => v.caminho), ['/pareamento/conferir'], 'o impostor viu o desafio e mais nada');
    assert.ok(!JSON.stringify(conexao.vistos).includes('sk-proj-segredo-da-pessoa'));
    assert.strictEqual(pagina.Pareamento.estado(), 'nao_confirmada');
  }

  // O impostor prova a primeira vez e some: a resposta dele a um pedido assinado não tem a prova certa, e não vira dado.
  {
    const conexao = criarConexao();
    const pagina = carregarAPagina(conexao);
    await parearComChaveGuardada(pagina);
    const original = conexao.fetch;
    for (const [nome, adulterar] of [
      ['sem a prova', r => new Response(r.body, { status: r.status })],
      ['com a prova de outro corpo', async r => new Response('{"ok":false}', { status: r.status, headers: r.headers })],
      ['com a prova de outro status', async r => new Response(await r.clone().text(), { status: 500, headers: r.headers })],
    ]) {
      conexao.fetch = async (url, opcoes) => {
        const r = await original(url, opcoes);
        return new URL(url).pathname === '/ia/estado' ? adulterar(r) : r;
      };
      await assert.rejects(pagina.PedidoAoAnki.pedir(ENDERECO, pagina.PedidoAoAnki.estadoDaIA()), /prova/, nome);
      assert.strictEqual(pagina.Pareamento.estado(), 'nao_confirmada', nome);
      conexao.fetch = original;
      await pagina.Pareamento.provar(ENDERECO, { fresco: true });   // a Conexão de verdade volta e prova
    }
    assert.strictEqual(pagina.Pareamento.estado(), 'pareada');
  }

  // Conexão antiga (404 no `conferir`): nada privado sai e a tela lê "atualize".
  {
    const conexao = criarConexao({ antiga: true });
    const pagina = carregarAPagina(conexao);
    await parearComChaveGuardada(pagina);
    const lida = await pagina.PedidoAoAnki.pedir(ENDERECO, pagina.PedidoAoAnki.chaveDaOpenAI('sk-proj-x'));
    assert.strictEqual(pagina.PedidoAoAnki.ausenciaDaRota(lida.status), 'antiga');
    assert.ok(conexao.vistos.every(v => v.caminho === '/pareamento/conferir'), 'a Conexão antiga só viu o conferir');
    assert.strictEqual(pagina.Pareamento.estado(), 'antiga');
  }

  // A Conexão subiu de novo (outra sessão): o primeiro pedido refaz o `conferir` sozinho, uma vez, e o pedido segue.
  {
    const conexao = criarConexao();
    const pagina = carregarAPagina(conexao);
    await parearComChaveGuardada(pagina);
    await pagina.PedidoAoAnki.pedir(ENDERECO, pagina.PedidoAoAnki.estadoDaIA());
    const nova = criarConexao();   // outra subida: outra sessão, mesmos navegadores
    conexao.fetch = nova.fetch;
    const lida = await pagina.PedidoAoAnki.pedir(ENDERECO, pagina.PedidoAoAnki.estadoDaIA());
    assert.strictEqual(lida.status, 200);
    igual(nova.vistos.map(v => v.caminho), ['/ia/estado', '/pareamento/conferir', '/ia/estado'], 'session_expired, conferir e o pedido de novo');
  }

  // "Desconectar navegadores" no Anki: a Conexão não conhece mais o navegador. A extensão diz "a parear" e **não** apaga a credencial por isso.
  {
    const conexao = criarConexao();
    const pagina = carregarAPagina(conexao);
    await parearComChaveGuardada(pagina);
    conexao.pareamento.desconectar();
    const lida = await pagina.PedidoAoAnki.pedir(ENDERECO, pagina.PedidoAoAnki.estadoDaIA(), {});
    igual([lida.status, (await lerJson(lida)).error], [401, 'pairing_required']);
    assert.strictEqual(pagina.Pareamento.estado(), 'a_parear');
    assert.ok(await pagina.Pareamento.lerACredencial(), 'um 401 sem prova não desfaz o pareamento: só um pareamento novo o substitui');
  }

  // O pedido que leva a chave, o token ou as Frases pede um `conferir` novo; a leitura reaproveita a sessão provada há pouco.
  {
    const conexao = criarConexao();
    const pagina = carregarAPagina(conexao);
    await parearComChaveGuardada(pagina);
    await pagina.PedidoAoAnki.pedir(ENDERECO, pagina.PedidoAoAnki.estadoDaIA());
    await pagina.PedidoAoAnki.pedir(ENDERECO, pagina.PedidoAoAnki.estadoDaIA());
    const conferencias = () => conexao.vistos.filter(v => v.caminho === '/pareamento/conferir').length;
    const antes = conferencias();
    await pagina.PedidoAoAnki.pedir(ENDERECO, pagina.PedidoAoAnki.estadoDaIA());
    assert.strictEqual(conferencias(), antes, 'a leitura reaproveita a sessão');
    await pagina.PedidoAoAnki.pedir(ENDERECO, pagina.PedidoAoAnki.chaveDaOpenAI('sk-proj-x'));
    assert.strictEqual(conferencias(), antes + 1, 'a chave pede um conferir novo');
  }

  // Outra aba (ou o service worker) lê a mesma credencial do IndexedDB e prova a Conexão por conta própria.
  {
    const conexao = criarConexao({ navegadores: [] });
    const paginaA = carregarAPagina(conexao);
    igual(await parear(paginaA, conexao), { ok: true });
    const paginaB = carregarAPagina(conexao, paginaA.indexedDB);
    const lida = await paginaB.PedidoAoAnki.pedir(ENDERECO, paginaB.PedidoAoAnki.estadoDaIA());
    assert.strictEqual(lida.status, 200);
  }

  // Todo pedido que a extensão sabe fazer sai assinado, menos a saúde e o pareamento: os construtores de `PedidoAoAnki` não têm como esquecer.
  {
    const conexao = criarConexao();
    const pagina = carregarAPagina(conexao);
    await parearComChaveGuardada(pagina);
    const CHAVE = contrato.exemplos.find(e => e.pedido.caminho === '/ia/openai/chave').pedido.corpo.chave;
    const ENVIO = contrato.exemplos.find(e => e.daExtensao && e.pedido.caminho === '/jobs').pedido.corpo;
    const variantes = pagina.Variantes.variantes([{ deckName: 'Inglês', lang: 'en' }, { deckName: 'Alemão', lang: 'ru' }], CHAVE, ENVIO);
    assert.ok(variantes.length > 40);
    for (const { nome, pedido } of variantes) {
      conexao.vistos.length = 0;
      await pagina.PedidoAoAnki.pedir(ENDERECO, pedido);
      const enviado = conexao.vistos.at(-1);
      const aberto = (pedido.metodo === 'GET' && pedido.caminho === '/health') || pedido.caminho.startsWith('/pareamento/');
      assert.strictEqual(Boolean(enviado.cabecalhos['x-perpetualminer-assinatura']), !aberto, `${nome}: ${aberto ? 'o pedido aberto não leva assinatura' : 'o pedido privado vai assinado'}`);
    }
  }

  assert.ok(NAVEGADORES.primeiro && NAVEGADORES.segundo);
  console.log('pareamento do anki tests passed');
}

/** A página já pareada: o segredo do navegador `primeiro` na credencial, como a fixture do e2e a deixa. */
async function parearComChaveGuardada(pagina, navegador = 'primeiro') {
  const { cliente, segredo } = NAVEGADORES[navegador];
  const chave = await webcrypto.subtle.importKey('raw', Buffer.from(segredo, 'base64'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const lojas = pagina.indexedDB.bancos.get('pm-pareamento') || pagina.indexedDB.bancos.set('pm-pareamento', new Map()).get('pm-pareamento');
  if (!lojas.has('conexao')) lojas.set('conexao', new Map());   // o banco como a extensão o cria
  lojas.get('conexao').set('credencial', { cliente, chave });
}

main().catch(erro => { console.error(erro); process.exit(1); });

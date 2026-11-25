'use strict';

const assert = require('assert');
const fs = require('fs');
const test = require('node:test');
const vm = require('vm');

const ID_DA_EXTENSAO = 'extensao-do-perpetualminer';
const DO_PAINEL = { id: ID_DA_EXTENSAO };
const MENU_MINERAR_SELECAO = 'minerar-perpetualminer';

const copiaSimples = valor => JSON.parse(JSON.stringify(valor));
const esperar = async () => { for (let volta = 0; volta < 30; volta++) await new Promise(resolver => setImmediate(resolver)); };

const vocabularioDoIngles = palavras => ({
  cacheVersion: 2, deckName: 'PerpetualMiner::Inglês', createdAt: Date.now(), words: palavras, terms: [], wordInfo: {}, termInfo: {},
});
const vocabularioDoRusso = () => ({
  cacheVersion: 2, deckName: 'PerpetualMiner::Russo', createdAt: Date.now(), words: [], terms: [], wordInfo: {}, termInfo: {},
});

const PALAVRAS_QUE_JA_SEI = ['aside', 'babies', 'children', 'clock', 'dependence', 'exposed', 'farmers', 'fed', 'fields', 'lay', 'left', 'porridge', 'rain', 'required', 'seed', 'settle', 'villages', 'wheat', 'women'];
const FRASE_COM_PALAVRA_NOVA = 'Its dependence on rain left it exposed to the depredations of drought.';
const AJUSTES_LIGADOS = { pm_auto_miner_settings: { en: { enabled: true, dailyLimit: 20 }, ru: { enabled: true, dailyLimit: 20 } } };

function armazenamentoDeMentira(armazenamento) {
  const valorDe = (chave, padrao) => (Object.hasOwn(armazenamento, chave) ? armazenamento[chave] : padrao);
  return {
    get(padroes, devolver) {
      devolver(Object.fromEntries(Object.entries(padroes || {}).map(([chave, padrao]) => [chave, valorDe(chave, padrao)])));
    },
    set(valores, devolver) {
      Object.assign(armazenamento, valores || {});
      devolver?.();
    },
  };
}

function chromeDeMentira(armazenamento, ouvintes) {
  return {
    contextMenus: { create() {}, onClicked: { addListener: funcao => { ouvintes.menu = funcao; } } },
    runtime: {
      id: ID_DA_EXTENSAO,
      onInstalled: { addListener() {} },
      onMessage: { addListener: funcao => { ouvintes.mensagem = funcao; } },
      lastError: null,
    },
    storage: { local: armazenamentoDeMentira(armazenamento) },
    tabs: { query: (_filtro, devolver) => devolver([]) },
  };
}

function carregarOBackground(chrome) {
  const contexto = { console: { ...console, warn() {} }, navigator: globalThis.navigator, fetch: async () => ({ ok: false }), setTimeout, clearTimeout, Date, chrome };
  contexto.importScripts = (...arquivos) => {
    for (const arquivo of arquivos) vm.runInContext(fs.readFileSync(arquivo, 'utf8'), contexto, { filename: arquivo });
  };
  vm.createContext(contexto);
  vm.runInContext(fs.readFileSync('background.js', 'utf8'), contexto, { filename: 'background.js' });
  return contexto;
}

function abrirOServiceWorker(armazenamento = {}) {
  const nuvem = { gravadas: [], falha: null };
  const ouvintes = { menu: null, mensagem: null };
  const contexto = carregarOBackground(chromeDeMentira(armazenamento, ouvintes));
  contexto.nuvemDaConta = async () => ({
    gravarFrase: async frase => {
      if (nuvem.falha) throw nuvem.falha;
      nuvem.gravadas.push(copiaSimples(frase));
    },
  });
  const pedirPorMensagem = (type, pedido) => new Promise(resolver => ouvintes.mensagem({ type, ...pedido }, DO_PAINEL, resolver));
  return {
    armazenamento,
    nuvem,
    frases: () => copiaSimples(armazenamento.frases || []),
    clicarNoMenu: (info, aba) => ouvintes.menu(info, aba),
    salvarNoHistorico: pedido => pedirPorMensagem('SALVAR_HISTORICO', pedido),
    candidata: pedido => pedirPorMensagem('AUTO_MINER_CANDIDATE', pedido),
  };
}

const comVocabularioDoIngles = (extra = {}) => ({ pm_auto_keyword_vocab_en: vocabularioDoIngles(PALAVRAS_QUE_JA_SEI), ...extra });

test('o menu de contexto minera a seleção: Frase com a origem da página, o Contexto, o Idioma detectado e a Palavra automática', async () => {
  const servico = abrirOServiceWorker(comVocabularioDoIngles());
  servico.clicarNoMenu(
    { menuItemId: MENU_MINERAR_SELECAO, selectionText: `  ${FRASE_COM_PALAVRA_NOVA}  `, pageUrl: 'https://exemplo.com/artigo' },
    { title: 'Um artigo - Google Chrome' },
  );
  await esperar();

  const [frase] = servico.frases();
  assert.strictEqual(servico.frases().length, 1);
  assert.deepStrictEqual(
    [frase.texto, frase.streaming, frase.idioma, frase.contexto, frase.keywords, frase.autoKeyword, frase.data],
    [FRASE_COM_PALAVRA_NOVA, 'web', 'Inglês', { fonte: 'web', titulo: 'Um artigo', detalhe: '' }, ['depredations@18', 'of@20', 'drought@22'], true, new Date().toLocaleDateString('pt-BR')],
  );
  assert.strictEqual(typeof frase.id, 'number');
  assert.deepStrictEqual(servico.nuvem.gravadas.map(gravada => gravada.texto), [FRASE_COM_PALAVRA_NOVA]);
});

test('o menu de contexto de uma seleção em russo grava o Idioma Russo sem Palavra automática', async () => {
  const servico = abrirOServiceWorker({ pm_auto_keyword_vocab_ru: vocabularioDoRusso() });
  servico.clicarNoMenu({ menuItemId: MENU_MINERAR_SELECAO, selectionText: 'Я улыбаюсь', pageUrl: 'https://exemplo.com/ru' }, { title: 'Russo' });
  await esperar();

  const [frase] = servico.frases();
  assert.strictEqual(servico.frases().length, 1);
  assert.strictEqual(frase.idioma, 'Russo');
  assert.strictEqual(frase.keywords, undefined);
  assert.strictEqual(frase.autoKeyword, undefined);
});

test('o menu de contexto ignora outro item e uma seleção vazia', async () => {
  const servico = abrirOServiceWorker(comVocabularioDoIngles());
  servico.clicarNoMenu({ menuItemId: 'outro-item', selectionText: 'Hello there', pageUrl: 'https://exemplo.com' }, { title: 'T' });
  servico.clicarNoMenu({ menuItemId: MENU_MINERAR_SELECAO, selectionText: '   ', pageUrl: 'https://exemplo.com' }, { title: 'T' });
  servico.clicarNoMenu({ menuItemId: MENU_MINERAR_SELECAO, pageUrl: 'https://exemplo.com' }, { title: 'T' });
  await esperar();
  assert.deepStrictEqual(servico.frases(), []);
  assert.deepStrictEqual(servico.nuvem.gravadas, []);
});

test('salvar no Histórico sem Palavras escolhidas, em Inglês, grava a Palavra automática', async () => {
  const servico = abrirOServiceWorker(comVocabularioDoIngles());
  const resposta = await servico.salvarNoHistorico({ texto: FRASE_COM_PALAVRA_NOVA, origem: 'netflix', contexto: { fonte: 'netflix', titulo: 'Série', detalhe: '' } });

  assert.strictEqual(resposta.ok, true);
  assert.strictEqual(resposta.frase.idioma, 'Inglês');
  assert.strictEqual(resposta.frase.autoKeyword, true);
  assert.ok(resposta.frase.keywords.length > 0);
  assert.deepStrictEqual(servico.frases(), [copiaSimples(resposta.frase)]);
});

test('salvar no Histórico com a lista de Palavras vazia não escolhe Palavra automática', async () => {
  const servico = abrirOServiceWorker(comVocabularioDoIngles());
  const resposta = await servico.salvarNoHistorico({ texto: FRASE_COM_PALAVRA_NOVA, origem: 'netflix', palavras: [] });

  assert.strictEqual(resposta.ok, true);
  assert.strictEqual(resposta.frase.keywords, undefined);
  assert.strictEqual(resposta.frase.autoKeyword, undefined);
});

test('salvar no Histórico com Palavras escolhidas mantém as escolhidas, com autoKeyword falso', async () => {
  const servico = abrirOServiceWorker(comVocabularioDoIngles());
  const resposta = await servico.salvarNoHistorico({ texto: FRASE_COM_PALAVRA_NOVA, origem: 'netflix', palavras: ['drought@8'] });

  assert.deepStrictEqual([resposta.frase.keywords, resposta.frase.autoKeyword], [['drought@8'], false]);
});

test('salvar no Histórico em russo, sem Palavras escolhidas, não grava Palavra', async () => {
  const servico = abrirOServiceWorker({ pm_auto_keyword_vocab_ru: vocabularioDoRusso() });
  const resposta = await servico.salvarNoHistorico({ texto: 'Я улыбаюсь', origem: 'youtube', idioma: 'Russo' });

  assert.strictEqual(resposta.ok, true);
  assert.strictEqual(resposta.frase.keywords, undefined);
  assert.strictEqual(resposta.frase.autoKeyword, undefined);
});

test('a Palavra automática só vale para o Idioma Inglês, mesmo que o texto pareça inglês', async () => {
  const servico = abrirOServiceWorker(comVocabularioDoIngles());
  const resposta = await servico.salvarNoHistorico({ texto: FRASE_COM_PALAVRA_NOVA, origem: 'youtube', idioma: 'Russo' });

  assert.strictEqual(resposta.ok, true);
  assert.strictEqual(resposta.frase.keywords, undefined);
});

test('salvar no Histórico sem leitura do Anki grava a Frase sem Palavra', async () => {
  const servico = abrirOServiceWorker();
  const resposta = await servico.salvarNoHistorico({ texto: FRASE_COM_PALAVRA_NOVA, origem: 'netflix' });

  assert.strictEqual(resposta.ok, true);
  assert.strictEqual(resposta.frase.keywords, undefined);
  assert.strictEqual(servico.frases().length, 1);
});

test('a Frase salva vai para a Nuvem, e o pedido sem Nuvem não', async () => {
  const servico = abrirOServiceWorker();
  const comNuvem = await servico.salvarNoHistorico({ texto: 'Hello brave world', origem: 'web', palavras: ['brave@1'] });
  await esperar();
  assert.deepStrictEqual(servico.nuvem.gravadas, [copiaSimples(comNuvem.frase)]);

  await servico.salvarNoHistorico({ texto: 'Hello again world', origem: 'web', palavras: ['again@1'], semNuvem: true });
  await esperar();
  assert.strictEqual(servico.nuvem.gravadas.length, 1);
  assert.strictEqual(servico.frases().length, 2);
});

test('a Nuvem que falha não impede a Frase de ficar no Histórico', async () => {
  const servico = abrirOServiceWorker();
  servico.nuvem.falha = new Error('nuvem fora');
  const resposta = await servico.salvarNoHistorico({ texto: 'Hello brave world', origem: 'web', palavras: ['brave@1'] });
  await esperar();

  assert.strictEqual(resposta.ok, true);
  assert.deepStrictEqual(servico.frases().map(frase => frase.texto), ['Hello brave world']);
});

test('as Frases salvas em seguida ganham ids diferentes, e a primeira fica com a data de hoje', async () => {
  const servico = abrirOServiceWorker();
  await servico.salvarNoHistorico({ texto: 'Hello brave world', origem: 'web', palavras: ['brave@1'], semNuvem: true });
  await servico.salvarNoHistorico({ texto: 'Hello again world', origem: 'web', palavras: ['again@1'], semNuvem: true });

  const frases = servico.frases();
  assert.strictEqual(new Set(frases.map(frase => frase.id)).size, 2);
  assert.ok(frases.every(frase => frase.id > 0));
  assert.ok(frases.every(frase => frase.data === new Date().toLocaleDateString('pt-BR')));
});

test('a Mineração automática grava a Palavra da avaliação, marca a Frase e a leva à Nuvem; a repetida não grava nem sobe de novo', async () => {
  const servico = abrirOServiceWorker({ ...AJUSTES_LIGADOS, pm_auto_keyword_vocab_en: vocabularioDoIngles(['rain']) });
  const candidata = { texto: 'The ferry left the harbour.', origem: 'prime', contexto: { fonte: 'prime', titulo: 'Série', detalhe: '' }, lang: 'en' };

  const primeira = await servico.candidata(candidata);
  const segunda = await servico.candidata(candidata);
  await esperar();

  assert.strictEqual(primeira.action, 'saved');
  assert.strictEqual(segunda.action, 'skip');
  assert.strictEqual(segunda.reason, 'duplicate');
  const [frase] = servico.frases();
  assert.strictEqual(servico.frases().length, 1);
  assert.deepStrictEqual(
    [frase.autoMiner, frase.autoKeyword, frase.streaming, frase.idioma, frase.contexto],
    [true, true, 'prime', 'Inglês', candidata.contexto],
  );
  assert.ok(frase.keywords.length > 0);
  assert.deepStrictEqual(servico.nuvem.gravadas, [frase]);
});

test('a Mineração automática em russo grava a Frase sem Palavra e a leva à Nuvem', async () => {
  const servico = abrirOServiceWorker({ ...AJUSTES_LIGADOS, pm_auto_keyword_vocab_ru: vocabularioDoRusso() });
  const resposta = await servico.candidata({ texto: 'Я улыбаюсь', origem: 'prime', lang: 'ru' });
  await esperar();

  assert.strictEqual(resposta.action, 'saved');
  const [frase] = servico.frases();
  assert.deepStrictEqual([frase.idioma, frase.keywords, frase.autoKeyword, frase.autoMiner], ['Russo', undefined, undefined, true]);
  assert.deepStrictEqual(servico.nuvem.gravadas, [frase]);
});

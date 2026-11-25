'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FONTE = fs.readFileSync(path.join(__dirname, '..', 'preview', 'chrome-simulado.js'), 'utf8');
const esperar = () => new Promise(resolver => setTimeout(resolver, 5));
const comoValores = valor => (valor === undefined ? undefined : JSON.parse(JSON.stringify(valor)));
const igual = (obtido, esperado, mensagem) => assert.deepStrictEqual(comoValores(obtido), comoValores(esperado), mensagem);

function carregar({ chromeDoNavegador } = {}) {
  const abertas = [];
  const faixas = [];
  const aoCarregar = [];
  const janela = { open: (...argumentos) => abertas.push(argumentos), location: { href: 'about:blank' }, chrome: chromeDoNavegador };
  const documento = {
    baseURI: 'http://preview.local/extensao/painel/painel.html',
    body: { appendChild: faixa => faixas.push(faixa) },
    createElement: () => ({ style: {} }),
    addEventListener: (nome, ouvinte) => aoCarregar.push([nome, ouvinte]),
  };
  const contexto = vm.createContext({ window: janela, document: documento, setTimeout, Date, URL, JSON, Object, Array, Promise });
  vm.runInContext(FONTE, contexto);
  return { janela, abertas, faixas, aoCarregar, chrome: janela.chrome };
}

const comCallback = chamar => new Promise(resolver => {
  const retorno = chamar((...valores) => resolver(valores));
  assert.strictEqual(retorno, undefined, 'com callback não devolve promessa');
});

async function oArmazenamentoLeComCopiasEOsPadroes() {
  const { chrome } = carregar();
  const tudo = await chrome.storage.local.get(null);
  igual(Object.keys(tudo).sort(), [
    'ankiBridgePresets', 'frases', 'geminiApiKey', 'pm_atalho', 'pm_auto_miner_settings', 'pm_auto_miner_state_view',
    'pm_boas_vindas', 'pm_deleted_ids', 'pm_migrated']);
  assert.strictEqual(tudo.frases.length, 6);
  igual(tudo.pm_boas_vindas, { agoraNao: [], concluida: false });
  tudo.pm_boas_vindas.concluida = true;
  assert.strictEqual((await chrome.storage.local.get('pm_boas_vindas')).pm_boas_vindas.concluida, false, 'quem lê recebe uma cópia');
  const pedidas = await chrome.storage.local.get(['geminiApiKey', 'naoExiste']);
  igual(Object.keys(pedidas), ['geminiApiKey', 'naoExiste']);
  igual(pedidas, { geminiApiKey: '' });
  igual(await chrome.storage.local.get({ pm_migrated: false, outro: 7 }), { pm_migrated: true, outro: 7 });
  igual(await chrome.storage.sync.get('geminiApiKey'), { geminiApiKey: '' });
  assert.strictEqual(chrome.storage.sync, chrome.storage.local, 'local e sync são a mesma área');
}

async function aLeituraComCallbackChegaDepoisEDevolveNada() {
  const { chrome } = carregar();
  let chegou = false;
  const retorno = chrome.storage.local.get('geminiApiKey', valores => { chegou = valores; });
  assert.strictEqual(retorno, undefined);
  assert.strictEqual(chegou, false, 'o callback não roda na hora');
  await esperar();
  igual(chegou, { geminiApiKey: '' });
}

async function gravarAvisaOsOuvintesComOValorAntigoEONovoESoDepois() {
  const { chrome } = carregar();
  const avisos = [];
  chrome.storage.onChanged.addListener((mudancas, area) => avisos.push([comoValores(mudancas), area]));
  const retorno = await chrome.storage.local.set({ geminiApiKey: 'AIza', novo: { a: 1 } });
  assert.strictEqual(retorno, undefined);
  igual(avisos, [], 'o aviso sai depois');
  await esperar();
  igual(avisos, [[{ geminiApiKey: { oldValue: '', newValue: 'AIza' }, novo: { newValue: { a: 1 } } }, 'local']]);
  igual(await chrome.storage.local.get(['geminiApiKey', 'novo']), { geminiApiKey: 'AIza', novo: { a: 1 } });
  const [vazio] = await comCallback(retorno => chrome.storage.local.set({ x: 1 }, retorno));
  assert.strictEqual(vazio, undefined);
}

async function oOuvinteQueSaiNaoRecebeMaisNada() {
  const { chrome } = carregar();
  const avisos = [];
  chrome.storage.onChanged.addListener(mudancas => avisos.push(mudancas));
  assert.strictEqual(chrome.storage.onChanged.removeListener(() => {}), undefined);
  await chrome.storage.local.set({ x: 1 });
  await esperar();
  assert.strictEqual(avisos.length, 1);
}

async function removerEApagarTiramAsChavesEDevolvemNada() {
  const { chrome } = carregar();
  assert.strictEqual(await chrome.storage.local.remove('geminiApiKey'), undefined);
  assert.strictEqual('geminiApiKey' in await chrome.storage.local.get(null), false);
  await chrome.storage.local.remove(['pm_migrated', 'pm_deleted_ids']);
  const restante = Object.keys(await chrome.storage.local.get(null));
  assert.strictEqual(restante.includes('pm_migrated') || restante.includes('pm_deleted_ids'), false);
  await comCallback(retorno => chrome.storage.local.remove('frases', retorno));
  assert.strictEqual('frases' in await chrome.storage.local.get(null), false);
  assert.strictEqual(await chrome.storage.local.clear(), undefined);
  igual(await chrome.storage.local.get(null), {});
  igual(await comCallback(retorno => chrome.storage.local.clear(retorno)), [undefined]);
}

async function asPermissoesDizemSempreQueNao() {
  const { chrome } = carregar();
  assert.strictEqual(await chrome.permissions.contains({ permissions: ['storage'] }), false);
  assert.strictEqual(await chrome.permissions.request({ permissions: ['storage'] }), false);
  igual(await comCallback(retorno => chrome.permissions.contains({}, retorno)), [false]);
  igual(await comCallback(retorno => chrome.permissions.request({}, retorno)), [false]);
}

async function asAbasAbremEVaoParaOEnderecoPedido() {
  const { chrome, janela, abertas } = carregar();
  igual(await chrome.tabs.query({}), [{ id: 1, url: 'https://exemplo.dev', active: true }]);
  igual(await chrome.tabs.create({ url: 'https://exemplo.dev/a' }), { id: 2 });
  igual(abertas, [['https://exemplo.dev/a', '_blank', 'noopener']]);
  igual(await chrome.tabs.create(), { id: 2 });
  igual(await chrome.tabs.create({}), { id: 2 });
  assert.strictEqual(abertas.length, 1, 'sem endereço não abre aba');
  igual(await chrome.tabs.update(1, { url: 'https://exemplo.dev/b' }), { id: 1 });
  assert.strictEqual(janela.location.href, 'https://exemplo.dev/b');
  janela.location.href = 'about:blank';
  igual(await chrome.tabs.update(1), { id: 1 });
  igual(await chrome.tabs.update(1, {}), { id: 1 });
  assert.strictEqual(janela.location.href, 'about:blank', 'sem endereço a aba fica onde está');
  igual(await comCallback(retorno => chrome.tabs.create({ url: 'https://exemplo.dev/c' }, retorno)), [{ id: 2 }]);
  igual(await comCallback(retorno => chrome.tabs.update(1, { url: 'https://exemplo.dev/d' }, retorno)), [{ id: 1 }]);
  assert.strictEqual(janela.location.href, 'https://exemplo.dev/d');
}

async function oRestoDoChromeResponde() {
  const { chrome } = carregar();
  assert.strictEqual(await chrome.windows.update(1, {}), undefined);
  assert.strictEqual(typeof chrome.windows.update(1, {}).then, 'function', 'sem callback a janela devolve a promessa');
  assert.strictEqual(chrome.windows.update(1, {}, () => {}), undefined);
  assert.strictEqual(typeof chrome.tabs.query({}).then, 'function');
  assert.strictEqual(chrome.tabs.query({}, () => {}), undefined);
  assert.strictEqual(chrome.identity.getRedirectURL(), 'http://preview.local/extensao/painel/painel.html');
  assert.strictEqual(await chrome.identity.launchWebAuthFlow({}), undefined);
  assert.strictEqual(chrome.identity.launchWebAuthFlow({}), undefined, 'o login do Google não devolve promessa nem com callback');
  assert.strictEqual(chrome.identity.launchWebAuthFlow({}, () => {}), undefined);
  igual(await comCallback(retorno => chrome.identity.launchWebAuthFlow({}, retorno)), [undefined]);
  igual([chrome.action.setBadgeText({}), chrome.action.setBadgeBackgroundColor({}), chrome.action.setIcon({})], [undefined, undefined, undefined]);
  assert.strictEqual(chrome.runtime.id, 'preview');
  assert.strictEqual(chrome.runtime.lastError, undefined);
  igual(chrome.runtime.getManifest(), { version: 'preview', manifest_version: 3 });
  assert.strictEqual(chrome.runtime.getURL('/painel/painel.css'), 'http://preview.local/extensao/painel/painel/painel.css');
  assert.strictEqual(chrome.runtime.onMessage.addListener(() => {}), undefined);
  assert.strictEqual(chrome.runtime.onMessage.removeListener(() => {}), undefined);
}

async function asMensagensDaMineracaoAutomaticaGuardamOAjuste() {
  const { chrome } = carregar();
  const lida = comoValores(await chrome.runtime.sendMessage({ type: 'AUTO_MINER_GET_STATE' }));
  assert.strictEqual(lida.ok, true);
  igual(lida.state.settings, { en: { enabled: true, dailyLimit: 20 }, ru: { enabled: false, dailyLimit: 15 } });
  const mudada = comoValores(await chrome.runtime.sendMessage({ type: 'AUTO_MINER_SET_SETTINGS', settings: { ru: { enabled: true, dailyLimit: 3 } } }));
  igual(mudada.state.settings.ru, { enabled: true, dailyLimit: 3 });
  igual(comoValores(await chrome.runtime.sendMessage({ type: 'AUTO_MINER_GET_STATE' })).state.settings.ru, { enabled: true, dailyLimit: 3 });
  igual(await chrome.runtime.sendMessage({ type: 'AUTO_MINER_SET_SETTINGS' }), { ok: true, state: comoValores(mudada.state) });
  igual(await chrome.runtime.sendMessage({ type: 'OUTRA' }), { ok: true });
  igual(await chrome.runtime.sendMessage(undefined), { ok: true });
  igual(await comCallback(retorno => chrome.runtime.sendMessage({ type: 'OUTRA' }, retorno)), [{ ok: true }]);
}

function aFaixaDeAvisoEntraQuandoAPaginaCarrega() {
  const { aoCarregar, faixas } = carregar();
  igual(aoCarregar.map(([nome]) => nome), ['DOMContentLoaded']);
  aoCarregar[0][1]();
  assert.strictEqual(faixas.length, 1);
  assert.strictEqual(faixas[0].textContent, 'Preview: dados de exemplo, fora do Chrome. Botões que dependem do navegador não funcionam.');
  assert.ok(faixas[0].style.cssText.startsWith('position:fixed;z-index:2147483647;left:0;right:0;bottom:0;'));
}

function seOChromeDeVerdadeJaTemArmazenamentoNadaMuda() {
  const dele = { storage: { local: { dele: true } } };
  const { janela, aoCarregar } = carregar({ chromeDoNavegador: dele });
  assert.strictEqual(janela.chrome, dele);
  igual(aoCarregar, []);
}

const diaDe = deslocamento => {
  const data = new Date();
  data.setDate(data.getDate() - deslocamento);
  return data.toLocaleDateString('pt-BR');
};

async function asSeisFrasesDeExemploSaemComTudoQueOPainelLe() {
  const { chrome } = carregar();
  const { frases } = await chrome.storage.local.get('frases');
  igual(frases, [
    { id: 1001, texto: "I'm not saying it's your fault, I'm saying it's your responsibility.", contexto: 'The Bear · T2 · E7', streaming: 'netflix', idioma: 'Inglês', data: diaDe(0), keywords: ['responsibility'], autoKeyword: 'responsibility' },
    { id: 1002, texto: 'Мы с тобой одной крови — ты и я.', contexto: 'Маугли · cap. 3', streaming: 'livro', idioma: 'Russo', data: diaDe(0), keywords: ['крови'], autoKeyword: 'крови' },
    { id: 1003, texto: 'The devil is in the details.', contexto: 'The Atlantic', streaming: 'web', idioma: 'Inglês', data: diaDe(1), status: 'exported', keywords: ['details'] },
    { id: 1004, texto: 'Не всё то золото, что блестит.', contexto: 'Редакция · canal', streaming: 'youtube', idioma: 'Russo', data: diaDe(1), status: 'exported', keywords: ['золото'] },
    { id: 1005, texto: 'All that glitters is not gold.', contexto: 'Shakespeare · O Mercador de Veneza', streaming: 'livro', idioma: 'Inglês', data: diaDe(2), keywords: ['glitters'] },
    { id: 1006, texto: 'Тихая гавань проснулась раньше чаек.', contexto: 'Página fotografada · p. 42', streaming: 'manual', idioma: 'Russo', data: diaDe(3) },
  ]);
  igual(frases.map(frase => Object.keys(frase)), [
    ['id', 'texto', 'contexto', 'streaming', 'idioma', 'data', 'keywords', 'autoKeyword'],
    ['id', 'texto', 'contexto', 'streaming', 'idioma', 'data', 'keywords', 'autoKeyword'],
    ['id', 'texto', 'contexto', 'streaming', 'idioma', 'data', 'status', 'keywords'],
    ['id', 'texto', 'contexto', 'streaming', 'idioma', 'data', 'status', 'keywords'],
    ['id', 'texto', 'contexto', 'streaming', 'idioma', 'data', 'keywords'],
    ['id', 'texto', 'contexto', 'streaming', 'idioma', 'data'],
  ]);
}

async function main() {
  await asSeisFrasesDeExemploSaemComTudoQueOPainelLe();
  await oArmazenamentoLeComCopiasEOsPadroes();
  await aLeituraComCallbackChegaDepoisEDevolveNada();
  await gravarAvisaOsOuvintesComOValorAntigoEONovoESoDepois();
  await oOuvinteQueSaiNaoRecebeMaisNada();
  await removerEApagarTiramAsChavesEDevolvemNada();
  await asPermissoesDizemSempreQueNao();
  await asAbasAbremEVaoParaOEnderecoPedido();
  await oRestoDoChromeResponde();
  await asMensagensDaMineracaoAutomaticaGuardamOAjuste();
  aFaixaDeAvisoEntraQuandoAPaginaCarrega();
  seOChromeDeVerdadeJaTemArmazenamentoNadaMuda();
  console.log('chrome simulado tests passed');
}

main().catch(erro => { console.error(erro); process.exit(1); });

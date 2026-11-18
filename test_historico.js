'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

globalThis.PerpetualMiner = globalThis.PerpetualMiner || {};
require('./lib/historico.js');
const { Historico } = globalThis.PerpetualMiner;

const copia = valor => JSON.parse(JSON.stringify(valor));

function armazenamentoComPortao(dados) {
  let portao = null;
  async function ler(pedido) {
    const lido = Object.fromEntries(Object.entries(pedido).map(([chave, padrao]) => [chave, copia(chave in dados ? dados[chave] : padrao)]));
    if (portao && 'frases' in pedido) {
      const { soltar, chegou } = portao;
      portao = null;
      chegou();
      await soltar;
    }
    return lido;
  }
  async function gravar(valores) {
    for (const [chave, valor] of Object.entries(valores)) dados[chave] = copia(valor);
  }
  function segurarAProximaLeitura() {
    let soltar;
    let chegou;
    const aberto = new Promise(resolve => { soltar = resolve; });
    const leu = new Promise(resolve => { chegou = resolve; });
    portao = { soltar: aberto, chegou };
    return { leu, soltar };
  }
  return { area: { get: ler, set: gravar }, segurarAProximaLeitura };
}

function serviceWorker(area) {
  const contexto = {
    console,
    navigator: globalThis.navigator,
    fetch: async () => ({ ok: false }),
    setTimeout,
    clearTimeout,
    Date,
    chrome: {
      contextMenus: { create() {}, onClicked: { addListener() {} } },
      runtime: { onInstalled: { addListener() {} }, onMessage: { addListener() {} }, lastError: null },
      storage: { local: {
        get: (pedido, devolver) => { area.get(pedido).then(devolver); },
        set: (valores, pronto) => { area.set(valores).then(() => pronto?.()); },
      } },
      tabs: { query: (_pedido, devolver) => devolver([]) },
    },
  };
  contexto.importScripts = (...arquivos) => arquivos.forEach(arquivo =>
    vm.runInContext(fs.readFileSync(arquivo, 'utf8'), contexto, { filename: arquivo }));
  vm.createContext(contexto);
  vm.runInContext(fs.readFileSync('background.js', 'utf8'), contexto, { filename: 'background.js' });
  return contexto;
}

const fraseDoPainel = { id: 1, texto: 'He barely made it to the station.', data: '18/11/2026', streaming: 'netflix', idioma: 'Inglês' };

function salvarFoto(sw, texto) {
  return sw.salvarFrase(texto, 'livro', { fonte: 'livro', titulo: 'Livro', detalhe: '' }, 'Inglês',
    { keywords: ['harbour@3'], autoKeyword: false }, { comPalavraAutomatica: false, comNuvem: false });
}

async function aPalavraMarcadaDuranteUmSalvamentoDeFotoNaoSome() {
  const dados = { frases: [fraseDoPainel] };
  const { area, segurarAProximaLeitura } = armazenamentoComPortao(dados);
  const sw = serviceWorker(area);
  const historico = Historico.criar({ armazenamento: area });

  const portao = segurarAProximaLeitura();
  const foto = salvarFoto(sw, 'The ferry left the harbour.');
  await portao.leu;
  const palavra = historico.editar(1, { keywords: ['barely@2'], autoKeyword: false });
  await new Promise(resolve => setTimeout(resolve, 5));
  portao.soltar();
  await Promise.all([foto, palavra]);

  assert.deepStrictEqual(dados.frases.map(f => f.texto), ['The ferry left the harbour.', fraseDoPainel.texto], 'a Frase da foto ficou');
  assert.deepStrictEqual(dados.frases[1].keywords, ['barely@2'], 'e a Palavra marcada no Painel também');
}

async function aFraseDaFotoQueChegaDuranteAGravacaoDaPalavraNaoSome() {
  const dados = { frases: [fraseDoPainel] };
  const { area, segurarAProximaLeitura } = armazenamentoComPortao(dados);
  const sw = serviceWorker(area);
  const historico = Historico.criar({ armazenamento: area });

  const portao = segurarAProximaLeitura();
  const palavra = historico.editar(1, { keywords: ['barely@2'], autoKeyword: false });
  await portao.leu;
  const foto = salvarFoto(sw, 'The ferry left the harbour.');
  await new Promise(resolve => setTimeout(resolve, 5));
  portao.soltar();
  await Promise.all([foto, palavra]);

  assert.deepStrictEqual(dados.frases.map(f => f.texto), ['The ferry left the harbour.', fraseDoPainel.texto], 'a Frase da foto ficou');
  assert.deepStrictEqual(dados.frases[1].keywords, ['barely@2'], 'e a Palavra marcada no Painel também');
}

async function aFraseDaFotoQueChegaEnquantoOPainelApagaOutraNaoSome() {
  const outra = { ...fraseDoPainel, id: 2, texto: 'Let us call it a day.' };
  const dados = { frases: [outra, fraseDoPainel] };
  const { area, segurarAProximaLeitura } = armazenamentoComPortao(dados);
  const sw = serviceWorker(area);
  const historico = Historico.criar({ armazenamento: area });

  const portao = segurarAProximaLeitura();
  const apagar = historico.apagar([2]);
  await portao.leu;
  const foto = salvarFoto(sw, 'The ferry left the harbour.');
  await new Promise(resolve => setTimeout(resolve, 5));
  portao.soltar();
  await Promise.all([foto, apagar]);

  assert.deepStrictEqual(dados.frases.map(f => f.texto), ['The ferry left the harbour.', fraseDoPainel.texto],
    'a Frase da foto ficou e a apagada saiu');
}

async function aFraseApagadaNoPainelDuranteUmSalvamentoDeFotoNaoVolta() {
  const outra = { ...fraseDoPainel, id: 2, texto: 'Let us call it a day.' };
  const dados = { frases: [outra, fraseDoPainel] };
  const { area, segurarAProximaLeitura } = armazenamentoComPortao(dados);
  const sw = serviceWorker(area);
  const historico = Historico.criar({ armazenamento: area });

  const portao = segurarAProximaLeitura();
  const foto = salvarFoto(sw, 'The ferry left the harbour.');
  await portao.leu;
  const apagar = historico.apagar(['2']);
  await new Promise(resolve => setTimeout(resolve, 5));
  portao.soltar();
  const [, quantas] = await Promise.all([foto, apagar]);

  assert.strictEqual(quantas, 1, 'o id em texto apaga a Frase de id numérico');
  assert.deepStrictEqual(dados.frases.map(f => f.texto), ['The ferry left the harbour.', fraseDoPainel.texto],
    'a apagada não voltou com a Frase da foto');
}

async function editarMudaSoOsCamposPedidosNaFraseGravadaAgora() {
  const dados = { frases: [{ ...fraseDoPainel, status: 'exported' }] };
  const historico = Historico.criar({ armazenamento: armazenamentoComPortao(dados).area });

  const editada = await historico.editar(1, { keywords: ['barely@2'], autoKeyword: false });

  assert.deepStrictEqual(dados.frases, [{ ...fraseDoPainel, status: 'exported', keywords: ['barely@2'], autoKeyword: false }],
    'a marca Enviada gravada por outro lugar continua');
  assert.deepStrictEqual(editada, dados.frases[0], 'e editar devolve a Frase como ficou');
}

async function editarUmaFraseQueSaiuDoHistoricoNaoATrazDeVolta() {
  const outra = { ...fraseDoPainel, id: 2, texto: 'Let us call it a day.' };
  const dados = { frases: [outra] };
  const historico = Historico.criar({ armazenamento: armazenamentoComPortao(dados).area });

  const editada = await historico.editar(1, { keywords: ['barely@2'] });

  assert.strictEqual(editada, null);
  assert.deepStrictEqual(dados.frases, [outra]);
}

async function editarVariasMudaSoAsFrasesEOsCamposPedidos() {
  const enviada = { ...fraseDoPainel, status: 'exported' };
  const outra = { ...fraseDoPainel, id: 2, texto: 'Let us call it a day.' };
  const terceira = { ...fraseDoPainel, id: 3, texto: 'Rain drummed on the tin roof.' };
  const dados = { frases: [terceira, outra, enviada] };
  const historico = Historico.criar({ armazenamento: armazenamentoComPortao(dados).area });
  const contexto = { fonte: 'livro', titulo: 'Dark', detalhe: 'T1E3' };

  const editadas = await historico.editarVarias(new Map([[1, { streaming: 'livro', contexto }], ['3', { contexto }], [9, { contexto }]]));

  assert.deepStrictEqual(dados.frases, [{ ...terceira, contexto }, outra, { ...enviada, streaming: 'livro', contexto }],
    'a marca Enviada continua, a outra não muda, e o id que saiu do Histórico não volta');
  assert.deepStrictEqual(editadas, [dados.frases[0], dados.frases[2]], 'e devolve as Frases como ficaram');
}

async function oContextoDeVariasEditadoDuranteUmSalvamentoDeFotoNaoApagaAFoto() {
  const outra = { ...fraseDoPainel, id: 2, texto: 'Let us call it a day.' };
  const dados = { frases: [outra, fraseDoPainel] };
  const { area, segurarAProximaLeitura } = armazenamentoComPortao(dados);
  const sw = serviceWorker(area);
  const historico = Historico.criar({ armazenamento: area });
  const contexto = { fonte: 'netflix', titulo: 'Dark', detalhe: '' };

  const portao = segurarAProximaLeitura();
  const editar = historico.editarVarias([[1, { contexto }], [2, { contexto }]]);
  await portao.leu;
  const foto = salvarFoto(sw, 'The ferry left the harbour.');
  await new Promise(resolve => setTimeout(resolve, 5));
  portao.soltar();
  await Promise.all([foto, editar]);

  assert.deepStrictEqual(dados.frases.map(f => [f.texto, f.contexto?.titulo]),
    [['The ferry left the harbour.', 'Livro'], [outra.texto, 'Dark'], [fraseDoPainel.texto, 'Dark']]);
}

async function aMarcaEnviadaDuranteUmSalvamentoDeFotoNaoApagaAFotoNemAPalavra() {
  const comPalavra = { ...fraseDoPainel, keywords: ['barely@2'], autoKeyword: false };
  const outra = { ...fraseDoPainel, id: 2, texto: 'Let us call it a day.' };
  const dados = { frases: [outra, fraseDoPainel] };
  const { area, segurarAProximaLeitura } = armazenamentoComPortao(dados);
  const sw = serviceWorker(area);
  const historico = Historico.criar({ armazenamento: area });

  const portao = segurarAProximaLeitura();
  const foto = salvarFoto(sw, 'The ferry left the harbour.');
  await portao.leu;
  const palavra = historico.editar(1, { keywords: comPalavra.keywords, autoKeyword: false });
  const enviadas = historico.marcarEnviadas([1, '2']);
  await new Promise(resolve => setTimeout(resolve, 5));
  portao.soltar();
  await Promise.all([foto, palavra, enviadas]);

  assert.deepStrictEqual(dados.frases.slice(1), [{ ...outra, status: 'exported' }, { ...comPalavra, status: 'exported' }],
    'as duas ficam Enviadas ao Anki, e a Palavra marcada antes continua');
  assert.strictEqual(dados.frases[0].texto, 'The ferry left the harbour.', 'e a Frase da foto ficou');
  assert.strictEqual(dados.frases[0].status, undefined, 'sem a marca');
}

async function aMarcaExportadaMudaSoAMarcaDasPedidas() {
  const enviada = { ...fraseDoPainel, status: 'exported' };
  const outra = { ...fraseDoPainel, id: 2, texto: 'Let us call it a day.' };
  const dados = { frases: [outra, enviada] };
  const historico = Historico.criar({ armazenamento: armazenamentoComPortao(dados).area });

  const exportadas = await historico.marcarExportadas([1]);

  assert.deepStrictEqual(dados.frases, [outra, { ...enviada, exportadaTxt: true }], 'Exportada não tira Enviada ao Anki');
  assert.deepStrictEqual(exportadas, [dados.frases[1]]);
}

async function duasFrasesNoMesmoMilissegundoGanhamIdsDiferentesEFicamAsDuas() {
  const dados = { frases: [] };
  const { area } = armazenamentoComPortao(dados);
  const sw = serviceWorker(area);
  const historico = Historico.criar({ armazenamento: area });
  const agora = Date.now;
  Date.now = () => 1_800_000_000_000;
  try {
    const [daFoto, doPainel] = await Promise.all([
      salvarFoto(sw, 'The ferry left the harbour.'),
      historico.acrescentar({ texto: 'Rain drummed on the tin roof.', idioma: 'Inglês' }),
    ]);
    assert.notStrictEqual(daFoto.id, doPainel.id);
  } finally {
    Date.now = agora;
  }
  assert.strictEqual(dados.frases.length, 2);
  assert.strictEqual(new Set(dados.frases.map(f => f.id)).size, 2);
}

(async () => {
  const casos = [
    aPalavraMarcadaDuranteUmSalvamentoDeFotoNaoSome,
    aFraseDaFotoQueChegaDuranteAGravacaoDaPalavraNaoSome,
    aFraseDaFotoQueChegaEnquantoOPainelApagaOutraNaoSome,
    aFraseApagadaNoPainelDuranteUmSalvamentoDeFotoNaoVolta,
    editarMudaSoOsCamposPedidosNaFraseGravadaAgora,
    editarUmaFraseQueSaiuDoHistoricoNaoATrazDeVolta,
    editarVariasMudaSoAsFrasesEOsCamposPedidos,
    oContextoDeVariasEditadoDuranteUmSalvamentoDeFotoNaoApagaAFoto,
    aMarcaEnviadaDuranteUmSalvamentoDeFotoNaoApagaAFotoNemAPalavra,
    aMarcaExportadaMudaSoAMarcaDasPedidas,
    duasFrasesNoMesmoMilissegundoGanhamIdsDiferentesEFicamAsDuas,
  ];
  let falhas = 0;
  for (const caso of casos) {
    try {
      await caso();
      console.log(`ok  ${caso.name}`);
    } catch (erro) {
      falhas++;
      console.log(`FALHOU  ${caso.name}\n${erro.message}`);
    }
  }
  if (falhas) process.exit(1);
  console.log('test_historico.js: tudo certo');
})();

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

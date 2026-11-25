'use strict';

const assert = require('assert');
const {
  fraseDoPainel, outraFrase, salvarFoto, cenario, corrida, historicoSobre, deixarCorrer, nuvemComPortaoNaSubida, sincronizacaoSobre,
} = require('./apoio-do-historico');

const PALAVRA_E_FOTO = [
  ['aPalavraMarcadaDuranteUmSalvamentoDeFotoNaoSome', 'foto'],
  ['aFraseDaFotoQueChegaDuranteAGravacaoDaPalavraNaoSome', 'palavra'],
];

function casoDaPalavraEDaFoto(quemFicaRetida) {
  return async () => {
    const c = cenario([fraseDoPainel]);
    const foto = () => salvarFoto(c.sw, 'The ferry left the harbour.');
    const palavra = () => c.historico.editar(1, { keywords: ['barely@2'], autoKeyword: false });

    await (quemFicaRetida === 'foto' ? corrida(c, foto, palavra) : corrida(c, palavra, foto));

    assert.deepStrictEqual(c.dados.frases.map(f => f.texto), ['The ferry left the harbour.', fraseDoPainel.texto], 'a Frase da foto ficou');
    assert.deepStrictEqual(c.dados.frases[1].keywords, ['barely@2'], 'e a Palavra marcada no Painel também');
  };
}

const APAGAR_E_FOTO = [
  ['aFraseDaFotoQueChegaEnquantoOPainelApagaOutraNaoSome', 'apagar', [2], 'a Frase da foto ficou e a apagada saiu'],
  ['aFraseApagadaNoPainelDuranteUmSalvamentoDeFotoNaoVolta', 'foto', ['2'], 'a apagada não voltou com a Frase da foto'],
];

function casoDeApagarEDaFoto(quemFicaRetida, ids, motivo) {
  return async () => {
    const c = cenario([outraFrase, fraseDoPainel]);
    const foto = () => salvarFoto(c.sw, 'The ferry left the harbour.');
    let quantas;
    const apagar = async () => { quantas = await c.historico.apagar(ids); };

    await (quemFicaRetida === 'foto' ? corrida(c, foto, apagar) : corrida(c, apagar, foto));

    assert.strictEqual(quantas, 1, 'o id apaga a Frase de id numérico, em texto ou não');
    assert.deepStrictEqual(c.dados.frases.map(f => f.texto), ['The ferry left the harbour.', fraseDoPainel.texto], motivo);
  };
}

async function editarMudaSoOsCamposPedidosNaFraseGravadaAgora() {
  const dados = { frases: [{ ...fraseDoPainel, status: 'exported' }] };
  const historico = historicoSobre(dados);

  const editada = await historico.editar(1, { keywords: ['barely@2'], autoKeyword: false });

  assert.deepStrictEqual(dados.frases, [{ ...fraseDoPainel, status: 'exported', keywords: ['barely@2'], autoKeyword: false }],
    'a marca Enviada gravada por outro lugar continua');
  assert.deepStrictEqual(editada, dados.frases[0], 'e editar devolve a Frase como ficou');
}

async function editarUmaFraseQueSaiuDoHistoricoNaoATrazDeVolta() {
  const dados = { frases: [outraFrase] };
  const historico = historicoSobre(dados);

  const editada = await historico.editar(1, { keywords: ['barely@2'] });

  assert.strictEqual(editada, null);
  assert.deepStrictEqual(dados.frases, [outraFrase]);
}

async function editarVariasMudaSoAsFrasesEOsCamposPedidos() {
  const enviada = { ...fraseDoPainel, status: 'exported' };
  const terceira = { ...fraseDoPainel, id: 3, texto: 'Rain drummed on the tin roof.' };
  const dados = { frases: [terceira, outraFrase, enviada] };
  const historico = historicoSobre(dados);
  const contexto = { fonte: 'livro', titulo: 'Dark', detalhe: 'T1E3' };

  const editadas = await historico.editarVarias(new Map([[1, { streaming: 'livro', contexto }], ['3', { contexto }], [9, { contexto }]]));

  assert.deepStrictEqual(dados.frases, [{ ...terceira, contexto }, outraFrase, { ...enviada, streaming: 'livro', contexto }],
    'a marca Enviada continua, a outra não muda, e o id que saiu do Histórico não volta');
  assert.deepStrictEqual(editadas, [dados.frases[0], dados.frases[2]], 'e devolve as Frases como ficaram');
}

async function oContextoDeVariasEditadoDuranteUmSalvamentoDeFotoNaoApagaAFoto() {
  const c = cenario([outraFrase, fraseDoPainel]);
  const contexto = { fonte: 'netflix', titulo: 'Dark', detalhe: '' };

  await corrida(c, () => c.historico.editarVarias([[1, { contexto }], [2, { contexto }]]), () => salvarFoto(c.sw, 'The ferry left the harbour.'));

  assert.deepStrictEqual(c.dados.frases.map(f => [f.texto, f.contexto?.titulo]),
    [['The ferry left the harbour.', 'Livro'], [outraFrase.texto, 'Dark'], [fraseDoPainel.texto, 'Dark']]);
}

async function aMarcaEnviadaDuranteUmSalvamentoDeFotoNaoApagaAFotoNemAPalavra() {
  const comPalavra = { ...fraseDoPainel, keywords: ['barely@2'], autoKeyword: false };
  const c = cenario([outraFrase, fraseDoPainel]);
  const palavraEMarca = () => Promise.all([
    c.historico.editar(1, { keywords: comPalavra.keywords, autoKeyword: false }),
    c.historico.marcarEnviadas([1, '2']),
  ]);

  await corrida(c, () => salvarFoto(c.sw, 'The ferry left the harbour.'), palavraEMarca);

  assert.deepStrictEqual(c.dados.frases.slice(1), [{ ...outraFrase, status: 'exported' }, { ...comPalavra, status: 'exported' }],
    'as duas ficam Enviadas ao Anki, e a Palavra marcada antes continua');
  assert.strictEqual(c.dados.frases[0].texto, 'The ferry left the harbour.', 'e a Frase da foto ficou');
  assert.strictEqual(c.dados.frases[0].status, undefined, 'sem a marca');
}

async function aMarcaExportadaMudaSoAMarcaDasPedidas() {
  const enviada = { ...fraseDoPainel, status: 'exported' };
  const dados = { frases: [outraFrase, enviada] };
  const historico = historicoSobre(dados);

  const exportadas = await historico.marcarExportadas([1]);

  assert.deepStrictEqual(dados.frases, [outraFrase, { ...enviada, exportadaTxt: true }], 'Exportada não tira Enviada ao Anki');
  assert.deepStrictEqual(exportadas, [dados.frases[1]]);
}

async function aFraseDaFotoSalvaEnquantoOCarregarSobeAsOrfasNaoSome() {
  const orfa = { ...fraseDoPainel, id: 2, texto: 'Let us call it a day.' };
  const { dados, area, sw } = cenario([orfa, fraseDoPainel]);
  const { nuvem, subindo, soltar } = nuvemComPortaoNaSubida([{ ...fraseDoPainel, status: 'exported' }]);

  const carregar = sincronizacaoSobre(area, nuvem).carregar();
  await subindo;
  await salvarFoto(sw, 'The ferry left the harbour.');
  soltar();
  await carregar;

  assert.deepStrictEqual(dados.frases.map(f => [f.texto, f.status]),
    [['The ferry left the harbour.', undefined], [orfa.texto, undefined], [fraseDoPainel.texto, 'exported']],
    'a Frase da foto ficou, e a marca Enviada da nuvem chegou só à Frase que a tinha');
}

async function aFraseDaFotoSalvaEnquantoOCarregarTiraAsApagadasNaoSome() {
  const apagadaNoOutro = { ...fraseDoPainel, id: 2, texto: 'Let us call it a day.' };
  const c = cenario([apagadaNoOutro, fraseDoPainel]);
  const { nuvem } = nuvemComPortaoNaSubida([fraseDoPainel], { tombstones: ['2'] });

  await corrida(c, () => sincronizacaoSobre(c.area, nuvem).carregar(), () => salvarFoto(c.sw, 'The ferry left the harbour.'));

  assert.deepStrictEqual(c.dados.frases.map(f => f.texto), ['The ferry left the harbour.', fraseDoPainel.texto],
    'a apagada no outro computador saiu, e a Frase da foto ficou');
}

async function duasFrasesNoMesmoMilissegundoGanhamIdsDiferentesEFicamAsDuas() {
  const { dados, sw, historico } = cenario([]);
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
    ...PALAVRA_E_FOTO.map(([nome, quemFicaRetida]) => [nome, casoDaPalavraEDaFoto(quemFicaRetida)]),
    ...APAGAR_E_FOTO.map(([nome, ...resto]) => [nome, casoDeApagarEDaFoto(...resto)]),
    editarMudaSoOsCamposPedidosNaFraseGravadaAgora,
    editarUmaFraseQueSaiuDoHistoricoNaoATrazDeVolta,
    editarVariasMudaSoAsFrasesEOsCamposPedidos,
    oContextoDeVariasEditadoDuranteUmSalvamentoDeFotoNaoApagaAFoto,
    aMarcaEnviadaDuranteUmSalvamentoDeFotoNaoApagaAFotoNemAPalavra,
    aMarcaExportadaMudaSoAMarcaDasPedidas,
    aFraseDaFotoSalvaEnquantoOCarregarSobeAsOrfasNaoSome,
    aFraseDaFotoSalvaEnquantoOCarregarTiraAsApagadasNaoSome,
    duasFrasesNoMesmoMilissegundoGanhamIdsDiferentesEFicamAsDuas,
  ];
  let falhas = 0;
  for (const [nome, caso] of casos.map(c => (Array.isArray(c) ? c : [c.name, c]))) {
    try {
      await caso();
      console.log(`ok  ${nome}`);
    } catch (erro) {
      falhas++;
      console.log(`FALHOU  ${nome}\n${erro.message}`);
    }
  }
  if (falhas) process.exit(1);
  console.log('test_historico.js: tudo certo');
})();

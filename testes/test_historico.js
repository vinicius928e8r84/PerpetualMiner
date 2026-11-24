'use strict';

const assert = require('assert');
const {
  fraseDoPainel, salvarFoto, cenario, historicoSobre, deixarCorrer, nuvemComPortaoNaSubida, sincronizacaoSobre,
} = require('./apoio-do-historico');

async function aPalavraMarcadaDuranteUmSalvamentoDeFotoNaoSome() {
  const { dados, segurarAProximaLeitura, sw, historico } = cenario([fraseDoPainel]);

  const portao = segurarAProximaLeitura();
  const foto = salvarFoto(sw, 'The ferry left the harbour.');
  await portao.leu;
  const palavra = historico.editar(1, { keywords: ['barely@2'], autoKeyword: false });
  await deixarCorrer();
  portao.soltar();
  await Promise.all([foto, palavra]);

  assert.deepStrictEqual(dados.frases.map(f => f.texto), ['The ferry left the harbour.', fraseDoPainel.texto], 'a Frase da foto ficou');
  assert.deepStrictEqual(dados.frases[1].keywords, ['barely@2'], 'e a Palavra marcada no Painel também');
}

async function aFraseDaFotoQueChegaDuranteAGravacaoDaPalavraNaoSome() {
  const { dados, segurarAProximaLeitura, sw, historico } = cenario([fraseDoPainel]);

  const portao = segurarAProximaLeitura();
  const palavra = historico.editar(1, { keywords: ['barely@2'], autoKeyword: false });
  await portao.leu;
  const foto = salvarFoto(sw, 'The ferry left the harbour.');
  await deixarCorrer();
  portao.soltar();
  await Promise.all([foto, palavra]);

  assert.deepStrictEqual(dados.frases.map(f => f.texto), ['The ferry left the harbour.', fraseDoPainel.texto], 'a Frase da foto ficou');
  assert.deepStrictEqual(dados.frases[1].keywords, ['barely@2'], 'e a Palavra marcada no Painel também');
}

async function aFraseDaFotoQueChegaEnquantoOPainelApagaOutraNaoSome() {
  const outra = { ...fraseDoPainel, id: 2, texto: 'Let us call it a day.' };
  const { dados, segurarAProximaLeitura, sw, historico } = cenario([outra, fraseDoPainel]);

  const portao = segurarAProximaLeitura();
  const apagar = historico.apagar([2]);
  await portao.leu;
  const foto = salvarFoto(sw, 'The ferry left the harbour.');
  await deixarCorrer();
  portao.soltar();
  await Promise.all([foto, apagar]);

  assert.deepStrictEqual(dados.frases.map(f => f.texto), ['The ferry left the harbour.', fraseDoPainel.texto],
    'a Frase da foto ficou e a apagada saiu');
}

async function aFraseApagadaNoPainelDuranteUmSalvamentoDeFotoNaoVolta() {
  const outra = { ...fraseDoPainel, id: 2, texto: 'Let us call it a day.' };
  const { dados, segurarAProximaLeitura, sw, historico } = cenario([outra, fraseDoPainel]);

  const portao = segurarAProximaLeitura();
  const foto = salvarFoto(sw, 'The ferry left the harbour.');
  await portao.leu;
  const apagar = historico.apagar(['2']);
  await deixarCorrer();
  portao.soltar();
  const [, quantas] = await Promise.all([foto, apagar]);

  assert.strictEqual(quantas, 1, 'o id em texto apaga a Frase de id numérico');
  assert.deepStrictEqual(dados.frases.map(f => f.texto), ['The ferry left the harbour.', fraseDoPainel.texto],
    'a apagada não voltou com a Frase da foto');
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
  const outra = { ...fraseDoPainel, id: 2, texto: 'Let us call it a day.' };
  const dados = { frases: [outra] };
  const historico = historicoSobre(dados);

  const editada = await historico.editar(1, { keywords: ['barely@2'] });

  assert.strictEqual(editada, null);
  assert.deepStrictEqual(dados.frases, [outra]);
}

async function editarVariasMudaSoAsFrasesEOsCamposPedidos() {
  const enviada = { ...fraseDoPainel, status: 'exported' };
  const outra = { ...fraseDoPainel, id: 2, texto: 'Let us call it a day.' };
  const terceira = { ...fraseDoPainel, id: 3, texto: 'Rain drummed on the tin roof.' };
  const dados = { frases: [terceira, outra, enviada] };
  const historico = historicoSobre(dados);
  const contexto = { fonte: 'livro', titulo: 'Dark', detalhe: 'T1E3' };

  const editadas = await historico.editarVarias(new Map([[1, { streaming: 'livro', contexto }], ['3', { contexto }], [9, { contexto }]]));

  assert.deepStrictEqual(dados.frases, [{ ...terceira, contexto }, outra, { ...enviada, streaming: 'livro', contexto }],
    'a marca Enviada continua, a outra não muda, e o id que saiu do Histórico não volta');
  assert.deepStrictEqual(editadas, [dados.frases[0], dados.frases[2]], 'e devolve as Frases como ficaram');
}

async function oContextoDeVariasEditadoDuranteUmSalvamentoDeFotoNaoApagaAFoto() {
  const outra = { ...fraseDoPainel, id: 2, texto: 'Let us call it a day.' };
  const { dados, segurarAProximaLeitura, sw, historico } = cenario([outra, fraseDoPainel]);
  const contexto = { fonte: 'netflix', titulo: 'Dark', detalhe: '' };

  const portao = segurarAProximaLeitura();
  const editar = historico.editarVarias([[1, { contexto }], [2, { contexto }]]);
  await portao.leu;
  const foto = salvarFoto(sw, 'The ferry left the harbour.');
  await deixarCorrer();
  portao.soltar();
  await Promise.all([foto, editar]);

  assert.deepStrictEqual(dados.frases.map(f => [f.texto, f.contexto?.titulo]),
    [['The ferry left the harbour.', 'Livro'], [outra.texto, 'Dark'], [fraseDoPainel.texto, 'Dark']]);
}

async function aMarcaEnviadaDuranteUmSalvamentoDeFotoNaoApagaAFotoNemAPalavra() {
  const comPalavra = { ...fraseDoPainel, keywords: ['barely@2'], autoKeyword: false };
  const outra = { ...fraseDoPainel, id: 2, texto: 'Let us call it a day.' };
  const { dados, segurarAProximaLeitura, sw, historico } = cenario([outra, fraseDoPainel]);

  const portao = segurarAProximaLeitura();
  const foto = salvarFoto(sw, 'The ferry left the harbour.');
  await portao.leu;
  const palavra = historico.editar(1, { keywords: comPalavra.keywords, autoKeyword: false });
  const enviadas = historico.marcarEnviadas([1, '2']);
  await deixarCorrer();
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
  const historico = historicoSobre(dados);

  const exportadas = await historico.marcarExportadas([1]);

  assert.deepStrictEqual(dados.frases, [outra, { ...enviada, exportadaTxt: true }], 'Exportada não tira Enviada ao Anki');
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
  const { dados, area, segurarAProximaLeitura, sw } = cenario([apagadaNoOutro, fraseDoPainel]);
  const { nuvem } = nuvemComPortaoNaSubida([fraseDoPainel], { tombstones: ['2'] });

  const portao = segurarAProximaLeitura();
  const carregar = sincronizacaoSobre(area, nuvem).carregar();
  await portao.leu;
  const foto = salvarFoto(sw, 'The ferry left the harbour.');
  await deixarCorrer();
  portao.soltar();
  await Promise.all([carregar, foto]);

  assert.deepStrictEqual(dados.frases.map(f => f.texto), ['The ferry left the harbour.', fraseDoPainel.texto],
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
    aFraseDaFotoSalvaEnquantoOCarregarSobeAsOrfasNaoSome,
    aFraseDaFotoSalvaEnquantoOCarregarTiraAsApagadasNaoSome,
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

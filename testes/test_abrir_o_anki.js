'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const contrato = require('../complemento/contrato/carregar.js');

const comoValores = async promessa => JSON.parse(JSON.stringify(await promessa));

const exemploDoAbridor = (acao, anki) => contrato.abridor.exemplos
  .find(e => e.daExtensao && e.mensagem.acao === acao && e.contexto.anki === anki).resposta;

const exemploDoConserto = contexto => contrato.conserto.exemplos.find(e => e.contexto.conserto === contexto).resposta;

function carregar({ permissao = true, jaTem = permissao, responder = () => exemploDoAbridor('abrir', 'no_lugar'), situacoes = ['ligada'], relogio = {}, globais = {}, extras = {}, arquivos = ['lib/abridor.js', 'lib/abrir-o-anki.js'] }) {
  const chamadas = [];
  const enviadas = [];
  let conferencias = 0;
  let tem = jaTem;
  const contexto = vm.createContext({
    setTimeout: relogio.setTimeout || setTimeout, clearTimeout,
    document: { getElementById: () => null },
    ...globais,
    chrome: {
      permissions: {
        contains: async () => tem,
        request: pedido => { chamadas.push(pedido); tem = permissao; return Promise.resolve(permissao); },
      },
      runtime: {
        async sendNativeMessage(host, mensagem) {
          enviadas.push({ host, mensagem: JSON.parse(JSON.stringify(mensagem)) });
          return responder(mensagem);
        },
      },
      storage: { local: { get: async () => ({}), set: async () => {} } },
    },
  });
  contexto.globalThis = contexto;
  contexto.PerpetualMiner = {
    ConexaoAnki: {
      SITUACAO: { CONECTANDO: 'conectando', LIGADA: 'ligada', DESLIGADA: 'desligada' },
      conferir: async () => situacoes[Math.min(conferencias++, situacoes.length - 1)],
      ...extras.ConexaoAnki,
    },
    ...extras.outros,
  };
  for (const arquivo of arquivos) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', arquivo), 'utf8'), contexto);
  }
  return { Abridor: contexto.PerpetualMiner.Abridor, AbrirOAnki: contexto.PerpetualMiner.AbrirOAnki, EnvioComOAnkiFechado: contexto.PerpetualMiner.EnvioComOAnkiFechado, chamadas, enviadas, conferencias: () => conferencias };
}

function relogioFalso() {
  let agora = 0;
  const timers = [];
  const deixarAndar = () => new Promise(resolver => setImmediate(resolver));
  return {
    setTimeout: (funcao, atraso) => { timers.push({ quando: agora + atraso, funcao }); return timers.length; },
    async avancar(ms) {
      const fim = agora + ms;
      await deixarAndar();
      for (;;) {
        timers.sort((a, b) => a.quando - b.quando);
        if (!timers.length || timers[0].quando > fim) break;
        const { quando, funcao } = timers.shift();
        agora = quando;
        funcao();
        await deixarAndar();
      }
      agora = fim;
    },
    deixarAndar,
  };
}

function carregarFaixa({ responder } = {}) {
  const relogio = relogioFalso();
  let aviso = null;
  const aoLigar = [];
  let situacao = 'desligada';
  let ouvinte = () => {};
  const documento = {
    querySelector: () => aviso,
    getElementById: id => (id === 'frases-avisos' ? { append: novo => { aviso = novo; } } : null),
  };
  const Veio = {
    montarAviso: opcoes => {
      const novo = { dataset: {}, ...opcoes, remove: () => { if (aviso === novo) aviso = null; } };
      return novo;
    },
  };
  const { EnvioComOAnkiFechado, enviadas } = carregar({
    jaTem: false,
    situacoes: ['desligada'],
    responder,
    relogio,
    globais: { document: documento },
    extras: {
      ConexaoAnki: {
        conferir: async () => situacao,
        acompanhar: funcao => { ouvinte = funcao; },
      },
      outros: { textoDaVoz: id => id, Veio },
    },
    arquivos: ['lib/abridor.js', 'lib/abrir-o-anki.js', 'painel/painel-envio-anki-fechado.js'],
  });
  const faixa = EnvioComOAnkiFechado.criar({ aoLigar: ids => aoLigar.push(ids) });
  return {
    relogio, faixa, aoLigar, enviadas,
    aviso: () => aviso,
    clicarNoBotao: () => aviso.acao.aoUsar({ currentTarget: { getAttribute: () => null, setAttribute() {}, removeAttribute() {} } }),
    ligar: () => { situacao = 'ligada'; ouvinte('ligada'); },
  };
}

const SEM_ABRIDOR = 'Specified native messaging host not found.';
const semAbridor = () => { throw new Error(SEM_ABRIDOR); };
const PRAZO_DA_ESPERA_INTEIRA = 125_000;
const ordem = ({ enviadas }) => enviadas.map(e => e.mensagem.acao);
const porMensagem = (conserto, abrir = 'no_lugar') => m => (m.acao === 'consertar' ? exemploDoConserto(conserto) : exemploDoAbridor('abrir', abrir));
const comAConexao = (conserto, situacoes, extras = {}) => carregar({
  responder: porMensagem(conserto), situacoes, extras: { ConexaoAnki: { jaConectou: () => true, ...extras } },
});
const comAConexaoJaVista = opcoes => carregar({ ...opcoes, extras: { ConexaoAnki: { jaConectou: () => true } } });

async function oCliquePedeAPermissaoEAbre() {
  const { Abridor, AbrirOAnki, chamadas, enviadas } = carregar({});
  const clique = AbrirOAnki.abrirNoClique();
  assert.strictEqual(chamadas.length, 1, 'o clique pede a permissão na hora, antes de qualquer espera: o Chrome só pede dentro do gesto');
  assert.deepStrictEqual(await comoValores(clique), { resultado: Abridor.RESULTADO.ABRIU, detalhe: '' },
    'com a permissão e o Anki no lugar, o clique abre o Anki');
  assert.deepStrictEqual(enviadas.map(e => e.mensagem), [{ acao: 'abrir' }], 'ao abridor vai só o abrir, nunca um conferir antes');
  assert.strictEqual(enviadas[0].host, Abridor.HOST);
}

async function oCliqueSemPermissaoNaoChegaAoAbridor() {
  const { Abridor, AbrirOAnki, enviadas } = carregar({ permissao: false });
  assert.deepStrictEqual(await comoValores(AbrirOAnki.abrirNoClique()), { resultado: Abridor.RESULTADO.SEM_PERMISSAO, detalhe: '' },
    'a permissão recusada diz SEM_PERMISSAO');
  assert.deepStrictEqual(enviadas, [], 'sem a permissão nada chega ao abridor');
}

async function oCliqueComOAnkiForaDoLugarOuSemAbridor() {
  const foraDoLugar = carregar({ responder: () => exemploDoAbridor('abrir', 'sumiu') });
  assert.deepStrictEqual(await comoValores(foraDoLugar.AbrirOAnki.abrirNoClique()), { resultado: foraDoLugar.Abridor.RESULTADO.NAO_ABRIU, detalhe: '' },
    'o Anki fora do lugar é NAO_ABRIU');
  const { Abridor, AbrirOAnki } = carregar({ responder: semAbridor });
  assert.deepStrictEqual(await comoValores(AbrirOAnki.abrirNoClique()),
    { resultado: Abridor.RESULTADO.SEM_ABRIDOR, detalhe: SEM_ABRIDOR },
    'o abridor que não existe é SEM_ABRIDOR, com o que o Chrome disse');
}

async function aEsperaConfereAteOPrazo() {
  const responde = carregar({ situacoes: ['desligada', 'desligada', 'ligada'] });
  assert.strictEqual(await responde.AbrirOAnki.esperarOAnki({ prazo: 1000, intervalo: 1 }), true, 'espera até a Conexão responder ligada');
  assert.strictEqual(responde.conferencias(), 3, 'confere o /health a cada intervalo, e para quando responde');
  const { AbrirOAnki, conferencias } = carregar({ situacoes: ['desligada'] });
  assert.strictEqual(await AbrirOAnki.esperarOAnki({ prazo: 20, intervalo: 5 }), false, 'a Conexão que não responde no prazo diz false');
  assert.ok(conferencias() >= 2 && conferencias() <= 6, `não confere sem parar: ${conferencias()}`);
}

async function aFaixaAbreNoCliqueEEnviaQuandoLiga() {
  const { relogio, faixa, aoLigar, aviso, clicarNoBotao, ligar } = carregarFaixa();
  faixa.pedir(['a']);
  await relogio.deixarAndar();
  assert.strictEqual(aviso().texto, 'ENV-16.abra', 'sem a permissão, a faixa pede que a pessoa abra o Anki');
  await relogio.avancar(118_000);
  clicarNoBotao();
  await relogio.avancar(10_000);
  assert.strictEqual(aviso().texto, 'ENV-16.abrindo', 'o Anki abriu no clique: passado o prazo do pedido, a faixa segue dizendo que abre');
  ligar();
  assert.deepStrictEqual(aoLigar, [['a']], 'o Anki respondeu: as Frases pedidas saem');
}

async function aFaixaVoltaAPedirQuandoOAnkiNaoResponde() {
  const { relogio, faixa, aoLigar, aviso, clicarNoBotao } = carregarFaixa();
  faixa.pedir(['a']);
  await relogio.deixarAndar();
  await relogio.avancar(118_000);
  clicarNoBotao();
  await relogio.avancar(100_000);
  assert.strictEqual(aviso().texto, 'ENV-16.abrindo', 'a espera nova dura os 2 min inteiros');
  await relogio.avancar(30_000);
  assert.strictEqual(aviso().texto, 'ENV-16.abra', 'o Anki que não responde nem na espera nova volta a pedir que a pessoa o abra');
  assert.match(aviso().detalhes, /sem resposta/);
  assert.deepStrictEqual(aoLigar, []);
}

async function aFaixaNaoReabreOAnkiQueAPessoaFechou() {
  const { relogio, faixa, aoLigar, aviso, clicarNoBotao, enviadas } = carregarFaixa({ responder: () => exemploDoConserto('anki_fechou_na_espera') });
  faixa.pedir(['a']);
  await relogio.deixarAndar();
  clicarNoBotao();
  await relogio.avancar(1_000);
  assert.strictEqual(aviso().texto, 'ENV-16.abra', 'a pessoa fechou o Anki: a faixa pede que ela o abra');
  assert.deepStrictEqual(enviadas.map(e => e.mensagem.acao), ['consertar'], 'e o abridor não recebe um abrir');
  assert.deepStrictEqual(aoLigar, []);
}

async function oAnkiFechadoAbreDepoisDoConsertar() {
  const { AbrirOAnki, enviadas } = comAConexao('anki_fechado', ['ligada']);
  const fim = await comoValores(AbrirOAnki.abrirOuConsertar({ aoMudar: () => {} }));
  assert.strictEqual(fim.desfecho, 'aberto', 'o Anki que a pessoa fechou abre quando ela pede, e a Conexão responde');
  assert.deepStrictEqual(ordem({ enviadas }), ['consertar', 'abrir'], 'consertar vem antes de abrir, e o Anki fechado só é aberto pelo abrir');
}

async function oAbridorQueConsertaNaoRecebeAbrir() {
  for (const [conserto, desfecho] of [['anki_travado', 'reiniciado'], ['complemento_desativado', 'ligado']]) {
    const { AbrirOAnki, enviadas } = comAConexao(conserto, ['desligada', 'ligada']);
    const fim = await comoValores(AbrirOAnki.abrirOuConsertar({}));
    assert.strictEqual(fim.desfecho, desfecho, `${conserto}: o abridor consertou e a Conexão voltou`);
    assert.deepStrictEqual(ordem({ enviadas }), ['consertar'], `${conserto}: o abridor já reabriu o Anki, a extensão não manda abrir de novo`);
  }
  const { AbrirOAnki, enviadas } = comAConexao('anki_travado', ['desligada']);
  const fim = await comoValores(AbrirOAnki.abrirOuConsertar({ continuar: () => false }));
  assert.strictEqual(fim.desfecho, 'falhou', 'reiniciou e a Conexão não voltou: não deu para consertar');
  assert.deepStrictEqual(ordem({ enviadas }), ['consertar']);
}

const DESFECHOS_DO_ABRIDOR = [['complemento_sumiu', 'sumiu', undefined], ['anki_nao_fecha', 'falhou', 'nao_fechou'], ['anki_nao_abre', 'falhou', 'nao_abriu']];

async function oDesfechoDoAbridorChegaComDiagnostico() {
  for (const [conserto, desfecho, motivo] of DESFECHOS_DO_ABRIDOR) {
    const { AbrirOAnki, enviadas } = comAConexao(conserto, ['desligada']);
    const fim = await comoValores(AbrirOAnki.abrirOuConsertar({}));
    assert.deepStrictEqual([fim.desfecho, fim.motivo], [desfecho, motivo], `${conserto}: o desfecho do abridor`);
    assert.deepStrictEqual(ordem({ enviadas }), ['consertar'], `${conserto}: sem abrir o Anki por cima do que o abridor disse`);
    assert.ok(fim.passos.length >= 1 && fim.quando, `${conserto}: o diagnóstico sabe o que se passou`);
  }
  const { AbrirOAnki, enviadas } = comAConexao('anki_fechou_na_espera', ['desligada']);
  const fim = await comoValores(AbrirOAnki.abrirOuConsertar({}));
  assert.strictEqual(fim.desfecho, 'fechou', 'a pessoa fechou o Anki durante a espera: o desfecho diz isso');
  assert.deepStrictEqual(ordem({ enviadas }), ['consertar'], 'o Anki que a pessoa fechou na espera não é reaberto pela extensão');
}

async function aConexaoForaTemFalaPropria() {
  const { AbrirOAnki, enviadas } = carregar({
    responder: porMensagem('conexao_fora'), situacoes: ['desligada'],
    extras: { ConexaoAnki: { jaConectou: () => true }, outros: { textoDaVoz: id => id } },
  });
  const fim = await comoValores(AbrirOAnki.abrirOuConsertar({}));
  assert.deepStrictEqual([fim.desfecho, fim.motivo], ['falhou', 'conexao_fora'], 'o Anki saudável com a Conexão fora: o abridor não mata e a extensão conta');
  assert.deepStrictEqual(ordem({ enviadas }), ['consertar']);
  assert.strictEqual(AbrirOAnki.falaDoDesfecho(fim).texto, 'BRG-39.conexaoFora', 'a fala própria do conexao_fora, não a do conserto que falhou');
  assert.match(AbrirOAnki.falaDoDesfecho(fim).detalhes, /conexao_fora/, 'o diagnóstico leva o motivo');
  assert.strictEqual(AbrirOAnki.falaDoDesfecho({ ...fim, motivo: 'nao_fechou' }).texto, 'BRG-39.falhou');
}

async function esperarAEsperaInteira(carregado, relogio) {
  const andando = carregado.AbrirOAnki.abrirOuConsertar({});
  await relogio.avancar(PRAZO_DA_ESPERA_INTEIRA);
  return (await comoValores(andando)).desfecho;
}

const consertarRespondendo = respostas => m => (m.acao === 'consertar' ? respostas.shift() : exemploDoAbridor('abrir', 'no_lugar'));

async function soUmAbrirPorPedidoQuandoAPessoaFechaNaEspera() {
  const relogio = relogioFalso();
  const respostas = [exemploDoConserto('anki_fechado'), exemploDoConserto('anki_fechou_na_espera')];
  const carregado = carregar({
    relogio, responder: consertarRespondendo(respostas), situacoes: ['desligada'], extras: { ConexaoAnki: { jaConectou: () => true } },
  });
  assert.strictEqual(await esperarAEsperaInteira(carregado, relogio), 'fechou');
  assert.deepStrictEqual(ordem(carregado), ['consertar', 'abrir', 'consertar'], 'só um abrir por pedido');
}

async function soUmAbrirPorPedidoQuandoOComplementoLiga() {
  const relogio = relogioFalso();
  let situacao = 'desligada';
  const respostas = [exemploDoConserto('anki_fechado'), exemploDoConserto('complemento_desativado')];
  const responderEnquantoLiga = consertarRespondendo(respostas);
  const carregado = carregar({
    relogio,
    responder: m => {
      const resposta = responderEnquantoLiga(m);
      if (resposta.situacao === 'ligado') situacao = 'ligada';
      return resposta;
    },
    extras: { ConexaoAnki: { jaConectou: () => true, conferir: async () => situacao } },
  });
  assert.strictEqual(await esperarAEsperaInteira(carregado, relogio), 'ligado');
  assert.deepStrictEqual(ordem(carregado), ['consertar', 'abrir', 'consertar']);
}

async function soUmAbrirPorPedidoSemResposta() {
  const relogio = relogioFalso();
  const carregado = comAConexaoJaVista({ relogio, responder: porMensagem('anki_fechado'), situacoes: ['desligada'] });
  assert.strictEqual(await esperarAEsperaInteira(carregado, relogio), 'sem_resposta');
  assert.deepStrictEqual(ordem(carregado), ['consertar', 'abrir', 'consertar'], 'só um abrir por pedido');
}

async function oAbridorAntigoAindaAbre() {
  const { AbrirOAnki, enviadas } = comAConexaoJaVista({
    responder: m => (m.acao === 'consertar' ? { erro: 'acao_desconhecida' } : exemploDoAbridor('abrir', 'no_lugar')),
  });
  assert.strictEqual((await comoValores(AbrirOAnki.abrirOuConsertar({}))).desfecho, 'aberto');
  assert.deepStrictEqual(ordem({ enviadas }), ['consertar', 'abrir']);
}

async function semAbridorODesfechoDependeDeJaTerConectado() {
  for (const [jaConectou, desfecho] of [[true, 'sumiu'], [false, 'nao_abriu']]) {
    const { AbrirOAnki } = carregar({ responder: semAbridor, extras: { ConexaoAnki: { jaConectou: () => jaConectou } } });
    assert.strictEqual((await comoValores(AbrirOAnki.abrirOuConsertar({}))).desfecho, desfecho, `já conectou: ${jaConectou}`);
  }
}

async function oConsertarRapidoNaoPiscaConferindo() {
  const relogio = relogioFalso();
  const fases = [];
  let responder;
  const { AbrirOAnki } = comAConexaoJaVista({ relogio, responder: () => new Promise(resolver => { responder = resolver; }) });
  const andando = AbrirOAnki.abrirOuConsertar({ aoMudar: fase => fases.push(fase) });
  await relogio.avancar(2_000);
  assert.deepStrictEqual(fases, [], 'um consertar rápido (o Anki fechado) não pisca “conferindo”');
  await relogio.avancar(2_000);
  assert.deepStrictEqual(fases, ['consertando'], 'passados 3 s, a faixa diz que confere');
  responder(exemploDoConserto('anki_travado'));
  assert.strictEqual((await comoValores(andando)).desfecho, 'reiniciado');
}

function oDesfechoDoConsertoSemEsperaSaiDeUmaTabela() {
  const { AbrirOAnki, Abridor } = carregar({ extras: { ConexaoAnki: { jaConectou: () => true } } });
  const { RESULTADO } = Abridor;
  const desfechoDe = conserto => AbrirOAnki.desfechoDoConserto(conserto) && JSON.parse(JSON.stringify(AbrirOAnki.desfechoDoConserto(conserto)));
  assert.deepStrictEqual(desfechoDe({ resultado: RESULTADO.RESPONDEU }), { desfecho: 'respondeu' });
  assert.deepStrictEqual(desfechoDe({ resultado: RESULTADO.FECHOU }), { desfecho: 'fechou' });
  assert.deepStrictEqual(desfechoDe({ resultado: RESULTADO.SUMIU }), { desfecho: 'sumiu' });
  assert.deepStrictEqual(desfechoDe({ resultado: RESULTADO.SEM_PERMISSAO }), { desfecho: 'sem_permissao' });
  assert.deepStrictEqual(desfechoDe({ resultado: RESULTADO.FALHOU, motivo: 'conexao_fora' }), { desfecho: 'falhou', motivo: 'conexao_fora' });
  assert.deepStrictEqual(desfechoDe({ resultado: RESULTADO.SEM_ABRIDOR, detalhe: 'Native host has exited. not found' }), { desfecho: 'sumiu' });
  assert.strictEqual(desfechoDe({ resultado: RESULTADO.SEM_ABRIDOR, detalhe: 'outro erro' }), null);
  assert.strictEqual(desfechoDe({ resultado: RESULTADO.ABRIU }), null);
  assert.strictEqual(desfechoDe({ resultado: 'constructor' }), null);
}

const CASOS = [
  oCliquePedeAPermissaoEAbre,
  oCliqueSemPermissaoNaoChegaAoAbridor,
  oCliqueComOAnkiForaDoLugarOuSemAbridor,
  aEsperaConfereAteOPrazo,
  aFaixaAbreNoCliqueEEnviaQuandoLiga,
  aFaixaVoltaAPedirQuandoOAnkiNaoResponde,
  aFaixaNaoReabreOAnkiQueAPessoaFechou,
  oAnkiFechadoAbreDepoisDoConsertar,
  oAbridorQueConsertaNaoRecebeAbrir,
  oDesfechoDoAbridorChegaComDiagnostico,
  aConexaoForaTemFalaPropria,
  soUmAbrirPorPedidoQuandoAPessoaFechaNaEspera,
  soUmAbrirPorPedidoQuandoOComplementoLiga,
  soUmAbrirPorPedidoSemResposta,
  oAbridorAntigoAindaAbre,
  semAbridorODesfechoDependeDeJaTerConectado,
  oConsertarRapidoNaoPiscaConferindo,
  oDesfechoDoConsertoSemEsperaSaiDeUmaTabela,
];

async function main() {
  for (const casoDoAbrir of CASOS) await casoDoAbrir();
  console.log('abrir o anki tests passed');
}

main().catch(erro => { console.error(erro); process.exit(1); });

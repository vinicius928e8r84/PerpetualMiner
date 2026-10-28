'use strict';

// Abrir o Anki a pedido da pessoa (lib/abrir-o-anki.js, #150): o que o clique pede ao Chrome e ao abridor, e
// quanto ele espera o Anki responder. A seam é a mesma de test_abridor.js: `chrome.permissions` e
// `chrome.runtime.sendNativeMessage` são funções do teste; as respostas do abridor saem do contrato
// (complemento/contrato/exemplos.json › abridor). O que o e2e não alcança e mora aqui: a ordem do pedido da
// permissão (o Chrome só pede dentro do clique) e o prazo de espera, que no e2e levaria minutos.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const contrato = require('./complemento/contrato/exemplos.json');

const comoValores = async promessa => JSON.parse(JSON.stringify(await promessa));

const exemploDoAbridor = (acao, anki) => contrato.abridor.exemplos
  .find(e => e.daExtensao && e.mensagem.acao === acao && e.contexto.anki === anki).resposta;

/**
 * As libs como a página as carrega. `permissao` é o que o Chrome faz com o pedido (true: já dada ou dada agora;
 * false: recusada); `situacoes` é o que cada conferência do /health da Conexão responde, em ordem (a última se repete).
 */
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
    vm.runInContext(fs.readFileSync(path.join(__dirname, arquivo), 'utf8'), contexto);
  }
  return { Abridor: contexto.PerpetualMiner.Abridor, AbrirOAnki: contexto.PerpetualMiner.AbrirOAnki, EnvioComOAnkiFechado: contexto.PerpetualMiner.EnvioComOAnkiFechado, chamadas, enviadas, conferencias: () => conferencias };
}

/** Um relógio de mentira: `setTimeout` guarda o timer e `avancar(ms)` roda os que vencem, deixando as promessas andarem entre eles. */
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

/** A faixa do Envio (painel-envio-anki-fechado.js) com a página de mentira: o aviso de agora, o botão e as Frases enviadas. */
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
  const { EnvioComOAnkiFechado } = carregar({
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
    arquivos: ['lib/abridor.js', 'lib/abrir-o-anki.js', 'painel-envio-anki-fechado.js'],
  });
  const faixa = EnvioComOAnkiFechado.criar({ aoLigar: ids => aoLigar.push(ids) });
  return {
    relogio, faixa, aoLigar,
    aviso: () => aviso,
    clicarNoBotao: () => aviso.acao.aoUsar({ currentTarget: { getAttribute: () => null, setAttribute() {}, removeAttribute() {} } }),
    ligar: () => { situacao = 'ligada'; ouvinte('ligada'); },
  };
}

async function main() {
  {
    const { Abridor, AbrirOAnki, chamadas, enviadas } = carregar({});
    const clique = AbrirOAnki.abrirNoClique();
    assert.strictEqual(chamadas.length, 1, 'o clique pede a permissão na hora, antes de qualquer espera: o Chrome só pede dentro do gesto');
    assert.deepStrictEqual(await comoValores(clique), { resultado: Abridor.RESULTADO.ABRIU, detalhe: '' },
      'com a permissão e o Anki no lugar, o clique abre o Anki');
    assert.deepStrictEqual(enviadas.map(e => e.mensagem), [{ acao: 'abrir' }], 'ao abridor vai só o abrir, nunca um conferir antes');
    assert.strictEqual(enviadas[0].host, Abridor.HOST);
  }

  {
    const { Abridor, AbrirOAnki, enviadas } = carregar({ permissao: false });
    assert.deepStrictEqual(await comoValores(AbrirOAnki.abrirNoClique()), { resultado: Abridor.RESULTADO.SEM_PERMISSAO, detalhe: '' },
      'a permissão recusada diz SEM_PERMISSAO');
    assert.deepStrictEqual(enviadas, [], 'sem a permissão nada chega ao abridor');
  }

  {
    const { Abridor, AbrirOAnki } = carregar({ responder: () => exemploDoAbridor('abrir', 'sumiu') });
    assert.deepStrictEqual(await comoValores(AbrirOAnki.abrirNoClique()), { resultado: Abridor.RESULTADO.NAO_ABRIU, detalhe: '' },
      'o Anki fora do lugar é NAO_ABRIU');
  }

  {
    const { Abridor, AbrirOAnki } = carregar({ responder: () => { throw new Error('Specified native messaging host not found.'); } });
    assert.deepStrictEqual(await comoValores(AbrirOAnki.abrirNoClique()),
      { resultado: Abridor.RESULTADO.SEM_ABRIDOR, detalhe: 'Specified native messaging host not found.' },
      'o abridor que não existe é SEM_ABRIDOR, com o que o Chrome disse');
  }

  {
    const { AbrirOAnki, conferencias } = carregar({ situacoes: ['desligada', 'desligada', 'ligada'] });
    assert.strictEqual(await AbrirOAnki.esperarOAnki({ prazo: 1000, intervalo: 1 }), true, 'espera até a Conexão responder ligada');
    assert.strictEqual(conferencias(), 3, 'confere o /health a cada intervalo, e para quando responde');
  }

  {
    const { AbrirOAnki, conferencias } = carregar({ situacoes: ['desligada'] });
    assert.strictEqual(await AbrirOAnki.esperarOAnki({ prazo: 20, intervalo: 5 }), false, 'a Conexão que não responde no prazo diz false');
    assert.ok(conferencias() >= 2 && conferencias() <= 6, `não confere sem parar: ${conferencias()}`);
  }

  {
    // O prazo de 2 min da faixa recomeça quando a pessoa aperta Abrir o Anki sozinho e o Anki abre.
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

  {
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

  console.log('abrir o anki tests passed');
}

main().catch(erro => { console.error(erro); process.exit(1); });

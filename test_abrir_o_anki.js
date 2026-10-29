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

const contrato = require('./complemento/contrato/carregar.js');

const comoValores = async promessa => JSON.parse(JSON.stringify(await promessa));

const exemploDoAbridor = (acao, anki) => contrato.abridor.exemplos
  .find(e => e.daExtensao && e.mensagem.acao === acao && e.contexto.anki === anki).resposta;

const exemploDoConserto = contexto => contrato.conserto.exemplos.find(e => e.contexto.conserto === contexto).resposta;

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
    arquivos: ['lib/abridor.js', 'lib/abrir-o-anki.js', 'painel-envio-anki-fechado.js'],
  });
  const faixa = EnvioComOAnkiFechado.criar({ aoLigar: ids => aoLigar.push(ids) });
  return {
    relogio, faixa, aoLigar, enviadas,
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

  {
    // O Anki que a pessoa fechou na espera do consertar: a faixa pede que ela o abra e não manda abrir por conta própria.
    const { relogio, faixa, aoLigar, aviso, clicarNoBotao, enviadas } = carregarFaixa({ responder: () => exemploDoConserto('anki_fechou_na_espera') });
    faixa.pedir(['a']);
    await relogio.deixarAndar();
    clicarNoBotao();
    await relogio.avancar(1_000);
    assert.strictEqual(aviso().texto, 'ENV-16.abra', 'a pessoa fechou o Anki: a faixa pede que ela o abra');
    assert.deepStrictEqual(enviadas.map(e => e.mensagem.acao), ['consertar'], 'e o abridor não recebe um abrir');
    assert.deepStrictEqual(aoLigar, []);
  }

  // O consertar sem clique (#152): o abridor conserta primeiro e só abre o Anki que está fechado.
  {
    const esperadas = ['consertar', 'abrir'];
    const ordem = ({ enviadas }) => enviadas.map(e => e.mensagem.acao);
    const porMensagem = (conserto, abrir = 'no_lugar') => m => (m.acao === 'consertar' ? exemploDoConserto(conserto) : exemploDoAbridor('abrir', abrir));
    const comAConexao = (conserto, situacoes, extras = {}) => carregar({
      responder: porMensagem(conserto), situacoes, extras: { ConexaoAnki: { jaConectou: () => true, ...extras } },
    });

    {
      const { AbrirOAnki, enviadas } = comAConexao('anki_fechado', ['ligada']);
      const fim = await comoValores(AbrirOAnki.abrirOuConsertar({ aoMudar: () => {} }));
      assert.strictEqual(fim.desfecho, 'aberto', 'o Anki que a pessoa fechou abre quando ela pede, e a Conexão responde');
      assert.deepStrictEqual(enviadas.map(e => e.mensagem.acao), esperadas, 'consertar vem antes de abrir, e o Anki fechado só é aberto pelo abrir');
    }
    for (const [conserto, desfecho] of [['anki_travado', 'reiniciado'], ['complemento_desativado', 'ligado']]) {
      const { AbrirOAnki, enviadas } = comAConexao(conserto, ['desligada', 'ligada']);
      const fim = await comoValores(AbrirOAnki.abrirOuConsertar({}));
      assert.strictEqual(fim.desfecho, desfecho, `${conserto}: o abridor consertou e a Conexão voltou`);
      assert.deepStrictEqual(ordem({ enviadas }), ['consertar'], `${conserto}: o abridor já reabriu o Anki, a extensão não manda abrir de novo`);
    }
    {
      const { AbrirOAnki, enviadas } = comAConexao('anki_travado', ['desligada']);
      const fim = await comoValores(AbrirOAnki.abrirOuConsertar({ continuar: () => false }));
      assert.strictEqual(fim.desfecho, 'falhou', 'reiniciou e a Conexão não voltou: não deu para consertar');
      assert.deepStrictEqual(ordem({ enviadas }), ['consertar']);
    }
    for (const [conserto, desfecho, motivo] of [['complemento_sumiu', 'sumiu', undefined], ['anki_nao_fecha', 'falhou', 'nao_fechou'], ['anki_nao_abre', 'falhou', 'nao_abriu']]) {
      const { AbrirOAnki, enviadas } = comAConexao(conserto, ['desligada']);
      const fim = await comoValores(AbrirOAnki.abrirOuConsertar({}));
      assert.deepStrictEqual([fim.desfecho, fim.motivo], [desfecho, motivo], `${conserto}: o desfecho do abridor`);
      assert.deepStrictEqual(ordem({ enviadas }), ['consertar'], `${conserto}: sem abrir o Anki por cima do que o abridor disse`);
      assert.ok(fim.passos.length >= 1 && fim.quando, `${conserto}: o diagnóstico sabe o que se passou`);
    }
    {
      // O Anki que a pessoa fechou DURANTE a espera do consertar não é o fechado de antes: a extensão não manda abrir.
      const { AbrirOAnki, enviadas } = comAConexao('anki_fechou_na_espera', ['desligada']);
      const fim = await comoValores(AbrirOAnki.abrirOuConsertar({}));
      assert.strictEqual(fim.desfecho, 'fechou', 'a pessoa fechou o Anki durante a espera: o desfecho diz isso');
      assert.deepStrictEqual(ordem({ enviadas }), ['consertar'], 'o Anki que a pessoa fechou na espera não é reaberto pela extensão');
    }
    {
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
    {
      // O Anki aberto pela extensão e fechado pela pessoa antes do segundo consertar: continua fechado, sem terceiro abrir.
      const relogio = relogioFalso();
      const respostas = [exemploDoConserto('anki_fechado'), exemploDoConserto('anki_fechou_na_espera')];
      const { AbrirOAnki, enviadas } = carregar({
        relogio, responder: m => (m.acao === 'consertar' ? respostas.shift() : exemploDoAbridor('abrir', 'no_lugar')),
        situacoes: ['desligada'], extras: { ConexaoAnki: { jaConectou: () => true } },
      });
      const andando = AbrirOAnki.abrirOuConsertar({});
      await relogio.avancar(125_000);
      assert.strictEqual((await comoValores(andando)).desfecho, 'fechou');
      assert.deepStrictEqual(ordem({ enviadas }), ['consertar', 'abrir', 'consertar'], 'só um abrir por pedido');
    }
    {
      // O Anki abriu, a Conexão continua muda (desativada): o abridor vê o Anki aberto, liga e reinicia, uma vez só.
      const relogio = relogioFalso();
      let situacao = 'desligada';
      const respostas = [exemploDoConserto('anki_fechado'), exemploDoConserto('complemento_desativado')];
      const { AbrirOAnki, enviadas } = carregar({
        relogio,
        responder: m => {
          if (m.acao !== 'consertar') return exemploDoAbridor('abrir', 'no_lugar');
          const resposta = respostas.shift();
          if (resposta.situacao === 'ligado') situacao = 'ligada';
          return resposta;
        },
        extras: { ConexaoAnki: { jaConectou: () => true, conferir: async () => situacao } },
      });
      const andando = AbrirOAnki.abrirOuConsertar({});
      await relogio.avancar(125_000);
      assert.strictEqual((await comoValores(andando)).desfecho, 'ligado');
      assert.deepStrictEqual(ordem({ enviadas }), ['consertar', 'abrir', 'consertar']);
    }
    {
      // O Anki que a pessoa fechou durante a espera continua fechado: o segundo consertar o encontra fechado e nada o abre de novo.
      const relogio = relogioFalso();
      const { AbrirOAnki, enviadas } = carregar({
        relogio, responder: porMensagem('anki_fechado'), situacoes: ['desligada'], extras: { ConexaoAnki: { jaConectou: () => true } },
      });
      const andando = AbrirOAnki.abrirOuConsertar({});
      await relogio.avancar(125_000);
      assert.strictEqual((await comoValores(andando)).desfecho, 'sem_resposta');
      assert.deepStrictEqual(ordem({ enviadas }), ['consertar', 'abrir', 'consertar'], 'só um abrir por pedido');
    }
    {
      // Um abridor de antes do consertar (acao_desconhecida) abre como antes.
      const { AbrirOAnki, enviadas } = carregar({
        responder: m => (m.acao === 'consertar' ? { erro: 'acao_desconhecida' } : exemploDoAbridor('abrir', 'no_lugar')),
        extras: { ConexaoAnki: { jaConectou: () => true } },
      });
      assert.strictEqual((await comoValores(AbrirOAnki.abrirOuConsertar({}))).desfecho, 'aberto');
      assert.deepStrictEqual(ordem({ enviadas }), esperadas);
    }
    {
      // O host que o Chrome não acha mais: quem já conectou perdeu a Conexão do Anki; quem nunca conectou não tem o que reinstalar.
      for (const [jaConectou, desfecho] of [[true, 'sumiu'], [false, 'nao_abriu']]) {
        const { AbrirOAnki } = carregar({
          responder: () => { throw new Error('Specified native messaging host not found.'); },
          extras: { ConexaoAnki: { jaConectou: () => jaConectou } },
        });
        assert.strictEqual((await comoValores(AbrirOAnki.abrirOuConsertar({}))).desfecho, desfecho, `já conectou: ${jaConectou}`);
      }
    }
    {
      // “Conferindo…” só aparece se o consertar demora (a espera de 30 s do abridor).
      const relogio = relogioFalso();
      const fases = [];
      let responder;
      const { AbrirOAnki } = carregar({
        relogio, responder: () => new Promise(resolver => { responder = resolver; }), extras: { ConexaoAnki: { jaConectou: () => true } },
      });
      const andando = AbrirOAnki.abrirOuConsertar({ aoMudar: fase => fases.push(fase) });
      await relogio.avancar(2_000);
      assert.deepStrictEqual(fases, [], 'um consertar rápido (o Anki fechado) não pisca “conferindo”');
      await relogio.avancar(2_000);
      assert.deepStrictEqual(fases, ['consertando'], 'passados 3 s, a faixa diz que confere');
      responder(exemploDoConserto('anki_travado'));
      assert.strictEqual((await comoValores(andando)).desfecho, 'reiniciado');
    }
  }

  console.log('abrir o anki tests passed');
}

main().catch(erro => { console.error(erro); process.exit(1); });

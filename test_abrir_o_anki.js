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
function carregar({ permissao = true, responder = () => exemploDoAbridor('abrir', 'no_lugar'), situacoes = ['ligada'] }) {
  const chamadas = [];
  const enviadas = [];
  let conferencias = 0;
  const contexto = vm.createContext({
    setTimeout, clearTimeout,
    document: { getElementById: () => null },
    chrome: {
      permissions: {
        contains: async () => permissao,
        request: pedido => { chamadas.push(pedido); return Promise.resolve(permissao); },
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
    },
  };
  for (const arquivo of ['abridor.js', 'abrir-o-anki.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, 'lib', arquivo), 'utf8'), contexto);
  }
  return { Abridor: contexto.PerpetualMiner.Abridor, AbrirOAnki: contexto.PerpetualMiner.AbrirOAnki, chamadas, enviadas, conferencias: () => conferencias };
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

  console.log('abrir o anki tests passed');
}

main().catch(erro => { console.error(erro); process.exit(1); });

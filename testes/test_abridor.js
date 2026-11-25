'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const contrato = require('../complemento/contrato/carregar.js');

const comoValores = async promessa => JSON.parse(JSON.stringify(await promessa));

const exemploDoAbridor = (acao, anki) => contrato.abridor.exemplos
  .find(e => e.daExtensao && e.mensagem.acao === acao && e.contexto.anki === anki).resposta;

function carregarOAbridor({ responder, permissao = true }) {
  const enviadas = [];
  const contexto = vm.createContext({
    setTimeout, clearTimeout,
    document: { getElementById: () => null },
    chrome: {
      permissions: { contains: async () => permissao },
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
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'lib', 'abridor.js'), 'utf8'), contexto);
  return { Abridor: contexto.PerpetualMiner.Abridor, enviadas };
}

async function main() {
  {
    const { Abridor, enviadas } = carregarOAbridor({ responder: m => exemploDoAbridor(m.acao, 'no_lugar') });
    assert.deepStrictEqual(await comoValores(Abridor.conferirOAnki()), { resultado: Abridor.RESULTADO.ACHOU, detalhe: '' },
      'o conferir com o Anki no lugar achou');
    assert.deepStrictEqual(await comoValores(Abridor.abrirOAnki()), { resultado: Abridor.RESULTADO.ABRIU, detalhe: '' },
      'o abrir com o Anki no lugar abriu');
    assert.deepStrictEqual(enviadas.map(e => e.mensagem), [{ acao: 'conferir' }, { acao: 'abrir' }],
      'a extensão manda as mensagens dos construtores, nada mais');
    assert.deepStrictEqual([...new Set(enviadas.map(e => e.host))], [contrato.abridor.host],
      'e manda ao host que a Conexão registra');
  }
  {
    const { Abridor } = carregarOAbridor({ responder: m => exemploDoAbridor(m.acao, 'sumiu') });
    assert.deepStrictEqual(await comoValores(Abridor.conferirOAnki()), { resultado: Abridor.RESULTADO.NAO_ACHOU, detalhe: '' },
      'o conferir sem o Anki no lugar não achou');
    assert.deepStrictEqual(await comoValores(Abridor.abrirOAnki()), { resultado: Abridor.RESULTADO.NAO_ABRIU, detalhe: '' },
      'o abrir sem o Anki no lugar não abriu');
  }

  {
    const { Abridor } = carregarOAbridor({ responder: m => exemploDoAbridor(m.acao, 'nao_abre') });
    assert.deepStrictEqual(await comoValores(Abridor.conferirOAnki()), { resultado: Abridor.RESULTADO.ACHOU, detalhe: '' },
      'o conferir com o Anki no lugar achou, mesmo que o sistema não consiga abri-lo');
    assert.deepStrictEqual(await comoValores(Abridor.abrirOAnki()), { resultado: Abridor.RESULTADO.NAO_ABRIU, detalhe: '' },
      'achou o Anki e não abriu: NAO_ABRIU');
  }

  {
    const { Abridor, enviadas } = carregarOAbridor({ permissao: false, responder: () => ({ achou: true }) });
    assert.deepStrictEqual(await comoValores(Abridor.conferirOAnki()), { resultado: Abridor.RESULTADO.SEM_PERMISSAO, detalhe: '' },
      'sem a permissão, o conferir diz SEM_PERMISSAO');
    assert.deepStrictEqual(await comoValores(Abridor.abrirOAnki()), { resultado: Abridor.RESULTADO.SEM_PERMISSAO, detalhe: '' },
      'sem a permissão, o abrir diz SEM_PERMISSAO');
    assert.deepStrictEqual(enviadas, [], 'e nada chega ao abridor');
  }

  {
    const recado = 'Specified native messaging host not found.';
    const { Abridor } = carregarOAbridor({ responder: () => { throw new Error(recado); } });
    assert.deepStrictEqual(await comoValores(Abridor.conferirOAnki()), { resultado: Abridor.RESULTADO.SEM_ABRIDOR, detalhe: recado },
      'o conferir sem o host diz SEM_ABRIDOR com o recado do Chrome');
    assert.deepStrictEqual(await comoValores(Abridor.abrirOAnki()), { resultado: Abridor.RESULTADO.SEM_ABRIDOR, detalhe: recado },
      'o abrir sem o host diz SEM_ABRIDOR com o recado do Chrome');
  }

  for (const esquisita of [null, undefined, {}, { achou: 'sim' }, { abriu: true }, 'achou', 0,
    { achou: 'sim', abriu: 'sim' }, { achou: 1, abriu: 1 }]) {
    const { Abridor } = carregarOAbridor({ responder: () => esquisita });
    const comoDisse = JSON.stringify(esquisita ?? null);
    assert.deepStrictEqual(await comoValores(Abridor.conferirOAnki()), { resultado: Abridor.RESULTADO.SEM_ABRIDOR, detalhe: comoDisse },
      `o conferir com a resposta ${comoDisse} diz SEM_ABRIDOR, com o que o abridor disse`);
    assert.deepStrictEqual(await comoValores(Abridor.abrirOAnki()), { resultado: Abridor.RESULTADO.SEM_ABRIDOR, detalhe: comoDisse },
      `o abrir com a resposta ${comoDisse} diz SEM_ABRIDOR, com o que o abridor disse`);
  }

  for (const meiaVerdade of [{ achou: false, abriu: true }, { achou: true, abriu: false }]) {
    const { Abridor } = carregarOAbridor({ responder: () => meiaVerdade });
    assert.deepStrictEqual(await comoValores(Abridor.abrirOAnki()), { resultado: Abridor.RESULTADO.NAO_ABRIU, detalhe: '' },
      `o abrir com ${JSON.stringify(meiaVerdade)} diz NAO_ABRIU`);
  }

  {
    const { Abridor } = carregarOAbridor({ responder: () => null });
    for (const exemplo of contrato.conserto.exemplos) {
      const { Abridor: A } = carregarOAbridor({ responder: () => exemplo.resposta });
      assert.deepStrictEqual(await comoValores(A.consertarOAnki()),
        { resultado: exemplo.resposta.situacao, motivo: exemplo.resposta.motivo ?? '', detalhe: '' }, exemplo.nome);
    }
    assert.ok(Abridor.LIMITE_DO_CONSERTO_MS >= 30_000 + 10_000 + 20_000, 'a conversa do consertar cobre a espera, o fechar e o abrir');
  }
  {
    const { Abridor, enviadas } = carregarOAbridor({ permissao: false, responder: () => ({ situacao: 'reiniciado' }) });
    assert.deepStrictEqual(await comoValores(Abridor.consertarOAnki()), { resultado: Abridor.RESULTADO.SEM_PERMISSAO, detalhe: '' },
      'sem a permissão o consertar não fecha nada');
    assert.deepStrictEqual(enviadas, []);
  }
  {
    const recado = 'Specified native messaging host not found.';
    const { Abridor, enviadas } = carregarOAbridor({ responder: () => { throw new Error(recado); } });
    assert.deepStrictEqual(await comoValores(Abridor.consertarOAnki()), { resultado: Abridor.RESULTADO.SEM_ABRIDOR, detalhe: recado });
    assert.deepStrictEqual(enviadas.map(e => e.mensagem), [{ acao: 'consertar' }]);
  }
  for (const esquisita of [null, {}, { erro: 'acao_desconhecida' }, { situacao: 'quase' }, { situacao: 'achou' }, { achou: true, abriu: true }, { situacao: ['reiniciado'] }]) {
    const { Abridor } = carregarOAbridor({ responder: () => esquisita });
    assert.deepStrictEqual(await comoValores(Abridor.consertarOAnki()),
      { resultado: Abridor.RESULTADO.SEM_ABRIDOR, detalhe: JSON.stringify(esquisita ?? null) }, `consertar com a resposta ${JSON.stringify(esquisita)}`);
  }

  console.log('abridor tests passed');
}

main().catch(erro => { console.error(erro); process.exit(1); });

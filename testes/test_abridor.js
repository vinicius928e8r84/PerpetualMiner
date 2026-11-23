'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const contrato = require('../complemento/contrato/carregar.js');

// Os objetos que saem do `vm` têm outro protótipo: compara-se o valor deles.
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

const RECADO_SEM_HOST = 'Specified native messaging host not found.';

async function conferirEAbriAnkiNoLugar() {
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

async function ankiQueSumiu() {
  const { Abridor } = carregarOAbridor({ responder: m => exemploDoAbridor(m.acao, 'sumiu') });
  assert.deepStrictEqual(await comoValores(Abridor.conferirOAnki()), { resultado: Abridor.RESULTADO.NAO_ACHOU, detalhe: '' },
    'o conferir sem o Anki no lugar não achou');
  assert.deepStrictEqual(await comoValores(Abridor.abrirOAnki()), { resultado: Abridor.RESULTADO.NAO_ABRIU, detalhe: '' },
    'o abrir sem o Anki no lugar não abriu');
}

async function ankiQueONaoAbre() {
  const { Abridor } = carregarOAbridor({ responder: m => exemploDoAbridor(m.acao, 'nao_abre') });
  assert.deepStrictEqual(await comoValores(Abridor.conferirOAnki()), { resultado: Abridor.RESULTADO.ACHOU, detalhe: '' },
    'o conferir com o Anki no lugar achou, mesmo que o sistema não consiga abri-lo');
  assert.deepStrictEqual(await comoValores(Abridor.abrirOAnki()), { resultado: Abridor.RESULTADO.NAO_ABRIU, detalhe: '' },
    'achou o Anki e não abriu: NAO_ABRIU');
}

async function semAPermissaoNadaChegaAoAbridor() {
  const { Abridor, enviadas } = carregarOAbridor({ permissao: false, responder: () => ({ achou: true }) });
  assert.deepStrictEqual(await comoValores(Abridor.conferirOAnki()), { resultado: Abridor.RESULTADO.SEM_PERMISSAO, detalhe: '' },
    'sem a permissão, o conferir diz SEM_PERMISSAO');
  assert.deepStrictEqual(await comoValores(Abridor.abrirOAnki()), { resultado: Abridor.RESULTADO.SEM_PERMISSAO, detalhe: '' },
    'sem a permissão, o abrir diz SEM_PERMISSAO');
  assert.deepStrictEqual(enviadas, [], 'e nada chega ao abridor');
}

async function semOHostDoAbridor() {
  const { Abridor } = carregarOAbridor({ responder: () => { throw new Error(RECADO_SEM_HOST); } });
  assert.deepStrictEqual(await comoValores(Abridor.conferirOAnki()), { resultado: Abridor.RESULTADO.SEM_ABRIDOR, detalhe: RECADO_SEM_HOST },
    'o conferir sem o host diz SEM_ABRIDOR com o recado do Chrome');
  assert.deepStrictEqual(await comoValores(Abridor.abrirOAnki()), { resultado: Abridor.RESULTADO.SEM_ABRIDOR, detalhe: RECADO_SEM_HOST },
    'o abrir sem o host diz SEM_ABRIDOR com o recado do Chrome');
}

const RESPOSTAS_ESQUISITAS_DO_ABRIDOR = [null, undefined, {}, { achou: 'sim' }, { abriu: true }, 'achou', 0,
  { achou: 'sim', abriu: 'sim' }, { achou: 1, abriu: 1 }];

async function respostasEsquisitasDoAbridor() {
  for (const esquisita of RESPOSTAS_ESQUISITAS_DO_ABRIDOR) {
    const { Abridor } = carregarOAbridor({ responder: () => esquisita });
    const comoDisse = JSON.stringify(esquisita ?? null);
    assert.deepStrictEqual(await comoValores(Abridor.conferirOAnki()), { resultado: Abridor.RESULTADO.SEM_ABRIDOR, detalhe: comoDisse },
      `o conferir com a resposta ${comoDisse} diz SEM_ABRIDOR, com o que o abridor disse`);
    assert.deepStrictEqual(await comoValores(Abridor.abrirOAnki()), { resultado: Abridor.RESULTADO.SEM_ABRIDOR, detalhe: comoDisse },
      `o abrir com a resposta ${comoDisse} diz SEM_ABRIDOR, com o que o abridor disse`);
  }
}

async function meiasVerdadesDoAbridorNaoAbrem() {
  for (const meiaVerdade of [{ achou: false, abriu: true }, { achou: true, abriu: false }]) {
    const { Abridor } = carregarOAbridor({ responder: () => meiaVerdade });
    assert.deepStrictEqual(await comoValores(Abridor.abrirOAnki()), { resultado: Abridor.RESULTADO.NAO_ABRIU, detalhe: '' },
      `o abrir com ${JSON.stringify(meiaVerdade)} diz NAO_ABRIU`);
  }
}

async function consertarDizOQueAConexaoDisse() {
  const { Abridor } = carregarOAbridor({ responder: () => null });
  for (const exemplo of contrato.conserto.exemplos) {
    const { Abridor: A } = carregarOAbridor({ responder: () => exemplo.resposta });
    assert.deepStrictEqual(await comoValores(A.consertarOAnki()),
      { resultado: exemplo.resposta.situacao, motivo: exemplo.resposta.motivo ?? '', detalhe: '' }, exemplo.nome);
  }
  assert.ok(Abridor.LIMITE_DO_CONSERTO_MS >= 30_000 + 10_000 + 20_000, 'a conversa do consertar cobre a espera, o fechar e o abrir');
}

async function consertarSemAPermissaoNaoFechaNada() {
  const { Abridor, enviadas } = carregarOAbridor({ permissao: false, responder: () => ({ situacao: 'reiniciado' }) });
  assert.deepStrictEqual(await comoValores(Abridor.consertarOAnki()), { resultado: Abridor.RESULTADO.SEM_PERMISSAO, detalhe: '' },
    'sem a permissão o consertar não fecha nada');
  assert.deepStrictEqual(enviadas, []);
}

async function consertarSemOHostDoAbridor() {
  const { Abridor, enviadas } = carregarOAbridor({ responder: () => { throw new Error(RECADO_SEM_HOST); } });
  assert.deepStrictEqual(await comoValores(Abridor.consertarOAnki()), { resultado: Abridor.RESULTADO.SEM_ABRIDOR, detalhe: RECADO_SEM_HOST });
  assert.deepStrictEqual(enviadas.map(e => e.mensagem), [{ acao: 'consertar' }]);
}

const RESPOSTAS_ESQUISITAS_DO_CONSERTAR = [null, {}, { erro: 'acao_desconhecida' }, { situacao: 'quase' }, { situacao: 'achou' },
  { achou: true, abriu: true }, { situacao: ['reiniciado'] }];

async function consertarComRespostasEsquisitas() {
  for (const esquisita of RESPOSTAS_ESQUISITAS_DO_CONSERTAR) {
    const { Abridor } = carregarOAbridor({ responder: () => esquisita });
    assert.deepStrictEqual(await comoValores(Abridor.consertarOAnki()),
      { resultado: Abridor.RESULTADO.SEM_ABRIDOR, detalhe: JSON.stringify(esquisita ?? null) }, `consertar com a resposta ${JSON.stringify(esquisita)}`);
  }
}

const CENARIOS = [
  conferirEAbriAnkiNoLugar, ankiQueSumiu, ankiQueONaoAbre, semAPermissaoNadaChegaAoAbridor, semOHostDoAbridor,
  respostasEsquisitasDoAbridor, meiasVerdadesDoAbridorNaoAbrem,
  consertarDizOQueAConexaoDisse, consertarSemAPermissaoNaoFechaNada, consertarSemOHostDoAbridor, consertarComRespostasEsquisitas,
];

async function main() {
  for (const cenario of CENARIOS) await cenario();
  console.log('abridor tests passed');
}

main().catch(erro => { console.error(erro); process.exit(1); });

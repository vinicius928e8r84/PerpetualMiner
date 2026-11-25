'use strict';

const assert = require('assert');
const test = require('node:test');

const falasDeUmPedido = [];
const bancada = {
  limite: (envio, estado, ajudas) => { falasDeUmPedido.push(['limite', envio.id, estado.status, Object.keys(ajudas).sort()]); return { do: 'limite' }; },
  teto: (envio, estado) => ({ do: 'teto', envio: envio.id, estado: estado.status }),
  parado: (envio, estado) => ({ do: 'parado', envio: envio.id, estado: estado.status }),
  abrirOPerfilRespondeu: true,
};

globalThis.PerpetualMiner = {
  textoDaVoz: (id, params) => (params ? `${id}${JSON.stringify(params)}` : id),
  Veio: { elemento: () => ({}) },
  Contexto: {},
  IDIOMAS: { INGLES: 'Inglês', RUSSO: 'Russo' },
  EnvioNoLimite: { pedido: (...argumentos) => bancada.limite(...argumentos) },
  EnvioNoTeto: { pedido: (...argumentos) => bancada.teto(...argumentos) },
  EnvioParado: { pedido: (...argumentos) => bancada.parado(...argumentos) },
  ConversaComOAnki: { pedir: async () => ({ ok: bancada.abrirOPerfilRespondeu }) },
  PedidoAoAnki: { abrirOPerfilMarcado: () => ({}) },
};
require('../painel/painel-envio-estado.js');
require('../painel/painel-envio-cartao.js');
const { CartaoDoEnvio, SituacaoDoEnvio } = globalThis.PerpetualMiner;
const { ESTADO, ESPERA } = SituacaoDoEnvio;

const chamadas = [];
const envio = { id: 'e1', jobId: 'job-1', lang: 'en', ids: [1, 2] };
const estadoDoJob = { status: 'running', stage: 'generate_cards' };

function criarOCartao({ falhouAoRetomar = false } = {}) {
  return CartaoDoEnvio.criar({
    situacaoDe: () => { throw new Error('o pedido recebe a situação pronta'); },
    estadoDoJob: () => estadoDoJob,
    esquecerOEnvio: e => chamadas.push(['esquecer', e.id]),
    falhaAoRetomar: () => (falhouAoRetomar ? 'falhou' : undefined),
    tentarCriarDeNovo: e => chamadas.push(['tentarCriarDeNovo', e.id]),
    continuarEnvio: e => chamadas.push(['continuar', e.id]),
    pedirAChave: e => chamadas.push(['pedirAChave', e.id]),
    redesenhar: () => chamadas.push(['redesenhar']),
  }).pedidoDoCartao;
}

const aVer = pedido => JSON.parse(JSON.stringify(pedido, (_, valor) => (typeof valor === 'function' ? 'ƒ' : valor)));
const pedirPara = (situacao, { falhou = false, estado = estadoDoJob, daEnvio = envio } = {}) => criarOCartao({ falhouAoRetomar: falhou })(daEnvio, situacao, estado);

const FALHA_AO_CONTINUAR = { motivo: 'ENV-14.falha', rotulo: 'ENV-03.tentarDeNovo', foco: 'continuar', aoUsar: 'ƒ' };

test('um Envio sem Cartão no Anki ainda: o pedido é tentar de novo, com o motivo da causa', () => {
  for (const [causa, motivo] of [['semResposta', 'ENV-03.motivoSemResposta'], ['erro', 'ENV-03.motivo'], ['ajustes', 'ENV-03.motivoAjustes']]) {
    assert.deepStrictEqual(aVer(pedirPara({ estado: ESTADO.NAO_COMECOU, causa })), { motivo, rotulo: 'ENV-03.tentarDeNovo', foco: 'tentar', aoUsar: 'ƒ' });
  }
  chamadas.length = 0;
  pedirPara({ estado: ESTADO.NAO_COMECOU, causa: 'erro' }).aoUsar();
  assert.deepStrictEqual(chamadas, [['tentarCriarDeNovo', 'e1']]);
});

test('o Envio que a Conexão não conhece e o que teve as Frases apagadas só pedem para esquecer, cada um com o seu motivo', () => {
  for (const [estado, motivo] of [[ESTADO.DESCONHECIDO, 'ENV-23.motivo'], [ESTADO.APAGADO, 'ENV-24.apagado']]) {
    assert.deepStrictEqual(aVer(pedirPara({ estado })), { motivo, rotulo: 'ENV-23.esquecer', foco: 'esquecer', aoUsar: 'ƒ' });
  }
  chamadas.length = 0;
  pedirPara({ estado: ESTADO.APAGADO }).aoUsar();
  assert.deepStrictEqual(chamadas, [['esquecer', 'e1']]);
});

test('o Envio parado pede o que o Anki fechado pede', () => {
  assert.deepStrictEqual(pedirPara({ estado: ESTADO.PARADO }), { do: 'parado', envio: 'e1', estado: 'running' });
});

test('esperando o teto do mês, o pedido é o do teto', () => {
  assert.deepStrictEqual(pedirPara({ estado: ESTADO.ESPERANDO, espera: ESPERA.TETO }), { do: 'teto', envio: 'e1', estado: 'running' });
});

test('esperando o plano do ChatGPT, o pedido é o do limite, com o que ele usa; sem estado do job não há pedido', () => {
  falasDeUmPedido.length = 0;
  assert.deepStrictEqual(pedirPara({ estado: ESTADO.ESPERANDO, espera: ESPERA.PLANO }), { do: 'limite' });
  assert.deepStrictEqual(falasDeUmPedido, [['limite', 'e1', 'running', ['falhou', 'redesenhar', 'tentarDeNovo', 'usarAChave']]]);
  assert.strictEqual(pedirPara({ estado: ESTADO.ESPERANDO, espera: ESPERA.PLANO }, { estado: null }), null);
  assert.deepStrictEqual(aVer(pedirPara({ estado: ESTADO.ESPERANDO, espera: ESPERA.PLANO }, { estado: null, falhou: true })), FALHA_AO_CONTINUAR);
});

test('o limite recebe as ações do Envio: tentar de novo continua o Envio, usar a chave pede a chave, e a falha ao continuar vai junto', () => {
  const recebidas = [];
  bancada.limite = (_envio, _estado, ajudas) => { recebidas.push(ajudas); return { do: 'limite' }; };
  chamadas.length = 0;
  pedirPara({ estado: ESTADO.ESPERANDO, espera: ESPERA.PLANO }, { falhou: true });
  recebidas[0].tentarDeNovo();
  recebidas[0].usarAChave();
  recebidas[0].redesenhar();
  assert.deepStrictEqual([recebidas[0].falhou, chamadas], [true, [['continuar', 'e1'], ['pedirAChave', 'e1'], ['redesenhar']]]);
});

test('esperando o perfil marcado do Anki, o pedido é abrir o perfil; se abrir falhou, o motivo diz a falha', async () => {
  const situacao = { estado: ESTADO.ESPERANDO, espera: ESPERA.OUTRO_PERFIL };
  const estado = { ...estadoDoJob, waiting: { profile: 'Beto', marked: 'Ana' } };
  const naFalha = { ...envio, jobId: 'job-que-falha' };
  assert.deepStrictEqual(aVer(pedirPara(situacao, { estado })), {
    motivo: 'ENV-17.espera{"aberto":"Beto"}', rotulo: 'ENV-17.abrir{"perfil":"Ana"}', foco: 'abrir-perfil', aoUsar: 'ƒ',
  });
  bancada.abrirOPerfilRespondeu = false;
  await pedirPara(situacao, { estado, daEnvio: naFalha }).aoUsar();
  assert.strictEqual(pedirPara(situacao, { estado, daEnvio: naFalha }).motivo, 'ENV-17.falha{"aberto":"Beto"}');
  assert.strictEqual(pedirPara(situacao, { estado }).motivo, 'ENV-17.espera{"aberto":"Beto"}');
  bancada.abrirOPerfilRespondeu = true;
  await pedirPara(situacao, { estado, daEnvio: naFalha }).aoUsar();
  assert.strictEqual(pedirPara(situacao, { estado, daEnvio: naFalha }).motivo, 'ENV-17.espera{"aberto":"Beto"}');
});

test('esperando um perfil que sumiu, o pedido é escolher outro perfil', () => {
  const pedido = pedirPara({ estado: ESTADO.ESPERANDO, espera: ESPERA.PERFIL_SUMIU }, { estado: { ...estadoDoJob, waiting: { profile: null, marked: 'Ana' } } });
  assert.deepStrictEqual(aVer(pedido), { motivo: 'ENV-17.sumiu{"perfil":"Ana"}', rotulo: 'ENV-17.escolher', foco: 'escolher-perfil', aoUsar: 'ƒ' });
});

test('esperando o Anki sem aviso, só o motivo da demora, sem ação', () => {
  assert.deepStrictEqual(pedirPara({ estado: ESTADO.ESPERANDO, espera: ESPERA.ANKI }), { motivo: 'ENV-22.demora' });
});

const TENTAR = { rotulo: 'ENV-03.tentarDeNovo', foco: 'continuar', aoUsar: 'ƒ' };
const COM_O_MOTIVO = [
  ['sem motivo que o painel diga', null, TENTAR],
  ['de um motivo desconhecido', 'qualquer_coisa', TENTAR],
  ['de um motivo da OpenAI que se resolve tentando de novo', 'openai_rate_limited', { motivo: 'ONB-23.motivoOpenAI', ligacao: null, ...TENTAR }],
  ['da chave que falta', 'openai_key_missing', { motivo: 'ONB-23.motivoSemChave', rotulo: 'ONB-23.trocarAChave', foco: 'usar-chave', aoUsar: 'ƒ' }],
  ['do ChatGPT sem entrar', 'chatgpt_signed_out', { motivo: 'CFG-46.noEnvio', rotulo: 'CFG-46.abrir', foco: 'usar-chave', aoUsar: 'ƒ' }],
  ['do ChatGPT que não serve', 'chatgpt_not_eligible', { motivo: 'CFG-35.erroChatgptNaoServe', rotulo: 'CFG-35.erroChatgptUsarChave', foco: 'usar-chave', aoUsar: 'ƒ' }],
  ['do limite do ChatGPT', 'chatgpt_usage_limit', { motivo: 'ENV-20.limite', ligacao: 'CFG-35.chatgptGerenciar', ...TENTAR }],
];

test('o Envio concluído em parte ou não concluído pede o que o motivo manda; sem motivo, tentar de novo', () => {
  for (const estado of [ESTADO.EM_PARTE, ESTADO.NAO_CONCLUIDO]) {
    for (const [nome, motivo, esperado] of COM_O_MOTIVO) {
      assert.deepStrictEqual(aVer(pedirPara({ estado, motivo })), esperado, `${estado} ${nome}`);
    }
  }
});

test('o Envio concluído em parte ou não concluído que já foi retomado e falhou diz a falha; o que não se retoma não pede nada, a menos que a retomada tenha falhado', () => {
  for (const estado of [ESTADO.EM_PARTE, ESTADO.NAO_CONCLUIDO]) {
    assert.deepStrictEqual(aVer(pedirPara({ estado, motivo: 'openai_key_missing' }, { falhou: true })), FALHA_AO_CONTINUAR);
    assert.strictEqual(pedirPara({ estado, motivo: 'openai_key_missing', apagadas: true }), null);
    assert.deepStrictEqual(aVer(pedirPara({ estado, motivo: 'openai_key_missing', apagadas: true }, { falhou: true })), FALHA_AO_CONTINUAR);
  }
});

test('a ação de tentar de novo do concluído em parte continua o Envio', () => {
  chamadas.length = 0;
  pedirPara({ estado: ESTADO.EM_PARTE, motivo: null }).aoUsar();
  assert.deepStrictEqual(chamadas, [['continuar', 'e1']]);
});

test('nos estados sem pedido, só a falha ao retomar faz o pedido de tentar de novo', () => {
  for (const estado of [ESTADO.CRIANDO, ESTADO.NA_FILA, ESTADO.ANDANDO, ESTADO.CONCLUIDO]) {
    assert.strictEqual(pedirPara({ estado }), null, estado);
    assert.deepStrictEqual(aVer(pedirPara({ estado }, { falhou: true })), FALHA_AO_CONTINUAR, estado);
  }
});

test('a falha ao retomar não muda o pedido dos estados que têm o seu', () => {
  const sem = { estado: ESTADO.NAO_COMECOU, causa: 'erro' };
  assert.deepStrictEqual(aVer(pedirPara(sem, { falhou: true })), aVer(pedirPara(sem)));
  assert.deepStrictEqual(aVer(pedirPara({ estado: ESTADO.DESCONHECIDO }, { falhou: true })), aVer(pedirPara({ estado: ESTADO.DESCONHECIDO })));
  assert.deepStrictEqual(aVer(pedirPara({ estado: ESTADO.ESPERANDO, espera: ESPERA.ANKI }, { falhou: true })), { motivo: 'ENV-22.demora' });
});

test('os onze estados da situação estão cobertos acima', () => {
  assert.strictEqual(Object.values(ESTADO).length, 11);
});

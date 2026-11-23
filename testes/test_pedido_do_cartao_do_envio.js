'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { DocumentoFalso } = require('./dom-falso');

const RAIZ = path.join(__dirname, '..');
const ARQUIVOS_DE_VERDADE = ['lib/voz/catalogo.js', 'lib/voz/catalogo-nivel.js', 'lib/voz/texto.js', 'veio/componentes.js', 'lib/idioma.js', 'lib/contexto.js', 'painel/painel-envio-estado.js', 'painel/painel-envio-cartao.js'];

const documento = new DocumentoFalso();
const contexto = vm.createContext({ document: documento, console, setTimeout, clearTimeout, Intl, Date, crypto: { randomUUID: () => 'novo-id' } });
contexto.globalThis = contexto;
const rodar = arquivo => vm.runInContext(fs.readFileSync(path.join(RAIZ, arquivo), 'utf8'), contexto, { filename: arquivo });

const ENVIO_COM_JOB = { id: 'e1', lang: 'en', ids: [1, 2], jobId: 'job-1', criadoEm: 1000, falhaAoCriar: null };
const ENVIO_SEM_JOB = { ...ENVIO_COM_JOB, jobId: null };

const portas = { chamadas: [], parado: null, teto: null, limite: null, abrirPerfil: { ok: true } };
const registrar = (nome, ...argumentos) => portas.chamadas.push([nome, ...argumentos]);

function montarRaiz() {
  for (const arquivo of ARQUIVOS_DE_VERDADE.slice(0, 6)) rodar(arquivo);
  const { PerpetualMiner } = contexto;
  Object.assign(PerpetualMiner, {
    EnvioParado: {
      pedido: (envio, estado) => { registrar('parado.pedido', envio.id, estado?.status); return portas.parado; },
      escrever: (no, motivo) => { no.textContent = [].concat(motivo).join(' '); },
      causa: () => '',
    },
    EnvioNoTeto: { pedido: (envio, estado) => { registrar('teto.pedido', envio.id, estado?.status); return portas.teto; } },
    EnvioNoLimite: { pedido: (envio, estado, ajudas) => { registrar('limite.pedido', envio.id, ajudas.falhou); return portas.limite; } },
    ConversaComOAnki: { pedir: async pedido => { registrar('anki.pedir', pedido); return portas.abrirPerfil; } },
    PedidoAoAnki: { abrirOPerfilMarcado: () => 'abrir-o-perfil-marcado' },
    AjustesDeEnvio: { nomeDoBaralho: nome => nome, atual: () => ({ en: { deckName: 'Inglês' }, ru: { deckName: 'Russo' } }) },
  });
  rodar('painel/painel-envio-estado.js');
  rodar('painel/painel-envio-cartao.js');
  return PerpetualMiner;
}

const PM = montarRaiz();
const { textoDaVoz } = PM;
const { ESTADO, ESPERA } = PM.SituacaoDoEnvio;

function cartaoDoEnvio(envio, situacao, { estado, falhou = false } = {}) {
  portas.chamadas.length = 0;
  const cartao = PM.CartaoDoEnvio.criar({
    situacaoDe: () => situacao,
    estadoDoJob: () => estado,
    esquecerOEnvio: e => registrar('esquecer', e.id),
    falhaAoRetomar: () => (falhou ? 'não retomou' : ''),
    tentarCriarDeNovo: e => registrar('tentarCriarDeNovo', e.id),
    continuarEnvio: e => registrar('continuar', e.id),
    pedirAChave: e => registrar('pedirAChave', e.id),
    redesenhar: () => registrar('redesenhar'),
  }).montarCartao(envio);
  return cartao;
}

function ler(cartao) {
  const botoes = cartao.querySelectorAll('.envio-cartao__acao, .envio-cartao__acoes button, .envio-cartao__acoes a');
  return {
    motivo: cartao.querySelector('.envio-cartao__motivo')?.textContent ?? null,
    acoes: botoes.map(no => `${no.dataset.foco || no.localName}:${no.textContent}`),
    calmo: cartao.querySelector('.envio-cartao__etapa').classList.contains('envio-cartao__etapa--calmo'),
    cartao,
    botoes,
  };
}

const ESTADO_DO_JOB = { status: 'running', stage: 'generate_cards' };
const voz = (id, dados) => textoDaVoz(id, dados);
const SEM_PEDIDO = { motivo: null, acoes: [], calmo: false };
const sem = lido => ({ motivo: lido.motivo, acoes: lido.acoes, calmo: lido.calmo });

const CASOS = [];
const caso = (nome, corpo) => CASOS.push({ nome, corpo });

caso('não começou: o motivo da causa e Tentar de novo, que cria o Envio outra vez', async () => {
  for (const [causa, id] of [['semResposta', 'ENV-03.motivoSemResposta'], ['erro', 'ENV-03.motivo'], ['ajustes', 'ENV-03.motivoAjustes']]) {
    const lido = ler(cartaoDoEnvio(ENVIO_SEM_JOB, { estado: ESTADO.NAO_COMECOU, causa }));
    assert.deepStrictEqual(sem(lido), { motivo: voz(id), acoes: [`tentar:${voz('ENV-03.tentarDeNovo')}`], calmo: true }, causa);
    lido.botoes[0].disparar('click');
    assert.deepStrictEqual(portas.chamadas, [['tentarCriarDeNovo', 'e1']]);
  }
});

caso('desconhecido: o motivo de ENV-23 e só Esquecer, que esquece o Envio', async () => {
  const lido = ler(cartaoDoEnvio(ENVIO_COM_JOB, { estado: ESTADO.DESCONHECIDO }));
  assert.deepStrictEqual(sem(lido), { motivo: voz('ENV-23.motivo'), acoes: [`esquecer:${voz('ENV-23.esquecer')}`], calmo: true });
  assert.deepStrictEqual(portas.chamadas, []);
  lido.botoes[0].disparar('click');
  assert.deepStrictEqual(portas.chamadas, [['esquecer', 'e1']]);
});

caso('apagado: o motivo de ENV-24 e só Esquecer', async () => {
  const lido = ler(cartaoDoEnvio(ENVIO_COM_JOB, { estado: ESTADO.APAGADO }, { estado: ESTADO_DO_JOB }));
  assert.deepStrictEqual(sem(lido), { motivo: voz('ENV-24.apagado'), acoes: [`esquecer:${voz('ENV-23.esquecer')}`], calmo: true });
  lido.botoes[0].disparar('click');
  assert.deepStrictEqual(portas.chamadas.at(-1), ['esquecer', 'e1']);
});

caso('parado: o que o módulo do Anki fechado pede, e nada além', async () => {
  portas.parado = { motivo: 'O Anki fechou.', rotulo: 'Continuar envio', foco: 'continuar', aoUsar: () => registrar('parado.usar') };
  const lido = ler(cartaoDoEnvio(ENVIO_COM_JOB, { estado: ESTADO.PARADO }, { estado: ESTADO_DO_JOB }));
  assert.deepStrictEqual(sem(lido), { motivo: 'O Anki fechou.', acoes: ['continuar:Continuar envio'], calmo: true });
  lido.botoes[0].disparar('click');
  assert.deepStrictEqual(portas.chamadas.at(-1), ['parado.usar']);
  portas.parado = null;
});

caso('parado sem pedido do módulo: não pede nada, mesmo com a falha ao retomar', async () => {
  for (const falhou of [false, true]) {
    const lido = ler(cartaoDoEnvio(ENVIO_COM_JOB, { estado: ESTADO.PARADO }, { estado: ESTADO_DO_JOB, falhou }));
    assert.deepStrictEqual(sem(lido), SEM_PEDIDO, `falhou ${falhou}`);
  }
});

caso('esperando o plano: o pedido do limite, e sem ele nada (ou só a falha ao retomar)', async () => {
  const situacao = { estado: ESTADO.ESPERANDO, espera: ESPERA.PLANO };
  portas.limite = { motivo: ['Falta 3 cartões'], acoes: [{ rotulo: 'Gerenciar uso', foco: 'gerenciar', href: 'https://chatgpt.com/settings/usage', principal: true }, { rotulo: 'Tentar de novo', foco: 'tentar', aoUsar: () => registrar('limite.usar') }] };
  const lido = ler(cartaoDoEnvio(ENVIO_COM_JOB, situacao, { estado: ESTADO_DO_JOB }));
  assert.deepStrictEqual(sem(lido), { motivo: 'Falta 3 cartões', acoes: ['gerenciar:Gerenciar uso', 'tentar:Tentar de novo'], calmo: true });
  portas.limite = null;
  assert.deepStrictEqual(sem(ler(cartaoDoEnvio(ENVIO_COM_JOB, situacao, { estado: ESTADO_DO_JOB }))), SEM_PEDIDO);
  const falhou = ler(cartaoDoEnvio(ENVIO_COM_JOB, situacao, { estado: ESTADO_DO_JOB, falhou: true }));
  assert.deepStrictEqual(sem(falhou), { motivo: voz('ENV-14.falha'), acoes: [`continuar:${voz('ENV-03.tentarDeNovo')}`], calmo: true });
  falhou.botoes[0].disparar('click');
  assert.deepStrictEqual(portas.chamadas.at(-1), ['continuar', 'e1']);
});

caso('o pedido do limite é pedido a cada cartão com estado do Envio, qualquer que seja o estado', async () => {
  cartaoDoEnvio(ENVIO_COM_JOB, { estado: ESTADO.ANDANDO, etapa: 'generate_cards' }, { estado: ESTADO_DO_JOB, falhou: true });
  assert.deepStrictEqual(portas.chamadas, [['limite.pedido', 'e1', true]]);
  cartaoDoEnvio(ENVIO_SEM_JOB, { estado: ESTADO.CRIANDO });
  assert.deepStrictEqual(portas.chamadas, []);
});

caso('esperando o teto do mês: o pedido do módulo do teto', async () => {
  portas.teto = { motivo: 'Teto do mês.', rotulo: 'Subir o teto', foco: 'teto', aoUsar: () => registrar('teto.usar') };
  const lido = ler(cartaoDoEnvio(ENVIO_COM_JOB, { estado: ESTADO.ESPERANDO, espera: ESPERA.TETO }, { estado: ESTADO_DO_JOB }));
  assert.deepStrictEqual(sem(lido), { motivo: 'Teto do mês.', acoes: ['teto:Subir o teto'], calmo: true });
  assert.ok(portas.chamadas.some(c => c[0] === 'teto.pedido'));
  portas.teto = null;
  const sem_ = ler(cartaoDoEnvio(ENVIO_COM_JOB, { estado: ESTADO.ESPERANDO, espera: ESPERA.TETO }, { estado: ESTADO_DO_JOB }));
  assert.deepStrictEqual(sem(sem_), SEM_PEDIDO);
});

caso('esperando outro perfil: diz em que perfil o Anki está e abre o marcado, uma vez por clique', async () => {
  const espera = { estado: ESTADO.ESPERANDO, espera: ESPERA.OUTRO_PERFIL };
  const job = { ...ESTADO_DO_JOB, waiting: { profile: 'Outro', marked: 'Principal' } };
  const lido = ler(cartaoDoEnvio(ENVIO_COM_JOB, espera, { estado: job }));
  assert.deepStrictEqual(sem(lido), { motivo: voz('ENV-17.espera', { aberto: 'Outro' }), acoes: [`abrir-perfil:${voz('ENV-17.abrir', { perfil: 'Principal' })}`], calmo: true });
  portas.abrirPerfil = { ok: false };
  lido.botoes[0].disparar('click');
  await new Promise(resolver => setImmediate(resolver));
  assert.deepStrictEqual(portas.chamadas.at(-1), ['anki.pedir', 'abrir-o-perfil-marcado']);
  const depois = ler(cartaoDoEnvio(ENVIO_COM_JOB, espera, { estado: job }));
  assert.strictEqual(depois.motivo, voz('ENV-17.falha', { aberto: 'Outro' }), 'depois de falhar ao abrir, o cartão diz que não deu');
  portas.abrirPerfil = { ok: true };
  depois.botoes[0].disparar('click');
  await new Promise(resolver => setImmediate(resolver));
  assert.strictEqual(ler(cartaoDoEnvio(ENVIO_COM_JOB, espera, { estado: job })).motivo, voz('ENV-17.espera', { aberto: 'Outro' }));
});

caso('esperando com o perfil marcado apagado: manda escolher outro nas Configurações', async () => {
  const job = { ...ESTADO_DO_JOB, waiting: { profile: 'Outro', marked: 'Principal' } };
  const lido = ler(cartaoDoEnvio(ENVIO_COM_JOB, { estado: ESTADO.ESPERANDO, espera: ESPERA.PERFIL_SUMIU }, { estado: job }));
  assert.deepStrictEqual(sem(lido), { motivo: voz('ENV-17.sumiu', { perfil: 'Principal' }), acoes: [`escolher-perfil:${voz('ENV-17.escolher')}`], calmo: true });
  contexto.location = { hash: '' };
  lido.botoes[0].disparar('click');
  assert.strictEqual(contexto.location.hash, '#configuracoes/anki');
});

caso('esperando o Anki, ou por uma espera que o cartão não conhece: só diz que demora, sem ação', async () => {
  for (const espera of [ESPERA.ANKI, 'desconhecida']) {
    const lido = ler(cartaoDoEnvio(ENVIO_COM_JOB, { estado: ESTADO.ESPERANDO, espera }, { estado: ESTADO_DO_JOB }));
    assert.deepStrictEqual(sem(lido), { motivo: voz('ENV-22.demora'), acoes: [], calmo: true }, espera);
  }
});

caso('em parte ou não concluído: o motivo do código, a ajuda dele e Tentar de novo', async () => {
  const casos = [
    ['openai_key_rejected', 'usar-chave', 'ONB-23.trocarAChave'],
    ['chatgpt_signed_out', 'usar-chave', 'CFG-46.abrir'],
    ['chatgpt_not_eligible', 'usar-chave', 'CFG-35.erroChatgptUsarChave'],
  ];
  for (const estadoDoCartao of [ESTADO.EM_PARTE, ESTADO.NAO_CONCLUIDO]) {
    for (const [codigo, foco, rotulo] of casos) {
      const lido = ler(cartaoDoEnvio(ENVIO_COM_JOB, { estado: estadoDoCartao, motivo: codigo }, { estado: ESTADO_DO_JOB }));
      assert.deepStrictEqual(lido.acoes, [`${foco}:${voz(rotulo)}`], `${estadoDoCartao} ${codigo}`);
      assert.ok(lido.motivo && lido.calmo);
    }
    const dita = ler(cartaoDoEnvio(ENVIO_COM_JOB, { estado: estadoDoCartao, motivo: 'anki_write_failed' }, { estado: ESTADO_DO_JOB }));
    assert.deepStrictEqual(dita.acoes, [`continuar:${voz('ENV-03.tentarDeNovo')}`]);
    assert.ok(dita.motivo);
    dita.botoes[0].disparar('click');
    assert.deepStrictEqual(portas.chamadas.at(-1), ['continuar', 'e1']);
  }
});

caso('em parte ou não concluído, com Gerenciar uso: o motivo, Tentar de novo e a ligação para o uso do ChatGPT', async () => {
  const lido = ler(cartaoDoEnvio(ENVIO_COM_JOB, { estado: ESTADO.NAO_CONCLUIDO, motivo: 'chatgpt_usage_limit' }, { estado: ESTADO_DO_JOB }));
  assert.deepStrictEqual(lido.acoes, [`continuar:${voz('ENV-03.tentarDeNovo')}`, `a:${voz('CFG-35.chatgptGerenciar')}`]);
  assert.strictEqual(lido.motivo, voz('ENV-20.limite'));
});

caso('em parte ou não concluído, com um código que o painel não diz: só Tentar de novo, sem motivo', async () => {
  for (const motivo of ['codigo_novo_da_conexao', undefined, null]) {
    const lido = ler(cartaoDoEnvio(ENVIO_COM_JOB, { estado: ESTADO.EM_PARTE, motivo }, { estado: ESTADO_DO_JOB }));
    assert.deepStrictEqual(sem(lido), { motivo: null, acoes: [`continuar:${voz('ENV-03.tentarDeNovo')}`], calmo: true }, String(motivo));
  }
});

caso('em parte ou não concluído que não se retoma (Frases apagadas): nada a pedir', async () => {
  for (const estadoDoCartao of [ESTADO.EM_PARTE, ESTADO.NAO_CONCLUIDO]) {
    const lido = ler(cartaoDoEnvio(ENVIO_COM_JOB, { estado: estadoDoCartao, apagadas: true, motivo: 'anki_write_failed' }, { estado: ESTADO_DO_JOB }));
    assert.deepStrictEqual(sem(lido), SEM_PEDIDO);
  }
});

caso('em parte ou não concluído, depois de uma falha ao retomar: a falha e Tentar de novo, no lugar do motivo', async () => {
  for (const estadoDoCartao of [ESTADO.EM_PARTE, ESTADO.NAO_CONCLUIDO]) {
    const lido = ler(cartaoDoEnvio(ENVIO_COM_JOB, { estado: estadoDoCartao, motivo: 'openai_key_rejected' }, { estado: ESTADO_DO_JOB, falhou: true }));
    assert.deepStrictEqual(sem(lido), { motivo: voz('ENV-14.falha'), acoes: [`continuar:${voz('ENV-03.tentarDeNovo')}`], calmo: true });
  }
});

caso('na fila, andando, concluído ou criando: não pede nada, e só a falha ao retomar pede Tentar de novo', async () => {
  const estados = [
    [{ estado: ESTADO.CRIANDO }, ENVIO_SEM_JOB, undefined],
    [{ estado: ESTADO.NA_FILA }, ENVIO_COM_JOB, { status: 'queued', stage: 'queued' }],
    [{ estado: ESTADO.ANDANDO, etapa: 'generate_audio', feitos: 1, total: 2 }, ENVIO_COM_JOB, ESTADO_DO_JOB],
    [{ estado: ESTADO.CONCLUIDO }, ENVIO_COM_JOB, { status: 'completed', stage: 'send_to_anki' }],
  ];
  for (const [situacao, envio, job] of estados) {
    assert.deepStrictEqual(sem(ler(cartaoDoEnvio(envio, situacao, { estado: job }))), SEM_PEDIDO, situacao.estado);
    const falhou = ler(cartaoDoEnvio(envio, situacao, { estado: job, falhou: true }));
    assert.deepStrictEqual(sem(falhou), { motivo: voz('ENV-14.falha'), acoes: [`continuar:${voz('ENV-03.tentarDeNovo')}`], calmo: true }, situacao.estado);
  }
});

(async () => {
  for (const { nome, corpo } of CASOS) {
    try {
      await corpo();
    } catch (erro) {
      console.error(`falhou: ${nome}`);
      throw erro;
    }
  }
  console.log(`pedido do cartão do Envio: ${CASOS.length} provas passaram`);
})().catch(erro => { console.error(erro); process.exit(1); });

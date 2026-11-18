'use strict';

const path = require('path');

const RAIZ = path.join(__dirname, '..', '..', '..');
globalThis.PerpetualMiner = {};
globalThis.XState = require(process.env.PM_XSTATE_DE_DESENVOLVIMENTO ? 'xstate' : './vendor/xstate.umd.min.js');
require(path.join(RAIZ, 'painel-envio-estado.js'));
require('./remessa.js');
const { RemessaXState, SituacaoDoEnvio } = globalThis.PerpetualMiner;
const { SimulatedClock } = globalThis.XState;
const { ESTADO } = SituacaoDoEnvio;

const FRASES = [{ id: 1, lang: 'en', linha: 'the cat' }, { id: 2, lang: 'ru', linha: 'кот' }];
const IDS = { en: 'envio-en', ru: 'envio-ru' };
const PRESETS = { en: { deckName: 'PM::Inglês', imageSource: 'google' }, ru: { deckName: 'PM::Russo', imageSource: 'google' } };

const assentar = async () => { for (let i = 0; i < 20; i += 1) await new Promise(resolver => setImmediate(resolver)); };

function montar({ guardada, jaNaConexao = [] } = {}) {
  const feitos = [];
  const naConexao = new Map(jaNaConexao.map(job => [job.jobId, job]));
  const mundo = {
    criar: async corpo => {
      naConexao.set(corpo.jobId, { jobId: corpo.jobId, status: 'running', state: { status: 'running', stage: 'generate_cards' } });
      return { jobId: corpo.jobId };
    },
    listar: async () => ({ jobs: [...naConexao.values()] }),
    retomar: async () => ({ desfecho: 'retomado' }),
    ajustes: async () => PRESETS,
  };
  const portas = {
    conexao: {
      criar: (corpo, opcoes) => { feitos.push(`criar ${corpo.jobId}`); return mundo.criar(corpo, opcoes); },
      listar: () => { feitos.push('listar'); return mundo.listar(); },
      retomar: jobId => { feitos.push(`retomar ${jobId}`); return mundo.retomar(jobId); },
    },
    ajustes: { ler: () => mundo.ajustes() },
    guardar: {
      gravar: async envios => { feitos.push(`gravar ${envios.map(e => e.id).join('+')}`); mundo.guardado = JSON.parse(JSON.stringify({ envios })); },
      esquecer: async () => { feitos.push('esquecer'); mundo.guardado = null; },
      apagarTudo: async () => { feitos.push('apagarTudo'); mundo.guardado = { envios: [], apagarFrases: true }; },
    },
    agora: () => 1_000,
  };
  const relogio = new SimulatedClock();
  const remessa = RemessaXState.criar(portas, { clock: relogio, input: { guardada } });
  remessa.ator.start();
  const terminar = (jobId, estado) => naConexao.set(jobId, { jobId, status: estado.status, state: estado });
  const passar = async ms => { relogio.increment(ms); await assentar(); };
  const estados = () => Object.fromEntries(Object.entries(remessa.visao().situacoes).map(([id, s]) => [id, s.estado]));
  return { ...remessa, feitos, mundo, naConexao, terminar, passar, estados, portas };
}

const CONCLUIDO = ids => ({ status: 'completed', stage: 'completed', successfulPhraseIds: ids });

async function rodar(nome, cenarios) {
  const inicio = process.hrtime.bigint();
  for (const cenario of cenarios) {
    try {
      await cenario();
    } catch (erro) {
      console.error(`✗ ${cenario.name}`);
      console.error(erro);
      process.exit(1);
    }
  }
  const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
  console.log(`${nome} ok: ${cenarios.length} cenários em ${ms.toFixed(0)} ms`);
}

module.exports = { FRASES, IDS, PRESETS, ESTADO, CONCLUIDO, RemessaXState, assentar, montar, rodar };

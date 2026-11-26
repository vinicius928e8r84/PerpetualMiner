'use strict';

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

module.exports = { comoValores, exemploDoAbridor, exemploDoConserto, carregar, relogioFalso };

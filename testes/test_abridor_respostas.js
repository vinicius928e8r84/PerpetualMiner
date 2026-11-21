'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const comoValores = async promessa => JSON.parse(JSON.stringify(await promessa));

function carregarOAbridor(responder) {
  const contexto = vm.createContext({
    setTimeout, clearTimeout,
    document: { getElementById: () => null },
    chrome: {
      permissions: { contains: async () => true },
      runtime: { sendNativeMessage: async () => responder() },
      storage: { local: { get: async () => ({}), set: async () => {} } },
    },
  });
  contexto.globalThis = contexto;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'lib', 'abridor.js'), 'utf8'), contexto);
  return contexto.PerpetualMiner.Abridor;
}

const RESPOSTAS_AO_ABRIR = [
  [{ achou: true }, 'sem_abridor'],
  [{ achou: false }, 'sem_abridor'],
  [{ achou: true, abriu: 'sim' }, 'sem_abridor'],
  [{ achou: true, abriu: 1 }, 'sem_abridor'],
  [{ abriu: true }, 'sem_abridor'],
  [{ achou: true, abriu: true }, 'abriu'],
  [{ achou: true, abriu: false }, 'nao_abriu'],
  [{ achou: false, abriu: true }, 'nao_abriu'],
];
async function oAbrirSoAceitaAchouEAbriuBooleanos() {
  for (const [resposta, resultado] of RESPOSTAS_AO_ABRIR) {
    const Abridor = carregarOAbridor(() => resposta);
    const detalhe = resultado === 'sem_abridor' ? JSON.stringify(resposta) : '';
    assert.deepStrictEqual(await comoValores(Abridor.abrirOAnki()), { resultado, detalhe }, `abrir com ${JSON.stringify(resposta)}`);
  }
}

const RESPOSTAS_AO_CONSERTAR = [
  [{ situacao: 'falhou', motivo: 'sem disco' }, 'sem disco'],
  [{ situacao: 'falhou', motivo: 7 }, ''],
  [{ situacao: 'falhou', motivo: ['x'] }, ''],
  [{ situacao: 'falhou', motivo: true }, ''],
  [{ situacao: 'falhou' }, ''],
  [{ situacao: 'reiniciado', motivo: 'sem disco' }, ''],
  [{ situacao: 'fechou', motivo: 'qualquer' }, ''],
  [{ situacao: 'sumiu', motivo: 'qualquer' }, ''],
];
async function oMotivoDoConsertoSoSaiDoFalhouEmTexto() {
  for (const [resposta, motivo] of RESPOSTAS_AO_CONSERTAR) {
    const Abridor = carregarOAbridor(() => resposta);
    assert.deepStrictEqual(await comoValores(Abridor.consertarOAnki()), { resultado: resposta.situacao, motivo, detalhe: '' },
      `consertar com ${JSON.stringify(resposta)}`);
  }
}

async function main() {
  await oAbrirSoAceitaAchouEAbriuBooleanos();
  await oMotivoDoConsertoSoSaiDoFalhouEmTexto();
  console.log('abridor respostas tests passed');
}

main().catch(erro => {
  console.error(erro);
  process.exit(1);
});

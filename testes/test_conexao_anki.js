'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const lerDaLib = arquivo => fs.readFileSync(path.join(__dirname, '..', 'lib', arquivo), 'utf8');
const comoValor = valor => JSON.parse(JSON.stringify(valor));

function carregarAConexao(responder) {
  const pedidos = [];
  const aoMudarOStorage = [];
  const contexto = vm.createContext({
    AbortSignal,
    chrome: {
      storage: {
        local: { get: async padroes => ({ ...padroes }), set: async () => {} },
        onChanged: { addListener: ouvinte => aoMudarOStorage.push(ouvinte) },
      },
    },
  });
  contexto.globalThis = contexto;
  vm.runInContext(lerDaLib('pedido-ao-anki.js'), contexto);
  const raiz = contexto.PerpetualMiner;
  raiz.ConversaComOAnki = {
    ...raiz.ConversaComOAnki,
    async pedir(pedido, opcoes) {
      pedidos.push({ pedido: comoValor(pedido), opcoes: comoValor(opcoes) });
      return responder();
    },
  };
  vm.runInContext(lerDaLib('conexao-anki.js'), contexto);
  const avisar = (mudancas, area = 'local') => {
    for (const ouvinte of aoMudarOStorage) ouvinte(mudancas, area);
  };
  return { ConexaoAnki: raiz.ConexaoAnki, MOTIVO: raiz.ConversaComOAnki.MOTIVO, pedidos, avisar };
}

const { MOTIVO } = carregarAConexao(() => ({ ok: true, dados: {} }));

const SEM_NADA = { versao: null, perfil: null, atualizacao: null };

const CASOS = [
  ['a saúde inteira', () => ({ ok: true, dados: { versao: '2.4.0', perfil: 'Usuário 1', atualizacao: { estado: 'pronta', versao: '2.5.0', atualizada: '2026-11-01' } } }),
    'ligada', { versao: '2.4.0', perfil: 'Usuário 1', atualizacao: { estado: 'pronta', versao: '2.5.0', atualizada: '2026-11-01' } }],
  ['texto vazio e o que não é texto viram null', () => ({ ok: true, dados: { versao: '', perfil: 3, atualizacao: 'pronta' } }), 'ligada', SEM_NADA],
  ['sem corpo', () => ({ ok: true, dados: null }), 'ligada', SEM_NADA],
  ['corpo que não é objeto', () => ({ ok: true, dados: 'ok' }), 'ligada', SEM_NADA],
  ['a atualização sem os campos em texto', () => ({ ok: true, dados: { versao: '2.4.0', atualizacao: { estado: 5, versao: '', atualizada: null } } }),
    'ligada', { versao: '2.4.0', perfil: null, atualizacao: { estado: null, versao: null, atualizada: null } }],
  ['a atualização numa lista', () => ({ ok: true, dados: { atualizacao: [] } }), 'ligada', { ...SEM_NADA, atualizacao: { estado: null, versao: null, atualizada: null } }],
  ['a atualização nula', () => ({ ok: true, dados: { perfil: 'P', atualizacao: null } }), 'ligada', { ...SEM_NADA, perfil: 'P' }],
  ['a atualização falsa', () => ({ ok: true, dados: { atualizacao: 0 } }), 'ligada', SEM_NADA],
  ['a resposta fora do formato ainda conta como ligada', () => ({ ok: false, motivo: MOTIVO.INVALIDA, dados: { versao: '1.0' } }),
    'ligada', { ...SEM_NADA, versao: '1.0' }],
  ['a resposta fora do formato sem corpo', () => ({ ok: false, motivo: MOTIVO.INVALIDA, dados: null }), 'ligada', SEM_NADA],
  ['sem resposta', () => ({ ok: false, motivo: MOTIVO.SEM_RESPOSTA, dados: null }), 'desligada', null],
  ['recusada com corpo', () => ({ ok: false, motivo: MOTIVO.RECUSADO, dados: { versao: '9.9' } }), 'desligada', null],
  ['a parear', () => ({ ok: false, motivo: MOTIVO.A_PAREAR, dados: { versao: '9.9' } }), 'desligada', null],
  ['o pedido estoura', () => { throw new Error('rede'); }, 'desligada', null],
  ['o desfecho vazio', () => null, 'desligada', null],
];

async function aSaudeSaiDaRespostaDoHealth() {
  for (const [nome, responder, situacao, saude] of CASOS) {
    const { ConexaoAnki, pedidos } = carregarAConexao(responder);
    assert.strictEqual(await ConexaoAnki.conferir(), situacao, `a situação: ${nome}`);
    assert.deepStrictEqual(comoValor(ConexaoAnki.saude()), saude, `a saúde: ${nome}`);
    assert.deepStrictEqual(pedidos, [{ pedido: { metodo: 'GET', caminho: '/health', semAssinatura: true }, opcoes: { prazoMs: 3000 } }],
      `o pedido de saúde, com o prazo de ${ConexaoAnki.TEMPO_DA_RESPOSTA} ms: ${nome}`);
  }
}

const JA_CONECTOU = 'pm_anki_ja_conectou';

const MUDANCAS_DO_JA_CONECTOU = [
  ['no storage sync não conta', { [JA_CONECTOU]: { newValue: true } }, 'sync', false, 0],
  ['outra chave não conta', { pm_outra: { newValue: true } }, 'local', false, 0],
  ['gravado em outra aba', { [JA_CONECTOU]: { newValue: true } }, 'local', true, 1],
  ['gravado de novo não avisa', { [JA_CONECTOU]: { newValue: true } }, 'local', true, 0],
  ['um valor que não é true nem false não conta', { [JA_CONECTOU]: { newValue: 'sim' } }, 'local', true, 0],
  ['apagado não conta', { [JA_CONECTOU]: { newValue: undefined } }, 'local', true, 0],
  ['esquecido em outra aba', { [JA_CONECTOU]: { newValue: false } }, 'local', false, 1],
  ['esquecido de novo não avisa', { [JA_CONECTOU]: { newValue: false } }, 'local', false, 0],
];

async function oJaConectouSegueOStorage() {
  const { ConexaoAnki, avisar } = carregarAConexao(() => ({ ok: false, motivo: MOTIVO.SEM_RESPOSTA }));
  await ConexaoAnki.pronta;
  const vistas = [];
  ConexaoAnki.acompanhar(situacao => vistas.push(situacao));
  for (const [nome, mudancas, area, jaConectou, avisos] of MUDANCAS_DO_JA_CONECTOU) {
    const antes = vistas.length;
    avisar(mudancas, area);
    assert.strictEqual(ConexaoAnki.jaConectou(), jaConectou, `já conectou: ${nome}`);
    assert.deepStrictEqual(vistas.slice(antes), Array(avisos).fill('conectando'), `os avisos da situação: ${nome}`);
  }
}

async function main() {
  await aSaudeSaiDaRespostaDoHealth();
  await oJaConectouSegueOStorage();
  console.log('conexao-anki tests passed');
}

main().catch(erro => {
  console.error(erro);
  process.exit(1);
});

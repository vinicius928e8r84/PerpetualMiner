'use strict';

const assert = require('assert');

globalThis.PerpetualMiner = {};
require('../painel/painel-ia-estado.js');
const { daMarca, daConta, deOutraConta, notaDaConta, notaDaCopia, falhaAoConfirmar, falhaAoApagar, depoisDeApagar } = globalThis.PerpetualMiner.RetratoDaChave;

const conferirCasos = casos => casos.forEach(([nome, visto, esperado]) => assert.deepStrictEqual(visto, esperado, nome));

conferirCasos([
  ['sem marca, sem chave', daMarca(null), { ultimos4: '', contaDaChave: '' }],
  ['a marca de antes da conta não tem o campo conta', daMarca({ ultimos4: 'abcd' }), { ultimos4: 'abcd', contaDaChave: '' }],
  ['a marca com a conta', daMarca({ ultimos4: 'abcd', conta: 'uid-1' }), { ultimos4: 'abcd', contaDaChave: 'uid-1' }],
  ['a marca legada guarda conta nula', daMarca({ ultimos4: 'abcd', conta: null }), { ultimos4: 'abcd', contaDaChave: null }],
  ['a marca sem os últimos 4', daMarca({ conta: '' }), { ultimos4: '', contaDaChave: '' }],
  ['sem conta', daConta(null), { comConta: false, uid: '' }],
  ['com conta', daConta({ uid: 'uid-1' }), { comConta: true, uid: 'uid-1' }],
  ['com conta sem uid', daConta({}), { comConta: true, uid: '' }],
]);

const chave = (contaDaChave, comConta, uid = comConta ? 'uid-1' : '') => ({ contaDaChave, comConta, uid });
conferirCasos([
  ['legada: a conta nula', notaDaConta(chave(null, false)), 'CFG-42.legado'],
  ['legada: com conta e a chave sem dono', notaDaConta(chave('', true)), 'CFG-42.legado'],
  ['a chave é de outra conta', notaDaConta(chave('uid-2', true)), 'CFG-35.chaveDeOutraConta'],
  ['a chave é desta conta', notaDaConta(chave('uid-1', true)), 'CFG-35.chaveNaConta'],
  ['sem conta, a chave vinculada a uma', notaDaConta(chave('uid-1', false)), 'CFG-35.chaveSemContaVinculada'],
  ['sem conta e sem vínculo', notaDaConta(chave('', false)), 'CFG-35.chaveSemConta'],
  ['de outra conta: o uid e a conta diferem', deOutraConta(chave('uid-2', true)), true],
  ['da mesma conta', deOutraConta(chave('uid-1', true)), false],
  ['sem uid nunca é de outra conta', deOutraConta(chave('uid-2', false)), false],
  ['sem dono nunca é de outra conta', deOutraConta(chave('', true)), false],
]);

conferirCasos([
  ['a cópia ainda não conferida não tem nota', notaDaCopia(null), null],
  ['a cópia na Conexão', notaDaCopia(true), { texto: 'CFG-35.chaveCopiaNaConexao', copia: 'tem' }],
  ['a cópia que falta', notaDaCopia(false), { texto: 'CFG-35.chaveSemCopia', copia: 'falta' }],
]);

const erro = (codigo, name) => Object.assign(new Error('x'), codigo === undefined ? {} : { codigo }, name ? { name } : {});
conferirCasos([
  ['confirmar com a Conexão antiga', falhaAoConfirmar(erro('outdated_connection')), { ok: false, motivo: 'conexao_antiga', detalhes: 'outdated_connection' }],
  ['confirmar com outro código', falhaAoConfirmar(erro('pairing_invalid')), { ok: false, motivo: 'conexao_com_erro', detalhes: 'pairing_invalid' }],
  ['confirmar com um erro sem código', falhaAoConfirmar(erro(undefined, 'TypeError')), { ok: false, motivo: 'conexao_com_erro', detalhes: 'TypeError' }],
  ['confirmar sem erro nenhum', falhaAoConfirmar(undefined), { ok: false, motivo: 'conexao_com_erro', detalhes: 'storage_error' }],
  ['apagar com a Conexão antiga', falhaAoApagar(erro('outdated_connection')), { motivo: 'conexao_antiga', detalhes: 'outdated_connection' }],
  ['apagar a chave que é de outra conta', falhaAoApagar(erro('other_account_owner')), { motivo: 'outra_conta', detalhes: 'other_account_owner' }],
  ['apagar com outro erro', falhaAoApagar(erro(undefined, 'QuotaExceededError')), { motivo: 'apagar_local', detalhes: 'QuotaExceededError' }],
  ['apagar com um código desconhecido', falhaAoApagar(erro('constructor')), { motivo: 'apagar_local', detalhes: 'constructor' }],
  ['apagar com um objeto vazio', falhaAoApagar({}), { motivo: 'apagar_local', detalhes: 'storage_error' }],
]);

conferirCasos([
  ['apagada de vez, com a Conexão ligada', depoisDeApagar({ configurada: false, conta: '' }, true), { ultimos4: '', contaDaChave: '', copia: null }],
  ['a da conta fica, com a Conexão ligada', depoisDeApagar({ configurada: true, ultimos4: 'wxyz', conta: 'uid-1' }, true), { ultimos4: 'wxyz', contaDaChave: 'uid-1', copia: true }],
  ['a da conta fica, com a Conexão desligada', depoisDeApagar({ configurada: true, ultimos4: 'wxyz', conta: 'uid-1' }, false), { ultimos4: 'wxyz', contaDaChave: 'uid-1', copia: null }],
  ['os últimos 4 só valem com a chave configurada', depoisDeApagar({ configurada: false, ultimos4: 'wxyz', conta: null }, false), { ultimos4: '', contaDaChave: null, copia: null }],
]);

console.log('test_retrato_da_chave: ok');

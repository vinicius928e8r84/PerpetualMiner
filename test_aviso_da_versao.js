'use strict';

// O aviso da versão da Conexão com o Anki como máquina de estados (`painel-conexao-versao-estado.js`, #177), sem tela: em que estado o
// aviso fica depois de cada leitura da saúde e de cada passo do Atualizar agora e do Reiniciar o Anki. Roda sem navegador:
// `node test_aviso_da_versao.js`. O que a pessoa vê é do e2e (`conexao-versao.spec.js`).

const assert = require('assert');

globalThis.PerpetualMiner = {};
require('./painel-conexao-versao-estado.js');
const { AvisoDaVersao } = globalThis.PerpetualMiner;
const { ESTADO, EVENTO, inicial, proxima } = AvisoDaVersao;

const leitura = (versao, atualizacao = null, antiga = false) => ({ tipo: EVENTO.LEITURA, leitura: { versao, atualizacao, antiga } });
const SEM_CONEXAO = { tipo: EVENTO.LEITURA, leitura: null };
const VELHA = leitura('0.3.9');
const NO_DISCO = leitura('0.3.9', { estado: 'instalada', versao: '0.4.5', atualizada: null });
const NOVA = leitura('0.4.5', { estado: null, versao: null, atualizada: '0.4.5' });

/** A máquina depois de uma sequência de eventos (um texto é um evento sem dados). */
const depoisDe = (eventos, comeco = inicial()) => eventos.reduce((maquina, evento) => proxima(maquina, typeof evento === 'string' ? { tipo: evento } : evento), comeco);
const visto = maquina => [maquina.estado, maquina.versao];

// --- a lista é fechada ----------------------------------------------------------------------------------------------------------
assert.deepStrictEqual(Object.values(ESTADO).sort(), ['atualizada', 'atualizando', 'emDia', 'falhou', 'naoReiniciou', 'noDisco', 'reiniciando', 'semAbridor', 'semConexao', 'velha']);
assert.strictEqual(inicial().estado, ESTADO.SEM_CONEXAO);

// --- o que a saúde diz, sem a pessoa ter feito nada -----------------------------------------------------------------------------
assert.deepStrictEqual(visto(depoisDe([SEM_CONEXAO])), [ESTADO.SEM_CONEXAO, null]);
for (const versao of ['0.4.0', '0.4.2', '1.0.0']) assert.strictEqual(depoisDe([leitura(versao)]).estado, ESTADO.EM_DIA, versao);
// Uma tentativa que falhou sozinha, com a Conexão ainda funcionando, não é assunto.
assert.strictEqual(depoisDe([leitura('0.4.2', { estado: 'falhou', versao: '0.4.2', atualizada: null })]).estado, ESTADO.EM_DIA);
assert.deepStrictEqual(visto(depoisDe([VELHA])), [ESTADO.VELHA, '0.3.9']);
// Sem versão (a Conexão de antes de a saúde dizê-la), ou com uma que não é a.b.c: velha demais.
assert.strictEqual(depoisDe([leitura(null)]).estado, ESTADO.VELHA);
assert.strictEqual(depoisDe([leitura('nova')]).estado, ESTADO.VELHA);
// A Conexão de antes do pareamento é velha demais seja qual for a versão que diz.
assert.strictEqual(depoisDe([leitura('0.4.30', null, true)]).estado, ESTADO.VELHA);
assert.deepStrictEqual(visto(depoisDe([leitura('0.3.9', { estado: 'falhou', versao: '0.3.9', atualizada: null })])), [ESTADO.FALHOU, '0.3.9']);
assert.deepStrictEqual(visto(depoisDe([NO_DISCO])), [ESTADO.NO_DISCO, '0.4.5']);
// A versão no disco que também é velha demais não resolve: reiniciar não adianta.
assert.strictEqual(depoisDe([leitura('0.3.8', { estado: 'instalada', versao: '0.3.9', atualizada: null })]).estado, ESTADO.VELHA);
assert.deepStrictEqual(visto(depoisDe([NOVA])), [ESTADO.ATUALIZADA, '0.4.5']);

// --- “Conexão atualizada” uma vez por versão ------------------------------------------------------------------------------------
// Já vista em outra vez (storage): não volta.
assert.strictEqual(depoisDe([NOVA], inicial({ vista: '0.4.5' })).estado, ESTADO.EM_DIA);
// Mostrada nesta página: fica até a pessoa fechar, mesmo depois de gravada como vista.
const mostrada = depoisDe([NOVA, EVENTO.MOSTROU]);
assert.deepStrictEqual([mostrada.estado, mostrada.vista], [ESTADO.ATUALIZADA, '0.4.5']);
assert.strictEqual(depoisDe([NOVA], mostrada).estado, ESTADO.ATUALIZADA);
assert.strictEqual(depoisDe([EVENTO.FECHOU, NOVA], mostrada).estado, ESTADO.EM_DIA);

// --- Atualizar agora ------------------------------------------------------------------------------------------------------------
const atualizando = depoisDe([VELHA, EVENTO.ATUALIZAR]);
assert.strictEqual(atualizando.estado, ESTADO.ATUALIZANDO);
// O pedido é dono do aviso até a resposta: a saúde que chega no meio (ou a Conexão que cai) não o tira.
assert.strictEqual(depoisDe([VELHA, SEM_CONEXAO, VELHA], atualizando).estado, ESTADO.ATUALIZANDO);
const atualizou = resultado => ({ tipo: EVENTO.ATUALIZOU, resultado });
assert.deepStrictEqual(visto(depoisDe([atualizou({ estado: 'instalada', versao: '0.4.5' })], atualizando)), [ESTADO.NO_DISCO, '0.4.5']);
assert.deepStrictEqual(visto(depoisDe([atualizou({ estado: 'falhou', versao: null })], atualizando)), [ESTADO.FALHOU, '0.3.9']);
// O que o clique respondeu fica: a saúde seguinte, que não fala da tentativa, não devolve o aviso a “desatualizada”.
assert.strictEqual(depoisDe([atualizou({ estado: 'falhou', versao: null }), VELHA], atualizando).estado, ESTADO.FALHOU);
// Tentar de novo sai do falhou.
assert.strictEqual(depoisDe([atualizou({ estado: 'falhou', versao: null }), EVENTO.ATUALIZAR], atualizando).estado, ESTADO.ATUALIZANDO);
// Só se atualiza a partir de velha ou falhou: o clique repetido, ou fora de hora, não muda nada.
for (const comeco of [[SEM_CONEXAO], [leitura('0.4.2')], [NO_DISCO], [NOVA], [VELHA, EVENTO.ATUALIZAR]]) {
  const antes = depoisDe(comeco);
  assert.strictEqual(proxima(antes, { tipo: EVENTO.ATUALIZAR }), antes, JSON.stringify(comeco));
}

// --- Reiniciar o Anki -----------------------------------------------------------------------------------------------------------
const reiniciando = depoisDe([NO_DISCO, EVENTO.REINICIAR]);
assert.strictEqual(reiniciando.estado, ESTADO.REINICIANDO);
// O Anki fecha de propósito: a Conexão cala e o aviso segue dizendo que está reiniciando (o defeito T6 era o aviso sumir aqui).
assert.strictEqual(depoisDe([SEM_CONEXAO], reiniciando).estado, ESTADO.REINICIANDO);
// Voltou na versão nova: atualizada, e o que o Atualizar agora tinha respondido é esquecido.
const voltou = depoisDe([SEM_CONEXAO, NOVA, EVENTO.REINICIOU], reiniciando);
assert.deepStrictEqual([voltou.estado, voltou.versao, voltou.resultado], [ESTADO.ATUALIZADA, '0.4.5', null]);
// O Anki fechou e não voltou: o erro é dito sem a Conexão, e fica dito enquanto ela não responder.
const naoVoltou = depoisDe([SEM_CONEXAO, EVENTO.NAO_REINICIOU], reiniciando);
assert.strictEqual(naoVoltou.estado, ESTADO.NAO_REINICIOU);
assert.strictEqual(depoisDe([SEM_CONEXAO, SEM_CONEXAO], naoVoltou).estado, ESTADO.NAO_REINICIOU);
// Sem a Conexão não há a quem pedir o reinício: o clique não muda nada.
assert.strictEqual(proxima(naoVoltou, { tipo: EVENTO.REINICIAR }), naoVoltou);
// A pessoa abre o Anki à mão e a Conexão volta na versão nova: o erro sai.
assert.deepStrictEqual(visto(depoisDe([NOVA], naoVoltou)), [ESTADO.ATUALIZADA, '0.4.5']);
// O Anki não chegou a fechar (o prazo venceu): a Conexão segue ligada na velha, o erro é dito e o Reiniciar vale de novo.
const naoFechou = depoisDe([NO_DISCO, EVENTO.NAO_REINICIOU], reiniciando);
assert.deepStrictEqual(visto(naoFechou), [ESTADO.NAO_REINICIOU, '0.4.5']);
assert.strictEqual(depoisDe([NO_DISCO], naoFechou).estado, ESTADO.NAO_REINICIOU);
assert.strictEqual(depoisDe([EVENTO.REINICIAR], naoFechou).estado, ESTADO.REINICIANDO);
// Sem a permissão do abridor o Anki não é fechado: a tela diz como, enquanto a Conexão velha seguir ligada.
const semAbridor = depoisDe([EVENTO.SEM_PERMISSAO], reiniciando);
assert.deepStrictEqual(visto(semAbridor), [ESTADO.SEM_ABRIDOR, '0.4.5']);
assert.strictEqual(depoisDe([NO_DISCO], semAbridor).estado, ESTADO.SEM_ABRIDOR);
assert.strictEqual(depoisDe([SEM_CONEXAO], semAbridor).estado, ESTADO.SEM_CONEXAO);   // a pessoa fechou o Anki, como a tela pediu
assert.strictEqual(depoisDe([SEM_CONEXAO, NOVA], semAbridor).estado, ESTADO.ATUALIZADA);
// Só se reinicia a partir da versão no disco (ou do reinício que não deu, com a Conexão ligada).
for (const comeco of [[SEM_CONEXAO], [VELHA], [leitura('0.4.2')], [NOVA], [NO_DISCO, EVENTO.REINICIAR], [NO_DISCO, EVENTO.REINICIAR, EVENTO.SEM_PERMISSAO]]) {
  const antes = depoisDe(comeco);
  assert.strictEqual(proxima(antes, { tipo: EVENTO.REINICIAR }), antes, JSON.stringify(comeco));
}
// O desfecho de um pedido só vale para o pedido que está no ar.
for (const tipo of [EVENTO.ATUALIZOU, EVENTO.REINICIOU, EVENTO.NAO_REINICIOU, EVENTO.SEM_PERMISSAO]) {
  const antes = depoisDe([VELHA]);
  assert.strictEqual(proxima(antes, { tipo, resultado: { estado: 'instalada', versao: '0.4.5' } }), antes, tipo);
}

// --- nenhum estado é um beco: de cada um, algum evento leva a outro -------------------------------------------------------------
const alcancados = new Set();
const eventos = [SEM_CONEXAO, VELHA, NO_DISCO, NOVA, leitura('0.4.2'), EVENTO.ATUALIZAR, atualizou({ estado: 'falhou', versao: null }), atualizou({ estado: 'instalada', versao: '0.4.5' }),
  EVENTO.REINICIAR, EVENTO.SEM_PERMISSAO, EVENTO.REINICIOU, EVENTO.NAO_REINICIOU, EVENTO.MOSTROU, EVENTO.FECHOU];
const fila = [inicial()];
const saidas = new Map();
while (fila.length) {
  const maquina = fila.pop();
  const chave = JSON.stringify(maquina);
  if (alcancados.has(chave)) continue;
  alcancados.add(chave);
  for (const evento of eventos) {
    const seguinte = proxima(maquina, typeof evento === 'string' ? { tipo: evento } : evento);
    if (seguinte.estado !== maquina.estado) saidas.set(maquina.estado, (saidas.get(maquina.estado) || new Set()).add(seguinte.estado));
    fila.push(seguinte);
  }
}
assert.deepStrictEqual([...saidas.keys()].sort(), Object.values(ESTADO).sort(), 'todo estado é alcançado e tem saída');

console.log('aviso da versão ok');

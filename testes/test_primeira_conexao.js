'use strict';

const assert = require('assert');

globalThis.PerpetualMiner = {};
require('../painel/painel-anki-primeira-conexao-estado.js');
const { FaseDaPrimeiraConexao, ConversaComOAbridor } = globalThis.PerpetualMiner;

// ─── A fase do card ───────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const { FASE, EVENTO, inicial, proxima, cobreAsAbas } = FaseDaPrimeiraConexao;
  const conexao = (situacao, dados = {}) => ({ tipo: EVENTO.CONEXAO, situacao, respondeu: false, jaConectou: false, naArea: true, resolvido: false, ...dados });
  const depoisDe = (eventos, comeco = inicial()) => eventos.reduce((estado, evento) => proxima(estado, typeof evento === 'string' ? { tipo: evento } : evento), comeco);
  const visto = estado => [estado.fase, estado.pendente];
  const LEU_PENDENTE = { tipo: EVENTO.LEU, pendente: true };
  const JA = { jaConectou: true };

  assert.deepStrictEqual(Object.values(FASE).sort(), ['abas', 'conferindo', 'instalando', 'passo4', 'pronto']);
  assert.deepStrictEqual(visto(inicial()), [FASE.CONFERINDO, false]);
  assert.deepStrictEqual(Object.values(FASE).filter(fase => cobreAsAbas({ fase })).sort(), ['instalando', 'passo4', 'pronto']);

  assert.deepStrictEqual(visto(depoisDe([conexao('conectando')])), [FASE.CONFERINDO, false]);
  assert.deepStrictEqual(visto(depoisDe([conexao('conectando', { respondeu: true })])), [FASE.INSTALANDO, false]);

  assert.deepStrictEqual(visto(depoisDe([conexao('desligada')])), [FASE.INSTALANDO, false]);
  assert.deepStrictEqual(visto(depoisDe([conexao('desligada'), conexao('conectando'), conexao('desligada')])), [FASE.INSTALANDO, false]);
  assert.deepStrictEqual(visto(depoisDe([conexao('ligada')])), [FASE.ABAS, false]);
  assert.deepStrictEqual(visto(depoisDe([conexao('desligada', JA)])), [FASE.ABAS, false]);
  assert.deepStrictEqual(visto(depoisDe([conexao('desligada'), conexao('desligada', JA)])), [FASE.ABAS, false]);

  const NO_PASSO_4 = depoisDe([conexao('desligada'), conexao('ligada')]);
  assert.deepStrictEqual(visto(NO_PASSO_4), [FASE.PASSO4, true]);
  assert.deepStrictEqual(visto(depoisDe([conexao('desligada'), conexao('ligada', { resolvido: true })])), [FASE.PRONTO, false]);
  assert.deepStrictEqual(visto(depoisDe([conexao('desligada'), conexao('ligada', { naArea: false })])), [FASE.ABAS, false]);

  assert.deepStrictEqual(visto(depoisDe([EVENTO.RESOLVEU], NO_PASSO_4)), [FASE.PRONTO, false]);
  assert.deepStrictEqual(visto(depoisDe([EVENTO.RESOLVEU, EVENTO.PRONTO_PASSOU], NO_PASSO_4)), [FASE.ABAS, false]);
  for (const situacao of ['conectando', 'desligada', 'ligada']) {
    assert.deepStrictEqual(visto(depoisDe([EVENTO.RESOLVEU, conexao(situacao, JA)], NO_PASSO_4)), [FASE.PRONTO, false], situacao);
  }
  assert.deepStrictEqual(visto(depoisDe([conexao('conectando', JA), conexao('ligada', JA)], NO_PASSO_4)), [FASE.PASSO4, true]);

  const CAIU = depoisDe([conexao('desligada', JA)], NO_PASSO_4);
  assert.deepStrictEqual(visto(CAIU), [FASE.ABAS, true]);
  assert.strictEqual(cobreAsAbas(CAIU), false);
  assert.deepStrictEqual(visto(depoisDe([conexao('conectando', JA), conexao('desligada', JA)], CAIU)), [FASE.ABAS, true]);
  assert.deepStrictEqual(visto(depoisDe([conexao('ligada', JA)], CAIU)), [FASE.PASSO4, true]);
  assert.deepStrictEqual(visto(depoisDe([conexao('ligada', { ...JA, naArea: false })], CAIU)), [FASE.PASSO4, true]);
  assert.deepStrictEqual(visto(depoisDe([EVENTO.RESOLVEU], CAIU)), [FASE.ABAS, false]);
  assert.deepStrictEqual(visto(depoisDe([conexao('ligada', { ...JA, resolvido: true })], CAIU)), [FASE.ABAS, false]);

  assert.deepStrictEqual(visto(depoisDe([LEU_PENDENTE, conexao('conectando', JA)])), [FASE.CONFERINDO, true]);
  assert.deepStrictEqual(visto(depoisDe([LEU_PENDENTE, conexao('ligada', JA)])), [FASE.PASSO4, true]);
  assert.deepStrictEqual(visto(depoisDe([LEU_PENDENTE, conexao('desligada', JA)])), [FASE.ABAS, true]);
  assert.deepStrictEqual(visto(depoisDe([LEU_PENDENTE, conexao('desligada', JA), conexao('ligada', JA), EVENTO.RESOLVEU, EVENTO.PRONTO_PASSOU])), [FASE.ABAS, false]);

  assert.deepStrictEqual(visto(depoisDe([conexao('desligada', JA)], NO_PASSO_4)), [FASE.ABAS, true]);
  assert.deepStrictEqual(visto(depoisDe([EVENTO.RESOLVEU, EVENTO.PRONTO_PASSOU], NO_PASSO_4)), [FASE.ABAS, false]);

  for (const fase of Object.values(FASE)) {
    if (fase !== FASE.PRONTO) assert.strictEqual(proxima({ fase, pendente: false }, { tipo: EVENTO.PRONTO_PASSOU }).fase, fase, fase);
    const estado = Object.freeze({ fase, pendente: true });
    for (const tipo of Object.values(EVENTO)) proxima(estado, { tipo, situacao: 'ligada', pendente: false });
    assert.strictEqual(proxima(estado, { tipo: 'nada' }), estado);
  }
}

// ─── A conversa com o abridor (o passo 4) ─────────────────────────────────────────────────────────────────────────────────────
{
  const { FASE, EVENTO, inicial, proxima, resolvido, acoes } = ConversaComOAbridor;
  const depoisDe = (eventos, comeco = inicial()) => eventos.reduce((estado, evento) => proxima(estado, typeof evento === 'string' ? { tipo: evento } : evento), comeco);
  const permissao = tem => ({ tipo: EVENTO.PERMISSAO, tem });
  const respondeu = dada => ({ tipo: EVENTO.RESPONDEU, dada });
  const conferiu = (resultado, detalhe = '') => ({ tipo: EVENTO.CONFERIU, resultado, detalhe });
  const agoraNao = valor => ({ tipo: EVENTO.AGORA_NAO, valor });

  assert.deepStrictEqual(Object.values(FASE).sort(), ['achou', 'antes', 'lendo', 'nao_achou', 'pedindo', 'pedir', 'procurando', 'sem_abridor']);
  assert.deepStrictEqual(inicial(), { fase: FASE.ANTES, detalhe: '', agoraNao: false, recusada: false });

  assert.strictEqual(depoisDe([EVENTO.LIGOU]).fase, FASE.LENDO);
  assert.strictEqual(depoisDe([EVENTO.LIGOU, EVENTO.LIGOU]).fase, FASE.LENDO);
  assert.strictEqual(depoisDe([EVENTO.LIGOU, permissao(false), EVENTO.LIGOU]).fase, FASE.PEDIR);
  assert.strictEqual(depoisDe([EVENTO.LIGOU, permissao(true)]).fase, FASE.PROCURANDO);
  const PEDIR = depoisDe([EVENTO.LIGOU, permissao(false)]);
  assert.deepStrictEqual(PEDIR, { fase: FASE.PEDIR, detalhe: '', agoraNao: false, recusada: false });

  const PEDINDO = depoisDe([EVENTO.PERMITIR], PEDIR);
  assert.strictEqual(PEDINDO.fase, FASE.PEDINDO);
  assert.strictEqual(proxima(PEDINDO, { tipo: EVENTO.PERMITIR }), PEDINDO);
  assert.strictEqual(depoisDe([respondeu(true)], PEDINDO).fase, FASE.PROCURANDO);
  assert.deepStrictEqual(depoisDe([respondeu(false)], PEDINDO), { fase: FASE.PEDIR, detalhe: '', agoraNao: false, recusada: true });

  const PROCURANDO = depoisDe([respondeu(true)], PEDINDO);
  assert.deepStrictEqual(depoisDe([conferiu('achou')], PROCURANDO), { fase: FASE.ACHOU, detalhe: '', agoraNao: false, recusada: false });
  assert.deepStrictEqual(depoisDe([conferiu('nao_achou')], PROCURANDO).fase, FASE.NAO_ACHOU);
  assert.deepStrictEqual(depoisDe([conferiu('sem_resposta', 'Specified native messaging host not found.')], PROCURANDO),
    { fase: FASE.SEM_ABRIDOR, detalhe: 'Specified native messaging host not found.', agoraNao: false, recusada: false });
  assert.strictEqual(depoisDe([conferiu('sem_permissao')], PROCURANDO).fase, FASE.PEDIR);
  for (const resultado of ['nao_achou', 'sem_resposta']) {
    assert.deepStrictEqual(depoisDe([conferiu(resultado, 'causa'), EVENTO.TENTAR], PROCURANDO), { fase: FASE.PROCURANDO, detalhe: '', agoraNao: false, recusada: false }, resultado);
  }
  const COM_AGORA_NAO = depoisDe([agoraNao(true), EVENTO.LIGOU, permissao(true)]);
  assert.strictEqual(COM_AGORA_NAO.agoraNao, true);
  assert.strictEqual(depoisDe([conferiu('achou')], COM_AGORA_NAO).agoraNao, false);
  assert.strictEqual(depoisDe([conferiu('sem_permissao')], COM_AGORA_NAO).agoraNao, true);
  assert.strictEqual(depoisDe([respondeu(false), EVENTO.PERMITIR, respondeu(true), conferiu('nao_achou')], PEDINDO).recusada, false);

  for (const fase of Object.values(FASE)) {
    assert.deepStrictEqual(proxima({ ...inicial(), fase }, agoraNao(true)), { ...inicial(), fase, agoraNao: true }, fase);
  }

  assert.deepStrictEqual(Object.values(FASE).filter(fase => resolvido({ ...inicial(), fase })), [FASE.ACHOU]);
  for (const fase of Object.values(FASE)) assert.strictEqual(resolvido({ ...inicial(), fase, agoraNao: true }), true, fase);

  const SAI_SOZINHA = { [FASE.ANTES]: EVENTO.LIGOU, [FASE.LENDO]: EVENTO.PERMISSAO, [FASE.PROCURANDO]: EVENTO.CONFERIU };
  for (const fase of Object.values(FASE)) {
    const estado = { ...inicial(), fase };
    const { permitir, ocupado, tentar, agoraNao: comAgoraNao } = acoes(estado);
    if (fase === FASE.ACHOU) { assert.deepStrictEqual([permitir, tentar, comAgoraNao], [false, false, false]); continue; }
    if (SAI_SOZINHA[fase]) {
      assert.deepStrictEqual([permitir, tentar, comAgoraNao], [false, false, false], fase);
      assert.notStrictEqual(proxima(estado, { tipo: SAI_SOZINHA[fase], tem: false, resultado: 'achou' }).fase, fase, fase);
      continue;
    }
    assert.strictEqual(comAgoraNao, true, fase);
    assert.strictEqual(permitir, fase === FASE.PEDIR || fase === FASE.PEDINDO, fase);
    assert.strictEqual(ocupado, fase === FASE.PEDINDO, fase);
    assert.strictEqual(tentar, fase === FASE.NAO_ACHOU || fase === FASE.SEM_ABRIDOR, fase);
    assert.deepStrictEqual(acoes({ ...estado, agoraNao: true }), { permitir, ocupado, tentar, agoraNao: false }, fase);
  }

  for (const fase of Object.values(FASE)) {
    const estado = Object.freeze({ ...inicial(), fase });
    if (fase !== FASE.PEDINDO) assert.strictEqual(proxima(estado, respondeu(true)), estado, fase);
    if (fase !== FASE.PROCURANDO) assert.strictEqual(proxima(estado, conferiu('achou')), estado, fase);
    if (fase !== FASE.LENDO) assert.strictEqual(proxima(estado, permissao(true)), estado, fase);
    if (fase !== FASE.PEDIR) assert.strictEqual(proxima(estado, { tipo: EVENTO.PERMITIR }), estado, fase);
    if (![FASE.NAO_ACHOU, FASE.SEM_ABRIDOR].includes(fase)) assert.strictEqual(proxima(estado, { tipo: EVENTO.TENTAR }), estado, fase);
  }
}

console.log('primeira conexão ok');

'use strict';

// A primeira conexão como duas máquinas de estados (`painel-anki-primeira-conexao-estado.js`), sem tela: a fase do card ONB-16 (o que
// fica no lugar das abas) e a conversa com o abridor (o passo 4, ONB-17). Roda sem navegador: `node test_primeira_conexao.js`.
// O que a pessoa vê é do e2e (`abrir-o-anki-sozinho.spec.js`, `painel-anki-primeira-conexao.spec.js`).

const assert = require('assert');

globalThis.PerpetualMiner = {};
require('./painel-anki-primeira-conexao-estado.js');
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
  // Só três fases põem o card no lugar das abas.
  assert.deepStrictEqual(Object.values(FASE).filter(fase => cobreAsAbas({ fase })).sort(), ['instalando', 'passo4', 'pronto']);

  // Antes da primeira resposta nada cobre: nem card, nem Pronto.
  assert.deepStrictEqual(visto(depoisDe([conexao('conectando')])), [FASE.CONFERINDO, false]);
  // Uma resposta de antes (a tentativa da F1 ainda no ar) já conta.
  assert.deepStrictEqual(visto(depoisDe([conexao('conectando', { respondeu: true })])), [FASE.INSTALANDO, false]);

  // Nunca conectada: os passos 1 a 3, e uma tentativa no ar não tira o card.
  assert.deepStrictEqual(visto(depoisDe([conexao('desligada')])), [FASE.INSTALANDO, false]);
  assert.deepStrictEqual(visto(depoisDe([conexao('desligada'), conexao('conectando'), conexao('desligada')])), [FASE.INSTALANDO, false]);
  // A primeira resposta já ligada (ou de quem já conectou): as abas, sem card nem Pronto.
  assert.deepStrictEqual(visto(depoisDe([conexao('ligada')])), [FASE.ABAS, false]);
  assert.deepStrictEqual(visto(depoisDe([conexao('desligada', JA)])), [FASE.ABAS, false]);
  // Outra página conectou enquanto esta mostrava os passos: as abas.
  assert.deepStrictEqual(visto(depoisDe([conexao('desligada'), conexao('desligada', JA)])), [FASE.ABAS, false]);

  // A Conexão liga com o card na tela: o passo 4, que fica pendente até se resolver.
  const NO_PASSO_4 = depoisDe([conexao('desligada'), conexao('ligada')]);
  assert.deepStrictEqual(visto(NO_PASSO_4), [FASE.PASSO4, true]);
  // … a menos que ele já esteja resolvido (um “Agora não” guardado): direto ao Pronto.
  assert.deepStrictEqual(visto(depoisDe([conexao('desligada'), conexao('ligada', { resolvido: true })])), [FASE.PRONTO, false]);
  // … ou que a pessoa esteja em outra área: as abas estarão lá quando ela chegar.
  assert.deepStrictEqual(visto(depoisDe([conexao('desligada'), conexao('ligada', { naArea: false })])), [FASE.ABAS, false]);

  // O passo 4 se resolve (achou o Anki, ou Agora não): o Pronto, e depois as abas.
  assert.deepStrictEqual(visto(depoisDe([EVENTO.RESOLVEU], NO_PASSO_4)), [FASE.PRONTO, false]);
  assert.deepStrictEqual(visto(depoisDe([EVENTO.RESOLVEU, EVENTO.PRONTO_PASSOU], NO_PASSO_4)), [FASE.ABAS, false]);
  // O Pronto não se interrompe: o que a Conexão disser nesse instante não muda a fase.
  for (const situacao of ['conectando', 'desligada', 'ligada']) {
    assert.deepStrictEqual(visto(depoisDe([EVENTO.RESOLVEU, conexao(situacao, JA)], NO_PASSO_4)), [FASE.PRONTO, false], situacao);
  }
  // Uma conferência no ar não mexe no passo 4, e a Conexão que segue ligada também não.
  assert.deepStrictEqual(visto(depoisDe([conexao('conectando', JA), conexao('ligada', JA)], NO_PASSO_4)), [FASE.PASSO4, true]);

  // T3: a Conexão cai no passo 4. As abas voltam (Custos e Ajustes de envio funcionam sem o Anki) e a pergunta fica guardada.
  const CAIU = depoisDe([conexao('desligada', JA)], NO_PASSO_4);
  assert.deepStrictEqual(visto(CAIU), [FASE.ABAS, true]);
  assert.strictEqual(cobreAsAbas(CAIU), false);
  assert.deepStrictEqual(visto(depoisDe([conexao('conectando', JA), conexao('desligada', JA)], CAIU)), [FASE.ABAS, true]);
  // … e volta com a Conexão, onde a pessoa estiver.
  assert.deepStrictEqual(visto(depoisDe([conexao('ligada', JA)], CAIU)), [FASE.PASSO4, true]);
  assert.deepStrictEqual(visto(depoisDe([conexao('ligada', { ...JA, naArea: false })], CAIU)), [FASE.PASSO4, true]);
  // Resolvida em outro lugar (o passo 4 da Boas-vindas) com as abas na tela: sem card e sem Pronto.
  assert.deepStrictEqual(visto(depoisDe([EVENTO.RESOLVEU], CAIU)), [FASE.ABAS, false]);
  assert.deepStrictEqual(visto(depoisDe([conexao('ligada', { ...JA, resolvido: true })], CAIU)), [FASE.ABAS, false]);

  // A página recarregada com a pergunta pendente: ligada, o passo 4; desligada, as abas (antes: o card sem saída).
  assert.deepStrictEqual(visto(depoisDe([LEU_PENDENTE, conexao('conectando', JA)])), [FASE.CONFERINDO, true]);
  assert.deepStrictEqual(visto(depoisDe([LEU_PENDENTE, conexao('ligada', JA)])), [FASE.PASSO4, true]);
  assert.deepStrictEqual(visto(depoisDe([LEU_PENDENTE, conexao('desligada', JA)])), [FASE.ABAS, true]);
  assert.deepStrictEqual(visto(depoisDe([LEU_PENDENTE, conexao('desligada', JA), conexao('ligada', JA), EVENTO.RESOLVEU, EVENTO.PRONTO_PASSOU])), [FASE.ABAS, false]);

  // Toda fase que cobre as abas tem saída sem depender de o Anki abrir, menos a de quem nunca conectou (o desenho: ONB-16).
  assert.deepStrictEqual(visto(depoisDe([conexao('desligada', JA)], NO_PASSO_4)), [FASE.ABAS, true]);
  assert.deepStrictEqual(visto(depoisDe([EVENTO.RESOLVEU, EVENTO.PRONTO_PASSOU], NO_PASSO_4)), [FASE.ABAS, false]);

  // Um evento que a fase não espera não muda nada, e nenhum estado é mudado no lugar.
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

  // A Conexão liga: a extensão pergunta ao Chrome se tem a permissão, uma vez só por página.
  assert.strictEqual(depoisDe([EVENTO.LIGOU]).fase, FASE.LENDO);
  assert.strictEqual(depoisDe([EVENTO.LIGOU, EVENTO.LIGOU]).fase, FASE.LENDO);
  assert.strictEqual(depoisDe([EVENTO.LIGOU, permissao(false), EVENTO.LIGOU]).fase, FASE.PEDIR);
  // Com a permissão já dada, confere sem clique; sem ela, pede.
  assert.strictEqual(depoisDe([EVENTO.LIGOU, permissao(true)]).fase, FASE.PROCURANDO);
  const PEDIR = depoisDe([EVENTO.LIGOU, permissao(false)]);
  assert.deepStrictEqual(PEDIR, { fase: FASE.PEDIR, detalhe: '', agoraNao: false, recusada: false });

  // Permitir: o aviso do Chrome. Um segundo clique não pede de novo.
  const PEDINDO = depoisDe([EVENTO.PERMITIR], PEDIR);
  assert.strictEqual(PEDINDO.fase, FASE.PEDINDO);
  assert.strictEqual(proxima(PEDINDO, { tipo: EVENTO.PERMITIR }), PEDINDO);
  assert.strictEqual(depoisDe([respondeu(true)], PEDINDO).fase, FASE.PROCURANDO);
  assert.deepStrictEqual(depoisDe([respondeu(false)], PEDINDO), { fase: FASE.PEDIR, detalhe: '', agoraNao: false, recusada: true });

  // O que o abridor respondeu.
  const PROCURANDO = depoisDe([respondeu(true)], PEDINDO);
  assert.deepStrictEqual(depoisDe([conferiu('achou')], PROCURANDO), { fase: FASE.ACHOU, detalhe: '', agoraNao: false, recusada: false });
  assert.deepStrictEqual(depoisDe([conferiu('nao_achou')], PROCURANDO).fase, FASE.NAO_ACHOU);
  assert.deepStrictEqual(depoisDe([conferiu('sem_resposta', 'Specified native messaging host not found.')], PROCURANDO),
    { fase: FASE.SEM_ABRIDOR, detalhe: 'Specified native messaging host not found.', agoraNao: false, recusada: false });
  assert.strictEqual(depoisDe([conferiu('sem_permissao')], PROCURANDO).fase, FASE.PEDIR);
  // Tentar de novo confere de novo, e o detalhe antigo sai.
  for (const resultado of ['nao_achou', 'sem_resposta']) {
    assert.deepStrictEqual(depoisDe([conferiu(resultado, 'causa'), EVENTO.TENTAR], PROCURANDO), { fase: FASE.PROCURANDO, detalhe: '', agoraNao: false, recusada: false }, resultado);
  }
  // A permissão dada vence um Agora não e uma recusa antigos; sem a permissão, eles ficam.
  const COM_AGORA_NAO = depoisDe([agoraNao(true), EVENTO.LIGOU, permissao(true)]);
  assert.strictEqual(COM_AGORA_NAO.agoraNao, true);
  assert.strictEqual(depoisDe([conferiu('achou')], COM_AGORA_NAO).agoraNao, false);
  assert.strictEqual(depoisDe([conferiu('sem_permissao')], COM_AGORA_NAO).agoraNao, true);
  assert.strictEqual(depoisDe([respondeu(false), EVENTO.PERMITIR, respondeu(true), conferiu('nao_achou')], PEDINDO).recusada, false);

  // Agora não é um fato guardado: vale em qualquer fase, sem mudá-la.
  for (const fase of Object.values(FASE)) {
    assert.deepStrictEqual(proxima({ ...inicial(), fase }, agoraNao(true)), { ...inicial(), fase, agoraNao: true }, fase);
  }

  // Resolvido: o abridor achou o Anki, ou a pessoa disse Agora não.
  assert.deepStrictEqual(Object.values(FASE).filter(fase => resolvido({ ...inicial(), fase })), [FASE.ACHOU]);
  for (const fase of Object.values(FASE)) assert.strictEqual(resolvido({ ...inicial(), fase, agoraNao: true }), true, fase);

  // Toda fase tem saída: um botão, ou uma espera que termina sozinha (a leitura da permissão; a conferência, em 10 s).
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
    // Dito o Agora não, o botão dele sai e os outros ficam.
    assert.deepStrictEqual(acoes({ ...estado, agoraNao: true }), { permitir, ocupado, tentar, agoraNao: false }, fase);
  }

  // Um evento fora de hora não muda nada (a resposta do Chrome sem pedido, o resultado sem conferência).
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

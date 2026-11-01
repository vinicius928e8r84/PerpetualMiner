'use strict';

// O teto do mês na Conexão de mentira (#160): `POST /custos/teto` lê o teto, o gasto da chave no mês e o mês; `/custos/teto/definir`
// guarda o teto novo (positivo, com dois decimais), como `complemento/teto_do_mes.py`. O gasto vem dos registros de custo dos Envios
// da fila (`definirFila`) ou do que o teste põe (`definir({ gasto })`); o mês, do `hoje` do contrato ou do relógio do fake. As respostas
// são as de `complemento/contrato/exemplos-do-teto.json`: `test_fake_anki.js` e `contrato-da-conexao.spec.js` as conferem contra elas.

const PADRAO = 10;
const MAXIMO = 1_000_000;
const SEM_GASTO = new Set(['session', 'plan_tokens']); // o plano não cobra por Cartão; o resumo da sessão repete o que já foi contado
const arredondar = (valor, casas) => Math.round(valor * 10 ** casas) / 10 ** casas;

/** `registros()`: os registros de custo de todos os Envios; `agora()`: o relógio do fake (um Date). */
function criarTeto({ registros, agora }) {
  const estado = { limite: null, gasto: null, hoje: null };
  const mes = () => (estado.hoje || agora().toISOString().slice(0, 10)).slice(0, 7);

  function gastoDoMes() {
    if (estado.gasto !== null) return estado.gasto;
    const soma = registros().filter(r => String(r.date || '').slice(0, 7) === mes() && !SEM_GASTO.has(r.type)).reduce((total, r) => total + (r.cost_usd || 0), 0);
    return arredondar(soma, 6);
  }

  const estadoDoTeto = () => ({ status: 200, json: { limitUsd: estado.limite ?? PADRAO, spentUsd: gastoDoMes(), month: mes() } });

  function responder(metodo, caminho, corpo) {
    if (metodo !== 'POST') return null;
    if (caminho === '/custos/teto') return estadoDoTeto();
    if (caminho !== '/custos/teto/definir') return null;
    const valor = arredondar(corpo?.limitUsd, 2);
    if (typeof corpo?.limitUsd !== 'number' || !(valor > 0 && valor <= MAXIMO)) return { status: 400, json: { error: 'invalid_request' } };
    estado.limite = valor;
    return estadoDoTeto();
  }

  return {
    responder,
    /** O que o teste põe: `limite` (o teto já escolhido) e `gasto` (o gasto do mês, no lugar do que os Envios da fila somam). */
    definir({ limite = null, gasto = null } = {}) { Object.assign(estado, { limite, gasto }); },
    /** O dia de hoje para a Conexão (AAAA-MM-DD): o mês vira. */
    passarOTempoAte(dia) { estado.hoje = dia; },
    /** @estado-guardado O teto que a pessoa escolheu neste computador (null: vale o padrão de US$ 10). */
    guardado: () => estado.limite,
  };
}

module.exports = { criarTeto };

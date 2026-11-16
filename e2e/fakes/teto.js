'use strict';

const PADRAO = 10;
const MAXIMO = 1_000_000;
const SEM_GASTO = new Set(['session', 'plan_tokens']);
const arredondar = (valor, casas) => Math.round(valor * 10 ** casas) / 10 ** casas;

function criarTeto({ registros, linhas, agora }) {
  const estado = { limite: null, gasto: null, hoje: null };
  const mes = () => (estado.hoje || agora().toISOString().slice(0, 10)).slice(0, 7);

  function gastoDoMes() {
    if (estado.gasto !== null) return estado.gasto;
    const dasLinhas = (linhas() || []).map(l => ({ date: l.createdAt, type: 'tokens', cost_usd: l.costs.totalUsd }));
    const soma = [...registros(), ...dasLinhas].filter(r => String(r.date || '').slice(0, 7) === mes() && !SEM_GASTO.has(r.type)).reduce((total, r) => total + (r.cost_usd || 0), 0);
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
    definir({ limite = null, gasto = null } = {}) { Object.assign(estado, { limite, gasto }); },
    passarOTempoAte(dia) { estado.hoje = dia; },
    /** @estado-guardado O teto que a pessoa escolheu neste computador (null: vale o padrão de US$ 10). */
    guardado: () => estado.limite,
  };
}

module.exports = { criarTeto };

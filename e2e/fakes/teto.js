'use strict';

const PADRAO = 10;
const MAXIMO = 1_000_000;
const SEM_GASTO = new Set(['session', 'plan_tokens']);
const arredondar = (valor, casas) => Math.round(valor * 10 ** casas) / 10 ** casas;

const registroDaLinha = linha => ({ date: linha.createdAt, type: 'tokens', cost_usd: linha.costs.totalUsd });
const mesDoRegistro = registro => String(registro.date || '').slice(0, 7);
const somar = registros => registros.reduce((total, registro) => total + (registro.cost_usd || 0), 0);
const dentroDaFaixa = valor => valor > 0 && valor <= MAXIMO;
const limitePedido = corpo => (typeof corpo?.limitUsd === 'number' ? arredondar(corpo.limitUsd, 2) : NaN);

function criarTeto({ registros, linhas, agora }) {
  const estado = { limite: null, gasto: null, hoje: null };
  const mes = () => (estado.hoje || agora().toISOString().slice(0, 10)).slice(0, 7);
  const gastoDoRegistro = registro => mesDoRegistro(registro) === mes() && !SEM_GASTO.has(registro.type);

  function gastoDoMes() {
    if (estado.gasto !== null) return estado.gasto;
    const todos = [...registros(), ...(linhas() || []).map(registroDaLinha)];
    return arredondar(somar(todos.filter(gastoDoRegistro)), 6);
  }

  const estadoDoTeto = () => ({ status: 200, json: { limitUsd: estado.limite ?? PADRAO, spentUsd: gastoDoMes(), month: mes() } });

  function definirOLimite(corpo) {
    const valor = limitePedido(corpo);
    if (!dentroDaFaixa(valor)) return { status: 400, json: { error: 'invalid_request' } };
    estado.limite = valor;
    return estadoDoTeto();
  }

  const ROTAS = new Map([['/custos/teto', estadoDoTeto], ['/custos/teto/definir', definirOLimite]]);

  function responder(metodo, caminho, corpo) {
    const rota = metodo === 'POST' ? ROTAS.get(caminho) : undefined;
    return rota ? rota(corpo) : null;
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

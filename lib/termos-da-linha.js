'use strict';

(function (raiz) {
  const PRAZO_MS = 5000;
  const TETO_DE_ITENS = 200;
  const TIPOS = Object.freeze(['palavra', 'phrasal_verb', 'expressao', 'giria', 'nome']);

  const ehTermo = termo => termo !== null && typeof termo === 'object'
    && Array.isArray(termo.posicoes) && termo.posicoes.every(Number.isInteger)
    && TIPOS.includes(termo.tipo)
    && typeof termo.comum === 'boolean';

  const formato = dados => Array.isArray(dados.termos) && dados.termos.every(ehTermo);

  const doTermo = ({ posicoes, tipo, comum }) => ({ posicoes, tipo, comum });

  const chaveDaLinha = (lang, texto) => `${lang}\n${texto.replace(/\s+/g, ' ').trim().toLowerCase()}`;

  function criar({ conversa, prazoMs = PRAZO_MS, teto = TETO_DE_ITENS }) {
    const guardadas = new Map();

    async function perguntarARota(lang, texto) {
      const desfecho = await conversa.pedir(raiz.PedidoAoAnki.termosDaLinha(lang, texto), { prazoMs, formato });
      return desfecho.ok ? desfecho.dados.termos.map(doTermo) : null;
    }

    function guardar(chave, pergunta) {
      guardadas.set(chave, pergunta);
      if (guardadas.size > teto) guardadas.delete(guardadas.keys().next().value);
      pergunta.then(termos => {
        if (termos === null && guardadas.get(chave) === pergunta) guardadas.delete(chave);
      });
    }

    function perguntar(lang, texto) {
      const chave = chaveDaLinha(lang, String(texto));
      if (!guardadas.has(chave)) guardar(chave, perguntarARota(lang, texto).catch(() => null));
      return guardadas.get(chave);
    }

    return Object.freeze({ perguntar });
  }

  raiz.TermosDaLinha = Object.freeze({ PRAZO_MS, TETO_DE_ITENS, criar });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});

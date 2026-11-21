'use strict';

(function (raiz) {
  const NUMERO_PT_BR = new Intl.NumberFormat('pt-BR');
  const MODELO = /\{([^{}]+)\}/g;

  function textoDaVoz(id, valores = {}) {
    return preencher(modeloDe(id), valores, id);
  }

  function modeloDe(id) {
    const [chave, ...partes] = String(id).split('.');
    let atual = raiz.CATALOGO_DA_VOZ[chave];
    if (atual === undefined) throw new Error(`Texto fora do catálogo da Voz: ${id}`);

    for (const parte of partes) {
      if (typeof atual !== 'object' || !(parte in atual)) {
        throw new Error(`O estado ${chave} não tem a parte "${parte}": ${partesDe(atual)}`);
      }
      atual = atual[parte];
    }

    if (typeof atual !== 'string') {
      throw new Error(`O estado ${id} é dividido em partes: ${partesDe(atual)}`);
    }
    return atual;
  }

  function partesDe(entrada) {
    return typeof entrada === 'object' && entrada !== null ? Object.keys(entrada).join(', ') : '(nenhuma)';
  }

  function preencher(modelo, valores, id) {
    return modelo.replace(MODELO, (_, corpo) => preencherCampo(corpo, valores, id));
  }

  function preencherCampo(corpo, valores, id) {
    const [nome, singular, plural] = corpo.split('|');
    const valor = valores[nome];
    if (valor === undefined || valor === null) {
      throw new Error(`Falta o valor "${nome}" para o texto ${id}`);
    }
    if (singular !== undefined) {
      if (typeof valor !== 'number') {
        throw new Error(`O valor "${nome}" do texto ${id} escolhe o plural, então precisa ser número`);
      }
      return Math.abs(valor) === 1 ? singular : plural;
    }
    return typeof valor === 'number' ? NUMERO_PT_BR.format(valor) : String(valor);
  }

  raiz.textoDaVoz = textoDaVoz;
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});

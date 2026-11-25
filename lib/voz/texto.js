'use strict';

(function (raiz) {
  const NUMERO_PT_BR = new Intl.NumberFormat('pt-BR');
  const MODELO = /\{([^{}]+)\}/g;

  function textoDaVoz(id, valores = {}) {
    return preencher(modeloDe(id), valores, id);
  }

  function modeloDe(id) {
    const [chave, ...partes] = String(id).split('.');
    const estado = raiz.CATALOGO_DA_VOZ[chave];
    if (estado === undefined) throw new Error(`Texto fora do catálogo da Voz: ${id}`);

    const atual = partes.reduce((entrada, parte) => parteDe(entrada, parte, chave), estado);
    if (typeof atual !== 'string') {
      throw new Error(`O estado ${id} é dividido em partes: ${partesDe(atual)}`);
    }
    return atual;
  }

  function parteDe(entrada, parte, chave) {
    if (typeof entrada !== 'object' || !(parte in entrada)) {
      throw new Error(`O estado ${chave} não tem a parte "${parte}": ${partesDe(entrada)}`);
    }
    return entrada[parte];
  }

  function partesDe(entrada) {
    return typeof entrada === 'object' && entrada !== null ? Object.keys(entrada).join(', ') : '(nenhuma)';
  }

  function preencher(modelo, valores, id) {
    return modelo.replace(MODELO, (_, corpo) => preencherCampo(corpo, valores, id));
  }

  function preencherCampo(corpo, valores, id) {
    const [nome, singular, plural] = corpo.split('|');
    const valor = valorDoCampo(nome, valores, id);
    if (singular === undefined) return valorNoTexto(valor);
    return Math.abs(numeroDoPlural(valor, nome, id)) === 1 ? singular : plural;
  }

  function valorDoCampo(nome, valores, id) {
    const valor = valores[nome];
    if (valor === undefined || valor === null) throw new Error(`Falta o valor "${nome}" para o texto ${id}`);
    return valor;
  }

  function numeroDoPlural(valor, nome, id) {
    if (typeof valor !== 'number') throw new Error(`O valor "${nome}" do texto ${id} escolhe o plural, então precisa ser número`);
    return valor;
  }

  function valorNoTexto(valor) {
    return typeof valor === 'number' ? NUMERO_PT_BR.format(valor) : String(valor);
  }

  raiz.textoDaVoz = textoDaVoz;
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});

'use strict';

// A busca no catálogo da Voz: `textoDaVoz('FOT-07', { n: 2, total: 5 })`.
//
// Carregado pelas páginas, pelo service worker e pelo content script, sempre
// depois de `lib/voz/catalogo.js`.
//
// O nome é `textoDaVoz`, e não `texto`, porque `texto` já é o texto da Frase em
// todo o código: um global com esse nome ficaria escondido dentro de quase toda
// função, e a chamada quebraria calada.
//
// Um ID que não está no catálogo, uma parte que não existe e um valor que falta
// param na hora com erro. A tela nunca fica com um texto vazio sem querer: só as
// entradas que são silêncio deliberado no catálogo devolvem "".

(function (raiz) {
  const NUMERO_PT_BR = new Intl.NumberFormat('pt-BR');
  const MODELO = /\{([^{}]+)\}/g;

  /**
   * O texto do catálogo, com os valores no lugar.
   *
   * @param {string} id     'MIN-08', ou 'PAI-12.titulo' para uma parte do estado.
   * @param {object} valores Os valores dos modelos. Número vira PT-BR ("1.284");
   *                         string entra como está.
   * @returns {string}
   */
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
    return modelo.replace(MODELO, (_, corpo) => {
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
    });
  }

  raiz.textoDaVoz = textoDaVoz;
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});

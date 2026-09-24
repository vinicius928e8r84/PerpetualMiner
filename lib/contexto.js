'use strict';

// O Contexto de uma frase como a tela o diz: o nome da Fonte (PAI-29) e o dia em
// que ela foi minerada (PAI-11). O Painel e o popup escrevem o Contexto com estas
// mesmas funções, para uma frase nunca aparecer com dois nomes.
//
// Carregado depois do catálogo da Voz (lib/voz/): `PerpetualMiner.Contexto`.

(function (raiz) {
  // As Fontes que o catálogo nomeia (PAI-29). Os nomes antigos gravados em
  // frases de antes apontam para o nome de hoje.
  const APELIDOS_DE_FONTE = { amazon: 'primevideo', hbomax: 'max', disney: 'disneyplus', star: 'starplus' };

  /** A Fonte como o catálogo a chama: um nome antigo gravado vira o de hoje. */
  function chaveDaFonte(fonte) {
    return APELIDOS_DE_FONTE[fonte] || fonte;
  }

  /**
   * A Fonte da frase: a do Contexto, senão a gravada em `streaming`. O selo e o
   * filtro de Fonte leem daqui, para o filtro achar a Fonte que o selo mostra.
   */
  function fonteDaFrase(f) {
    return chaveDaFonte(f.contexto?.fonte || f.streaming || '');
  }

  /** O nome da Fonte (PAI-29). Uma Fonte fora do catálogo sai com o nome gravado. */
  function nomeDaFonte(fonte) {
    const chave = chaveDaFonte(fonte);
    return Object.hasOwn(raiz.CATALOGO_DA_VOZ['PAI-29'], chave) ? raiz.textoDaVoz(`PAI-29.${chave}`) : fonte;
  }

  /** O dia da frase (PAI-11), da data gravada `dd/mm/aaaa`: hoje · ontem · há 3 dias. */
  function rotuloDoDia(dataStr) {
    const partes = String(dataStr || '').split('/');
    if (partes.length !== 3) return dataStr || '';
    const dia  = new Date(Number(partes[2]), Number(partes[1]) - 1, Number(partes[0]));
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const dias = Math.round((hoje - dia) / 86400000);
    if (Number.isNaN(dias) || dias < 0) return dataStr;
    if (dias === 0) return raiz.textoDaVoz('PAI-11.hoje');
    if (dias === 1) return raiz.textoDaVoz('PAI-11.ontem');
    return raiz.textoDaVoz('PAI-11.diasAtras', { n: dias });
  }

  raiz.Contexto = { chaveDaFonte, fonteDaFrase, nomeDaFonte, rotuloDoDia };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});

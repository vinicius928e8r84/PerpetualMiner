'use strict';

(function (raiz) {
  const { IDIOMAS } = raiz;
  const { fonteDaFrase } = raiz.Contexto;

  const TODOS = 'all';
  const STATUS_ENVIADA_AO_ANKI = 'exported';

  const foiEnviadaAoAnki = frase => frase.status === STATUS_ENVIADA_AO_ANKI;
  const foiExportadaNoTxt = frase => Boolean(frase.exportadaTxt);
  const idiomaDaFrase = frase => frase.idioma || IDIOMAS.INGLES;
  const minusculas = texto => String(texto || '').toLocaleLowerCase();

  const daFonte = fonte => frase => fonteDaFrase(frase) === fonte;
  const doIdioma = idioma => frase => idiomaDaFrase(frase) === idioma;
  const aindaNaoEnviadaNemExportada = frase => !foiEnviadaAoAnki(frase) && !foiExportadaNoTxt(frase);
  const mencionaOTermo = termo => frase => minusculas(frase.texto).includes(termo) || minusculas(frase.contexto?.titulo).includes(termo);

  const maisNovaPrimeiro = (a, b) => (b.id || 0) - (a.id || 0);
  const maisAntigaPrimeiro = (a, b) => (a.id || 0) - (b.id || 0);

  function condicoesLigadas({ fonte, idioma, esconderEnviadasEExportadas, busca }) {
    const termo = minusculas(String(busca || '').trim());
    return [
      fonte !== TODOS && daFonte(fonte),
      idioma !== TODOS && doIdioma(idioma),
      esconderEnviadasEExportadas && aindaNaoEnviadaNemExportada,
      termo && mencionaOTermo(termo),
    ].filter(Boolean);
  }

  function filtrar(frases, filtros) {
    const condicoes = condicoesLigadas(filtros);
    const ordem = filtros.ordem === 'antigas' ? maisAntigaPrimeiro : maisNovaPrimeiro;
    return frases.filter(frase => condicoes.every(vale => vale(frase))).sort(ordem);
  }

  raiz.FiltroDasFrases = Object.freeze({ filtrar, foiEnviadaAoAnki, STATUS_ENVIADA_AO_ANKI });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});

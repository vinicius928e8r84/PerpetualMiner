'use strict';

(function (raiz) {
  const { IDIOMAS } = raiz;
  const { fonteDaFrase } = raiz.Contexto;

  const TODOS = 'all';
  const ORDEM_DAS_MAIS_ANTIGAS = 'antigas';
  const STATUS_ENVIADA_AO_ANKI = 'exported';

  const foiEnviadaAoAnki = frase => frase.status === STATUS_ENVIADA_AO_ANKI;
  const idiomaDaFrase = frase => frase.idioma || IDIOMAS.INGLES;
  const textoEmMinusculas = valor => String(valor || '').toLocaleLowerCase();

  const ehDaFonte = fonte => frase => fonteDaFrase(frase) === fonte;
  const ehDoIdioma = idioma => frase => idiomaDaFrase(frase) === idioma;
  const naoFoiEnviadaAoAnki = frase => !foiEnviadaAoAnki(frase);
  const citaOTermo = termo => frase =>
    textoEmMinusculas(frase.texto).includes(termo) || textoEmMinusculas(frase.contexto?.titulo).includes(termo);

  const idDaFrase = frase => frase.id || 0;
  const maisNovaPrimeiro = (a, b) => idDaFrase(b) - idDaFrase(a);
  const maisAntigaPrimeiro = (a, b) => idDaFrase(a) - idDaFrase(b);

  function condicoesDosFiltros({ fonte, idioma, esconderEnviadas, busca }) {
    const termo = textoEmMinusculas(String(busca).trim());
    return [
      fonte !== TODOS && ehDaFonte(fonte),
      idioma !== TODOS && ehDoIdioma(idioma),
      esconderEnviadas && naoFoiEnviadaAoAnki,
      termo && citaOTermo(termo),
    ].filter(Boolean);
  }

  function filtrarFrases(frases, filtros) {
    const condicoes = condicoesDosFiltros(filtros);
    const ordem = filtros.ordem === ORDEM_DAS_MAIS_ANTIGAS ? maisAntigaPrimeiro : maisNovaPrimeiro;
    return frases.filter(frase => condicoes.every(condicao => condicao(frase))).sort(ordem);
  }

  raiz.FiltroDasFrases = { filtrarFrases, foiEnviadaAoAnki, STATUS_ENVIADA_AO_ANKI };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});

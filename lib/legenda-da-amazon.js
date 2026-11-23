'use strict';

(function (raiz) {
  const SELETORES_DIRETOS = ['.atvwebplayersdk-captions-text span', '.atvwebplayersdk-subtitle-text-container'];
  const PLAYER_DA_AMAZON = '.dv-ui-web-player-container';
  const TEXTO_DE_INTERFACE = [
    'temporada', 'ep.', 'season', 'pular', 'skip', 'next', 'próximo',
    'prime video', 'termos', 'política', 'privacidade', 'cookies', 'mais', 'saiba', 'info',
    'detalhes', 'português', 'english', 'idioma', 'legenda', 'configurações', 'audio',
    'coreano', 'korean',
  ];
  const ESCRITA_ASIATICA = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/;
  const SO_NUMEROS_E_SEPARADORES = /^[ \d\s:/]+$/;
  const MAIOR_LEGENDA_PELO_SELETOR = 250;
  const MENOR_LEGENDA_PELA_POSICAO = 4;
  const MAIOR_LEGENDA_PELA_POSICAO = 200;

  const legenda = (texto, elementos) => ({ texto, elementos });

  const naoEhTempoNemNumero = texto => !SO_NUMEROS_E_SEPARADORES.test(texto);
  const temTamanhoDeLegendaDoSeletor = texto => texto.length < MAIOR_LEGENDA_PELO_SELETOR;
  const temTamanhoDeLegendaNaTela = texto => texto.length >= MENOR_LEGENDA_PELA_POSICAO && texto.length <= MAIOR_LEGENDA_PELA_POSICAO;

  function ehLegendaDoSeletorDireto(texto) {
    if (!texto) return false;
    return temTamanhoDeLegendaDoSeletor(texto) && naoEhTempoNemNumero(texto);
  }

  function ehTextoDeLegendaNaTela(texto) {
    if (!texto) return false;
    if (ESCRITA_ASIATICA.test(texto)) return false;
    return temTamanhoDeLegendaNaTela(texto) && naoEhTempoNemNumero(texto);
  }

  function ehTextoDeInterface(texto) {
    const minusculo = texto.toLowerCase();
    return TEXTO_DE_INTERFACE.some(parte => minusculo.includes(parte));
  }

  function faixaDaLegenda(retanguloDoVideo) {
    return {
      abaixoDe: retanguloDoVideo.top + retanguloDoVideo.height * 0.5,
      aDireitaDe: retanguloDoVideo.left + retanguloDoVideo.width * 0.25,
    };
  }

  function estaNaFaixaDaLegenda(elemento, faixa) {
    const retangulo = elemento.getBoundingClientRect();
    return retangulo.top >= faixa.abaixoDe && retangulo.left >= faixa.aDireitaDe;
  }

  const estaDentroDoPlayer = elemento => Boolean(elemento.closest(PLAYER_DA_AMAZON));

  function ehLegendaNaFaixa(elemento, texto, faixa) {
    if (!ehTextoDeLegendaNaTela(texto)) return false;
    if (!estaNaFaixaDaLegenda(elemento, faixa)) return false;
    return !ehTextoDeInterface(texto) && !estaDentroDoPlayer(elemento);
  }

  function lerPelosSeletoresDiretos() {
    for (const seletor of SELETORES_DIRETOS) {
      const elementos = Array.from(document.querySelectorAll(seletor));
      const texto = elementos.map(elemento => elemento.innerText).join(' ').trim();
      if (ehLegendaDoSeletorDireto(texto)) return legenda(texto, elementos);
    }
    return null;
  }

  function lerPelaPosicaoNaTela() {
    const video = document.querySelector('video');
    if (!video) return null;
    const faixa = faixaDaLegenda(video.getBoundingClientRect());
    let ultima = null;
    for (const elemento of document.querySelectorAll('span, div')) {
      const texto = elemento.innerText?.trim();
      if (ehLegendaNaFaixa(elemento, texto, faixa)) ultima = legenda(texto, [elemento]);
    }
    return ultima;
  }

  function ler() {
    return lerPelosSeletoresDiretos() || lerPelaPosicaoNaTela();
  }

  raiz.LegendaDaAmazon = Object.freeze({ ler });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});

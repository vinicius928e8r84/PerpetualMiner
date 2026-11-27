'use strict';

(function (raiz) {
  const FONTE_IMPORTADO = 'importado';
  const CONTEXTO_NO_FIM = /\s*\[Contexto:\s*(.*)\]\s*$/;
  const ESTA_VAZIO = /^Desconhecido$/i;

  const valorOuVazio = parte => (parte && !ESTA_VAZIO.test(parte) ? parte : '');

  function lerContextoDoTxt(texto) {
    const partes = texto.split(' - ').map(parte => parte.trim());
    if (partes.length <= 3) return { fonte: valorOuVazio(partes[0]), titulo: valorOuVazio(partes[1]), detalhe: valorOuVazio(partes[2]) };
    return { fonte: valorOuVazio(partes[0]), titulo: valorOuVazio(partes.slice(1, -1).join(' - ')), detalhe: valorOuVazio(partes.at(-1)) };
  }

  function tirarOContexto(linha) {
    const resto = linha.trim();
    const achado = resto.match(CONTEXTO_NO_FIM);
    if (!achado) return { resto, contexto: null, tinhaContexto: false };
    return { resto: resto.slice(0, achado.index).trim(), contexto: lerContextoDoTxt(achado[1]), tinhaContexto: true };
  }

  const semPalavras = { palavras: [] };

  function separarAsPalavras(resto, tinhaContexto) {
    if (resto === ':' || resto.startsWith(': ')) return { texto: resto.slice(1).trim(), ...semPalavras };
    const separador = `${resto} `.indexOf(' : ');
    if (separador < 0) return { texto: resto, palavras: null };
    const prefixo = resto.slice(0, separador).trim();
    const depois = resto.slice(separador + 3).trim();
    if (tinhaContexto && !depois) return { texto: '', palavras: null };
    const achadas = raiz.Mineracao.palavrasNoTexto(prefixo, depois);
    return achadas ? { texto: depois, palavras: achadas } : { texto: resto, palavras: null };
  }

  const contextoDaFrase = contexto => ({ fonte: contexto?.fonte || FONTE_IMPORTADO, titulo: contexto?.titulo || '', detalhe: contexto?.detalhe || '' });

  const diziaAsPalavras = (palavras, tinhaContexto) => Boolean(tinhaContexto || palavras);

  function montarAFrase({ texto, palavras }, contexto, tinhaContexto) {
    if (!texto) return null;
    return { texto, contexto: contextoDaFrase(contexto), ...(diziaAsPalavras(palavras, tinhaContexto) ? { palavras: palavras || [] } : {}) };
  }

  function ler(linha) {
    const { resto, contexto, tinhaContexto } = tirarOContexto(linha);
    return montarAFrase(separarAsPalavras(resto, tinhaContexto), contexto, tinhaContexto);
  }

  const NAO_E_VALOR = ['', 'undefined', 'null'];

  const sanitizarCampo = valor => {
    const texto = String(valor ?? '').trim();
    return NAO_E_VALOR.includes(texto) ? 'Desconhecido' : texto;
  };

  function contextoDaLinha(frase) {
    const fonte = sanitizarCampo(frase.contexto?.fonte || frase.streaming);
    return `[Contexto: ${fonte} - ${sanitizarCampo(frase.contexto?.titulo)} - ${sanitizarCampo(frase.contexto?.detalhe)}]`;
  }

  const textoDaFrase = frase => frase.texto.replace(/\s+/g, ' ').trim();

  function palavrasEscritas(marcadas) {
    if (!marcadas?.length) return '';
    return marcadas.map(item => (item === '|' ? '|' : item.replace(/@\d+$/, ''))).join(' ')
      .replace(/\s+\|\s+/g, ' | ').replace(/\s*\|\s*$/, '').trim();
  }

  function escreverParaOAnki(frase, marcadas) {
    const palavras = palavrasEscritas(marcadas);
    return `${palavras ? `${palavras} : ` : ''}${textoDaFrase(frase)} ${contextoDaLinha(frase)}`;
  }

  raiz.TxtDeFrases = Object.freeze({ ler, escreverParaOAnki });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});

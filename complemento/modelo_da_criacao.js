(function () {
  var CHAVE = 'perpetualminer_escrita';
  var MENSAGEM = 'perpetualminer:criacao:';

  var Persistence = (function () {
    try {
      window.sessionStorage.setItem(CHAVE + '_teste', '1');
      window.sessionStorage.removeItem(CHAVE + '_teste');
      return {
        ler: function (chave) { return window.sessionStorage.getItem(chave); },
        gravar: function (chave, valor) { window.sessionStorage.setItem(chave, valor); },
      };
    } catch (erro) {
      var guardado = (window.PerpetualMinerPersistence = window.PerpetualMinerPersistence || {});
      return {
        ler: function (chave) { return chave in guardado ? guardado[chave] : null; },
        gravar: function (chave, valor) { guardado[chave] = valor; },
      };
    }
  })();

  function normalizar(texto) {
    return String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function palavras(texto) {
    return normalizar(texto).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  }

  function radical(palavra) {
    if (!/^[a-z]+$/.test(palavra) || palavra.length < 4) return palavra;
    var raiz = /(ies|ied)$/.test(palavra) ? palavra.replace(/(ies|ied)$/, 'y') : palavra.replace(/(ing|ed|es|s)$/, '');
    if (raiz.length < 3) raiz = palavra;
    raiz = raiz.replace(/([^aeiouy])\1$/, '$1');
    return raiz.length > 3 ? raiz.replace(/[ey]$/, '') : raiz;
  }

  function usouAPalavra(frase, palavra, raiz) {
    var escritas = palavras(frase);
    var radicalDado = normalizar(raiz).replace(/[^\p{L}\p{N}]/gu, '');
    if (radicalDado.length >= 2 && escritas.some(function (escrita) { return escrita.indexOf(radicalDado) !== -1; })) return true;
    var procuradas = palavras(String(palavra || '').split(/\s+[\u2013\u2014-]\s+\//)[0]);
    if (!procuradas.length) return false;
    var radicais = escritas.map(radical);
    return procuradas.every(function (procurada) {
      return escritas.indexOf(procurada) !== -1 || radicais.indexOf(radical(procurada)) !== -1;
    });
  }

  function texto(id) {
    var no = document.getElementById(id);
    return no ? no.textContent : '';
  }

  function naFrente(campo) {
    var enviado = null;
    function enviar() {
      if (enviado === campo.value) return;
      enviado = campo.value;
      if (typeof pycmd === 'function') pycmd(MENSAGEM + campo.value);
    }
    var espera = null;
    Persistence.gravar(CHAVE, '');
    campo.addEventListener('input', function () {
      Persistence.gravar(CHAVE, campo.value);
      clearTimeout(espera);
      espera = setTimeout(enviar, 300);
    });
    campo.addEventListener('blur', enviar);
    campo.addEventListener('change', enviar);
  }

  function noVerso(lugar) {
    var escrita = Persistence.ler(CHAVE) || texto('perpetualminer-gravada');
    if (!escrita.trim()) return;
    lugar.textContent = escrita;
    document.getElementById('perpetualminer-escreveu').hidden = false;
    document.getElementById('perpetualminer-usou').hidden = !usouAPalavra(escrita, texto('perpetualminer-palavra'), texto('perpetualminer-raiz'));
  }

  function iniciar() {
    var campo = document.getElementById('perpetualminer-escrita');
    if (campo) return naFrente(campo);
    var lugar = document.getElementById('perpetualminer-texto');
    if (lugar) noVerso(lugar);
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { usouAPalavra: usouAPalavra, radical: radical, iniciar: iniciar };
  else iniciar();
})();

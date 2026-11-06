// O script do modelo de Cartão da frente Criação (#168). `tipo_de_nota.py` o põe dentro do modelo, na frente e no verso; roda dentro do Anki (e do
// AnkiMobile e do AnkiDroid), sem a extensão e sem IA. Na frente, guarda o que a pessoa escreve (padrão “Anki Persistence”: o texto passa da frente
// para o verso pelo que a página guarda) e, só no Anki do computador, manda a frase à Conexão (`pycmd`), que a grava no campo “Frase escrita”.
// No verso, mostra o que foi escrito e confere, no próprio Cartão, se a Palavra (ou o radical dela) está na frase.
(function () {
  var CHAVE = 'perpetualminer_escrita';
  var MENSAGEM = 'perpetualminer:criacao:';

  // “Anki Persistence”: o que a página guarda de uma tela para a outra. O sessionStorage quando há; senão, um objeto da janela.
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

  // Minúsculas, sem acento nem sinal de tônica (o russo escreve ё e é): os dois lados da conta passam por aqui.
  function normalizar(texto) {
    return String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function palavras(texto) {
    return normalizar(texto).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  }

  // O radical de uma palavra do inglês: sem -ing, -ed, -es, -s, o -e ou -y do fim e a consoante dobrada (running, run). Uma palavra de outro alfabeto fica como é.
  function radical(palavra) {
    if (!/^[a-z]+$/.test(palavra) || palavra.length < 4) return palavra;
    var raiz = /(ies|ied)$/.test(palavra) ? palavra.replace(/(ies|ied)$/, 'y') : palavra.replace(/(ing|ed|es|s)$/, '');
    if (raiz.length < 3) raiz = palavra;
    raiz = raiz.replace(/([^aeiouy])\1$/, '$1');
    return raiz.length > 3 ? raiz.replace(/[ey]$/, '') : raiz;
  }

  // “✓ usou a palavra”: a frase tem a Palavra (todas as palavras dela) ou o radical. Com `raiz` (os campos da morfologia do russo), vale uma palavra da frase que a contenha.
  function usouAPalavra(frase, palavra, raiz) {
    var escritas = palavras(frase);
    var radicalDado = normalizar(raiz).replace(/[^\p{L}\p{N}]/gu, '');
    if (radicalDado.length >= 2 && escritas.some(function (escrita) { return escrita.indexOf(radicalDado) !== -1; })) return true;
    var procuradas = palavras(palavra);
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
      if (typeof pycmd === 'function') pycmd(MENSAGEM + campo.value); // só o Anki do computador tem pycmd; nos outros, o verso lê o que a página guardou
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
    var escrita = Persistence.ler(CHAVE) || texto('perpetualminer-gravada'); // sem o que a página guardou (outra tela), o campo gravado pela Conexão
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

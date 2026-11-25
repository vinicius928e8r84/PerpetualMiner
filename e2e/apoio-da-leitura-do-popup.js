'use strict';

function interceptarALeituraDe({ chave, mensagemDoErro }) {
  const ler = chrome.storage.local.get.bind(chrome.storage.local);
  const ehObjeto = valor => Boolean(valor) && typeof valor === 'object';
  const pedeAChave = chaves => ehObjeto(chaves) && chave in chaves;
  globalThis.lerDeVerdade = ler;
  chrome.storage.local.get = (chaves, callback) => {
    if (!pedeAChave(chaves)) return ler(chaves, callback);
    if (mensagemDoErro) throw new Error(mensagemDoErro);
    globalThis.soltarLeitura = () => ler(chaves, callback);
    return undefined;
  };
}

const segurarALeituraDaPagina = (page, chave) => page.addInitScript(interceptarALeituraDe, { chave });

const segurarALeituraDoServiceWorker = (extensao, chave) => extensao.serviceWorker.evaluate(interceptarALeituraDe, { chave });

const quebrarALeituraDoServiceWorker = (extensao, chave, mensagemDoErro) => extensao.serviceWorker.evaluate(interceptarALeituraDe, { chave, mensagemDoErro });

function controlesSemNomeNaPagina() {
  const nomeProprio = no => no.getAttribute('aria-label') || no.textContent.trim();
  const nomeDosRotulos = no => [...(no.labels || [])].map(l => l.textContent.trim()).join('');
  return [...document.querySelectorAll('button, input, textarea, a[href]')]
    .filter(no => !(nomeProprio(no) || nomeDosRotulos(no)))
    .map(no => no.outerHTML);
}

const controlesSemNome = page => page.evaluate(controlesSemNomeNaPagina);

module.exports = { segurarALeituraDaPagina, segurarALeituraDoServiceWorker, quebrarALeituraDoServiceWorker, controlesSemNome };

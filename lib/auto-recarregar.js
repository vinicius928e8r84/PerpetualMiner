'use strict';

(function (raiz) {
  const ALARME = 'pm-auto-recarregar';
  const CHAVE_DO_HASH = 'pm_auto_recarregar_hash';
  const PERIODO_EM_MINUTOS = 1;
  const ESPERA_PARA_CONFIRMAR_MS = 4000;

  async function lerBytes(caminho) {
    const resposta = await fetch(chrome.runtime.getURL(caminho), { cache: 'no-store' });
    if (!resposta.ok) throw new Error(`${caminho}: ${resposta.status}`);
    return new Uint8Array(await resposta.arrayBuffer());
  }

  async function lerTexto(caminho) {
    return new TextDecoder().decode(await lerBytes(caminho));
  }

  async function calcularHash() {
    let hash = 0x811c9dc5;
    const misturarFnv1a = bytes => {
      for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
    };
    const codificador = new TextEncoder();
    for (const caminho of await PerpetualMiner.arquivosDaExtensao(lerTexto)) {
      misturarFnv1a(codificador.encode(`\0${caminho}\0`));
      misturarFnv1a(await lerBytes(caminho));
    }
    return hash.toString(16);
  }

  async function emModoDesenvolvimento() {
    const eu = await chrome.management.getSelf();
    return eu.installType === 'development';
  }

  async function verificar() {
    try {
      if (!(await emModoDesenvolvimento())) return;

      const hash = await calcularHash();
      const guardado = (await chrome.storage.session.get(CHAVE_DO_HASH))[CHAVE_DO_HASH];
      if (!guardado) {
        await chrome.storage.session.set({ [CHAVE_DO_HASH]: hash });
        return;
      }
      if (hash === guardado) return;

      await new Promise(resolver => setTimeout(resolver, ESPERA_PARA_CONFIRMAR_MS));
      if ((await calcularHash()) !== hash) return;
      chrome.runtime.reload();
    } catch (erro) {
      console.warn('PerpetualMiner: verificação de atualização adiada', erro);
    }
  }

  async function comecarNoModoDesenvolvimento() {
    try {
      if (!(await emModoDesenvolvimento())) return;
      if (!(await chrome.alarms.get(ALARME))) {
        await chrome.alarms.create(ALARME, { delayInMinutes: PERIODO_EM_MINUTOS, periodInMinutes: PERIODO_EM_MINUTOS });
      }
      verificar();
    } catch (erro) {
      console.warn('PerpetualMiner: atualização automática indisponível', erro);
    }
  }

  function oNavegadorDaOGetSelfEOsAlarmes() {
    return typeof chrome !== 'undefined' && Boolean(chrome.management?.getSelf) && Boolean(chrome.alarms);
  }

  function iniciar() {
    if (!oNavegadorDaOGetSelfEOsAlarmes()) return;
    chrome.alarms.onAlarm.addListener(alarme => {
      if (alarme.name === ALARME) verificar();
    });
    comecarNoModoDesenvolvimento();
  }

  raiz.AutoRecarregar = { iniciar };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});

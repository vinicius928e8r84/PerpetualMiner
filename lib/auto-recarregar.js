'use strict';

// A extensão carregada de uma pasta (modo desenvolvimento) se recarrega quando
// os arquivos da pasta mudam, para que um `git pull` na pasta baste para
// atualizar o Chrome/Opera. Na instalação da loja (`installType` "normal") nada
// disso roda: quem atualiza é o navegador.
//
// A cada minuto um alarme lê os arquivos que `PerpetualMiner.arquivosDaExtensao`
// lista (só a própria pasta, sem rede externa) e resume tudo num hash. O hash da primeira leitura fica em
// `storage.session`, que sobrevive ao service worker dormir e some quando a
// extensão recarrega ou o navegador fecha. Se o hash mudou, a leitura se repete
// alguns segundos depois: um `git pull` grava vários arquivos e recarregar no
// meio dele carregaria uma pasta pela metade.

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

  // FNV-1a de 32 bits sobre o caminho e os bytes de cada arquivo: basta para
  // notar uma mudança, não precisa resistir a ninguém.
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
      if ((await calcularHash()) !== hash) return; // ainda gravando: a próxima leitura decide
      chrome.runtime.reload();
    } catch (erro) {
      // Um arquivo sumido no meio de um `git pull`, ou qualquer falha de leitura:
      // não recarrega, a próxima leitura tenta de novo.
      console.warn('PerpetualMiner: verificação de atualização adiada', erro);
    }
  }

  // O alarme pode sumir quando o navegador reinicia, então cada despertar do
  // service worker garante que ele existe; a primeira leitura já fixa o hash.
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

  /** Chamada pelo service worker a cada despertar, no topo do arquivo. */
  function iniciar() {
    // Sem `chrome.management` (os testes Node, o Firefox) não há o que fazer.
    if (typeof chrome === 'undefined' || !chrome.management?.getSelf || !chrome.alarms) return;
    chrome.alarms.onAlarm.addListener(alarme => {
      if (alarme.name === ALARME) verificar();
    });
    comecarNoModoDesenvolvimento();
  }

  raiz.AutoRecarregar = { iniciar };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});

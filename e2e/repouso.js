'use strict';

// O repouso (CODING_STANDARDS.md regra 8): um painel aberto e parado, sem nenhum clique, só lê. Passam os
// ciclos de saúde da Conexão com o Anki (15 s cada, o relógio do teste anda) e nada pode ter mudado: nenhum
// pedido que escreve na Conexão, nenhum PATCH ao Firestore, o `chrome.storage.local` do perfil igual.
// Uma leitura passiva que escreve (a chave que pinga de um perfil para o outro a cada saúde, #204) fica
// vermelha no teste que a cria, não na terceira rodada de revisão.

const { expect } = require('@playwright/test');

/** Uma saúde da Conexão a cada 15 s (`INTERVALO` em lib/conexao-anki.js); um pouco mais para o tique cair dentro. */
const CICLO_MS = 16_000;
/** O que cada perfil deixa, depois da resposta, para a cadeia da leitura terminar (o relógio da página está parado). */
const ASSENTAR_MS = 300;
/**
 * Os pedidos à Conexão que só leem: todo GET e estes POST (o corpo vai só para dizer qual dono perguntar; a lista de
 * Baralhos responde igual ao GET, bridge/test_envio_api.py; o login do ChatGPT só lê o arquivo e a tentativa, sem a tranca
 * nem a rede, `estado()` em complemento/login_do_chatgpt.py). Um POST novo que só lê entra aqui; um que muda algo, não.
 */
const POST_QUE_SO_LE = new Set(['/ia/estado', '/ia/chatgpt/estado', '/abrir-com-o-computador/estado', '/anki/decks']);

const muda = r => r.metodo !== 'GET' && !POST_QUE_SO_LE.has(r.caminho);

/** Quanto a página espera, em tempo real, a resposta de um ciclo antes de andar o relógio de novo (a cadeia anterior ainda em voo pula o tique). */
const ESPERA_DA_RESPOSTA_MS = 6_000;
const TENTATIVAS_DO_CICLO = 4;

/** Um ciclo de saúde na tela: o relógio anda e a resposta `esperar` (o fim da cadeia que a saúde dispara) chega. */
async function umCiclo(page, esperar = '/health') {
  for (let tentativa = 0; tentativa < TENTATIVAS_DO_CICLO; tentativa++) {
    const lida = page.waitForResponse(r => new URL(r.url()).pathname.endsWith(esperar), { timeout: ESPERA_DA_RESPOSTA_MS });
    lida.catch(() => {});
    await page.clock.runFor(CICLO_MS);
    try {
      await (await lida).finished();
      return;
    } catch (erro) {
      if (tentativa === TENTATIVAS_DO_CICLO - 1) throw erro;
    }
  }
}

/**
 * Anda ciclos até o `chrome.storage.local` das telas parar de mudar de um ciclo para o outro: com dois perfis, a
 * tela aberta primeiro ainda vai ler o dono que o segundo deixou, e ler não é escrever em repouso. Uma leitura
 * que escreve a cada ciclo (a chave que pinga de um perfil para o outro) nunca assenta e o `emRepouso` seguinte
 * a pega.
 */
async function assentar(telas, { esperar = '/health' } = {}) {
  let anterior = null;
  for (let n = 0; n < 4; n++) {
    for (const tela of telas) await umCiclo(tela.page, esperar);
    for (const tela of telas) await tela.page.waitForTimeout(ASSENTAR_MS);
    const agora = JSON.stringify(await Promise.all(telas.map(t => t.extensao.lerStorage())));
    if (agora === anterior) return;
    anterior = agora;
  }
}

/**
 * Avança `ciclos` ciclos de saúde em `page` (e em cada tela de `tambem`) e confere o repouso.
 *
 * `page` e as telas de `tambem` já têm o relógio parado (a fixture `relogioParado`, e2e/relogio-parado.js) e a tela
 * aberta e assentada: com dois perfis, o teste chama `assentar` antes. `tambem` é a lista de `{ page, extensao }`
 * dos outros perfis da cena. `esperar` é a resposta que fecha um ciclo na tela (o fim da cadeia que a saúde dispara).
 */
async function emRepouso(page, { ciclos, fakes, extensao, tambem = [], esperar = '/health' }) {
  const telas = [{ page, extensao }, ...tambem];
  const guardado = async () => Promise.all(telas.map(t => t.extensao.lerStorage()));
  const antes = { storage: await guardado(), conexao: fakes.anki.requisicoes.length, nuvem: fakes.google.requisicoes.length };

  for (let n = 0; n < ciclos; n++) {
    for (const tela of telas) await umCiclo(tela.page, esperar);
  }
  for (const tela of telas) await tela.page.waitForTimeout(ASSENTAR_MS);

  const escritasNaConexao = fakes.anki.requisicoes.slice(antes.conexao).filter(muda).map(r => `${r.metodo} ${r.caminho}`);
  const patchesNaNuvem = fakes.google.requisicoes.slice(antes.nuvem).filter(r => r.metodo === 'PATCH').map(r => `${r.metodo} ${r.url}`);
  expect(escritasNaConexao, `pedidos que mudam algo na Conexão em ${ciclos} ciclos de repouso`).toEqual([]);
  expect(patchesNaNuvem, `escritas no Firestore em ${ciclos} ciclos de repouso`).toEqual([]);
  expect(await guardado(), `chrome.storage.local em ${ciclos} ciclos de repouso`).toEqual(antes.storage);
}

module.exports = { emRepouso, assentar, umCiclo };

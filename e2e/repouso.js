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
/** Os pedidos à Conexão que só leem: todo GET e estes POST (o corpo vai só para dizer qual dono perguntar). */
const POST_QUE_SO_LE = new Set(['/ia/estado', '/abrir-com-o-computador/estado']);

const muda = r => r.metodo !== 'GET' && !POST_QUE_SO_LE.has(r.caminho);

/** Um ciclo de saúde na tela: o relógio anda e a resposta `esperar` (o fim da cadeia que a saúde dispara) chega. */
async function umCiclo(page, esperar = '/health') {
  const lida = page.waitForResponse(r => new URL(r.url()).pathname.endsWith(esperar));
  await page.clock.runFor(CICLO_MS);
  await (await lida).finished();
}

/**
 * Avança `ciclos` ciclos de saúde em `page` (e em cada tela de `tambem`) e confere o repouso.
 *
 * `page` e as telas de `tambem` já têm o relógio instalado (`page.clock.install()` e `pauseAt`) e a tela
 * aberta e assentada: com dois perfis, a tela aberta primeiro ainda não leu o dono que o segundo deixou, o que
 * o teste faz com um `umCiclo` antes (ler o que o outro perfil deixou não é escrever em repouso). `tambem` é a lista de `{ page, extensao }` dos outros perfis da cena. `esperar` é a
 * resposta que fecha um ciclo na tela (o fim da cadeia que a saúde dispara).
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

module.exports = { emRepouso, umCiclo };

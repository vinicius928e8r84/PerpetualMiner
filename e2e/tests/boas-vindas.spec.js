'use strict';

// Passo 8 do redesign: a Boas-vindas (#42, docs/design/painel/boas-vindas/,
// variante C; item 8 da lista fechada).
//
// Instalar a extensão abre `painel.html#boas-vindas`: uma página sem sidebar,
// com a lista dos 8 itens à esquerda e um passo por vez no card. Os passos se
// marcam pelo estado real (a frase no histórico, o atalho gravado, a conta, a
// Conexão com o Anki, a mineração automática, a chave); “Agora não” fica gravado
// neste computador. O passo 1 tem a mineração rápida do popup, o 2 o gravador
// de Configurações › Atalhos; Tudo pronto resume cada passo e abre o painel.
//
// Os testes afirmam o que a pessoa vê e o que fica gravado, nunca funções
// internas. A exceção é a atualização da extensão, que o Chromium do Playwright
// não sabe fazer (recarregar uma extensão desempacotada a desliga): o teste
// chama o ouvinte do `onInstalled` como o Chrome chamaria, com `update`.

const { test, expect } = require('../fixtures');

const lista = page => page.getByRole('navigation', { name: 'Passos da configuração' });
const itemDaLista = (page, nome) => lista(page).getByRole('button', { name: new RegExp(`^${nome}`) });
const card = page => page.locator('.bv-card');
const tituloDoCard = page => card(page).getByRole('heading', { level: 2 });
const sobretitulo = page => card(page).locator('.bv-sobretitulo');
const botaoDoCard = (page, nome) => card(page).getByRole('button', { name: nome, exact: true });
const campoRapido = page => card(page).getByRole('textbox', { name: 'Cole ou escreva uma frase' });

async function abrirBoasVindas(page, extensao, passo = '') {
  await page.goto(extensao.url(`painel.html#boas-vindas${passo && `/${passo}`}`));
  await expect(tituloDoCard(page)).toBeVisible();
}

// ─── Na instalação ───────────────────────────────────────────────────────────

test.describe('na instalação', () => {
  test.use({ manterAbaDaInstalacao: true });

  test('instalar a extensão abre uma aba na Boas-vindas, sem a sidebar do painel', async ({ extensao }) => {
    const aba = extensao.abaDaInstalacao;
    expect(aba.url()).toBe(extensao.url('painel.html#boas-vindas'));

    await expect(tituloDoCard(aba)).toHaveText('Boas-vindas ao PerpetualMiner');
    await expect(aba.getByRole('navigation', { name: 'Navegação do painel' })).toBeHidden();
    await expect(lista(aba)).toBeVisible();
  });
});

test('atualizar a extensão não abre aba nenhuma', async ({ context, extensao }) => {
  const abasAntes = context.pages().length;

  // O Chrome chama o ouvinte do onInstalled com `update` depois de atualizar.
  await extensao.serviceWorker.evaluate(() => aoInstalar({ reason: 'update', previousVersion: '4.9' }));

  await new Promise(resolve => setTimeout(resolve, 500));
  expect(context.pages()).toHaveLength(abasAntes);
  const abas = await extensao.serviceWorker.evaluate(() => chrome.tabs.query({}));
  expect(abas.map(a => a.url).filter(url => url.includes('painel.html'))).toEqual([]);
});

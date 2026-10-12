'use strict';

// O repouso (e2e/repouso.js): o painel aberto e parado, sem clique, não escreve nada. Passam os ciclos de
// saúde de 15 s e a Conexão com o Anki, o Firestore e o `chrome.storage.local` seguem como estavam. O card da
// IA e o Conta & sync são as telas que consultam sozinhas; cada um roda com um perfil e com dois (A e B, duas
// contas Google, uma Conexão só). Só chaves fictícias.

const { test, expect } = require('../fixtures');
const { emRepouso, umCiclo } = require('../repouso');

const CHAVE_A = 'sk-fake-repouso-primeira-aaaa';
const CHAVE_B = 'sk-fake-repouso-segunda-bbbb';
const CICLOS = 4;

// Quatro ciclos esperam quatro respostas por tela, e a primeira sincronização pode demorar com a máquina carregada.
test.beforeEach(() => { test.slow(); });

/** O relógio da página anda só quando o teste manda; a tela abre nele e espera o chip da conta assentar. */
async function abrirComRelogio(page, extensao, secao) {
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 60_000));
  await page.goto(extensao.url(`painel.html#configuracoes/${secao}`));
  await expect(page.locator('#shell-chip')).toContainText('Sincronizado agora', { timeout: 15_000 });
}

const cardDaIA = page => page.locator('#cfg-ia');
const cardDaConta = page => page.locator('#cfg-conta');

test('card da IA com um perfil: parado, não escreve na Conexão nem no Firestore', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'A' });
  fakes.google.gravarChaveDaOpenAI('A', { chave: CHAVE_A, em: 100 });
  await abrirComRelogio(page, extensao, 'ia');
  await expect(cardDaIA(page).locator('.cfg-resumo')).toHaveText('••••••••aaaa');

  await emRepouso(page, { ciclos: CICLOS, fakes, extensao, esperar: '/ia/estado' });

  await expect(cardDaIA(page).locator('.cfg-resumo')).toHaveText('••••••••aaaa');
  expect((await extensao.lerStorage('pm_chave_openai')).pm_chave_openai.conta).toBe('A');
  expect(fakes.google.chaveDaOpenAIDe('A')?.chave).toBe(CHAVE_A);
});

for (const bComChave of [false, true]) {
  test(`card da IA com dois perfis${bComChave ? ' (B tem chave)' : ''}: parados, A e B só leem o dono`, async ({ page, extensao, fakes, segundoPerfil }) => {
    await extensao.semearSessao({ uid: 'A' });
    fakes.google.gravarChaveDaOpenAI('A', { chave: CHAVE_A, em: 100 });
    if (bComChave) fakes.google.gravarChaveDaOpenAI('B', { chave: CHAVE_B, em: 101 });
    await abrirComRelogio(page, extensao, 'ia');
    await segundoPerfil.extensao.semearSessao({ uid: 'B', displayName: 'Pessoa B' });
    const b = await segundoPerfil.context.newPage();
    await abrirComRelogio(b, segundoPerfil.extensao, 'ia');
    const resumoFinal = bComChave ? '••••••••bbbb' : 'Sem chave';
    await umCiclo(page, '/ia/estado'); // A lê o dono que B deixou na Conexão ao abrir; só depois vem o repouso
    await expect(cardDaIA(b).locator('.cfg-resumo')).toHaveText(resumoFinal);

    await emRepouso(page, { ciclos: CICLOS, fakes, extensao, esperar: '/ia/estado', tambem: [{ page: b, extensao: segundoPerfil.extensao }] });

    await expect(cardDaIA(page).locator('.cfg-resumo')).toHaveText(resumoFinal);
    expect((await segundoPerfil.extensao.lerStorage('pm_chave_openai')).pm_chave_openai.conta).toBe('B');
    expect(fakes.google.chaveDaOpenAIDe('A')?.chave).toBe(CHAVE_A);
    if (bComChave) expect(fakes.google.chaveDaOpenAIDe('B')?.chave).toBe(CHAVE_B);
    else expect(fakes.google.chaveDaOpenAIDe('B')).toBeNull();
  });
}

test('Conta & sync com um perfil: parado, não escreve na Conexão nem no Firestore', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'A' });
  fakes.google.gravarChaveDaOpenAI('A', { chave: CHAVE_A, em: 100 });
  await abrirComRelogio(page, extensao, 'conta');
  await expect(cardDaConta(page)).toContainText('Sincronizado');

  await emRepouso(page, { ciclos: CICLOS, fakes, extensao });

  await expect(cardDaConta(page)).toContainText('Sincronizado');
  expect((await extensao.lerStorage('pm_user_info')).pm_user_info.uid).toBe('A');
  expect(fakes.google.chaveDaOpenAIDe('A')?.chave).toBe(CHAVE_A);
});

test('Conta & sync com dois perfis: parados, A e B não escrevem um no outro', async ({ page, extensao, fakes, segundoPerfil }) => {
  await extensao.semearSessao({ uid: 'A' });
  fakes.google.gravarChaveDaOpenAI('A', { chave: CHAVE_A, em: 100 });
  fakes.google.gravarChaveDaOpenAI('B', { chave: CHAVE_B, em: 101 });
  await abrirComRelogio(page, extensao, 'conta');
  await segundoPerfil.extensao.semearSessao({ uid: 'B', displayName: 'Pessoa B' });
  const b = await segundoPerfil.context.newPage();
  await abrirComRelogio(b, segundoPerfil.extensao, 'conta');
  await expect(cardDaConta(b)).toContainText('Sincronizado');
  await umCiclo(page); // A lê o dono que B deixou na Conexão ao abrir; só depois vem o repouso

  await emRepouso(page, { ciclos: CICLOS, fakes, extensao, tambem: [{ page: b, extensao: segundoPerfil.extensao }] });

  await expect(cardDaConta(page)).toContainText('Sincronizado');
  expect((await extensao.lerStorage('pm_user_info')).pm_user_info.uid).toBe('A');
  expect((await segundoPerfil.extensao.lerStorage('pm_user_info')).pm_user_info.uid).toBe('B');
  expect(fakes.google.chaveDaOpenAIDe('A')?.chave).toBe(CHAVE_A);
  expect(fakes.google.chaveDaOpenAIDe('B')?.chave).toBe(CHAVE_B);
});

// O próprio helper: um repouso que escreve precisa ficar vermelho, em cada um dos três lugares.
const escreveNoCiclo = {
  'um pedido que muda algo na Conexão': () => fetch('http://127.0.0.1:8766/ia/openai/sincronizar', { method: 'POST', body: '{}' }),
  'uma escrita no Firestore': () => fetch('https://firestore.googleapis.com/v1/projects/perpetualminer-4c219/databases/(default)/documents/usuarios/A/segredos/openai', { method: 'PATCH', body: '{"fields":{}}' }),
  'uma gravação no chrome.storage.local': () => chrome.storage.local.set({ pm_escrita_em_repouso: true }),
};
for (const [descricao, escrita] of Object.entries(escreveNoCiclo)) {
  test(`emRepouso falha quando o painel parado faz ${descricao}`, async ({ page, extensao, fakes }) => {
    await extensao.semearSessao({ uid: 'A' });
    await abrirComRelogio(page, extensao, 'ia');
    await page.evaluate(`setTimeout(${escrita.toString()}, 5000)`);

    await expect(emRepouso(page, { ciclos: 1, fakes, extensao })).rejects.toThrow(/em 1 ciclos de repouso/);
    // Exceção de teste: sem-estado-guardado — o teste prova que o helper recusa; o que ele grava de propósito não é estado do produto
  });
}

'use strict';

const { test, expect } = require('../fixtures');
const { emRepouso, assentar } = require('../repouso');
const {
  CHAVE_A, CHAVE_B, CICLOS, cardDaIA, cardDaConta, abrirComRelogio, semearDonoA, abrirOSegundoPerfil,
} = require('../apoio-do-repouso');

test.beforeEach(() => { test.slow(); });

test('card da IA com um perfil: parado, não escreve na Conexão nem no Firestore', async ({ page, extensao, fakes, relogioParado }) => {
  await semearDonoA(extensao, fakes);
  await abrirComRelogio(relogioParado, page, extensao, 'ia');
  await expect(cardDaIA(page).locator('.cfg-resumo')).toHaveText('••••••••aaaa');

  await emRepouso(page, { ciclos: CICLOS, fakes, extensao, esperar: '/ia/estado' });

  await expect(cardDaIA(page).locator('.cfg-resumo')).toHaveText('••••••••aaaa');
  expect((await extensao.lerStorage('pm_chave_openai')).pm_chave_openai.conta).toBe('A');
  expect(fakes.google.chaveDaOpenAIDe('A')?.chave).toBe(CHAVE_A);
});

test('card da IA com o ChatGPT conectado: parado, só relê o login e não escreve na Conexão', async ({ page, extensao, fakes, relogioParado }) => {
  await extensao.semearSessao({ uid: 'A' });
  await extensao.gravarStorage({ pm_plano_do_chatgpt_avisado: true });
  fakes.anki.chatgpt.definir('conectada');
  await abrirComRelogio(relogioParado, page, extensao, 'ia');
  await expect(cardDaIA(page)).toContainText('Usando o plano do ChatGPT');

  await emRepouso(page, { ciclos: CICLOS, fakes, extensao, esperar: '/ia/chatgpt/estado' });

  await expect(cardDaIA(page)).toContainText('Usando o plano do ChatGPT');
  expect(fakes.anki.chatgpt.situacao()).toBe('conectada');
});

for (const bComChave of [false, true]) {
  test(`card da IA com dois perfis${bComChave ? ' (B tem chave)' : ''}: parados, A e B só leem o dono`, async ({ page, extensao, fakes, segundoPerfil, relogioParado }) => {
    await semearDonoA(extensao, fakes);
    if (bComChave) fakes.google.gravarChaveDaOpenAI('B', { chave: CHAVE_B, em: 101 });
    await abrirComRelogio(relogioParado, page, extensao, 'ia');
    const telaB = await abrirOSegundoPerfil(relogioParado, segundoPerfil, 'ia');
    const resumoFinal = bComChave ? '••••••••bbbb' : 'Sem chave';
    await assentar([{ page, extensao }, telaB], { esperar: '/ia/estado' });
    await expect(cardDaIA(telaB.page).locator('.cfg-resumo')).toHaveText(resumoFinal);

    await emRepouso(page, { ciclos: CICLOS, fakes, extensao, esperar: '/ia/estado', tambem: [telaB] });

    await expect(cardDaIA(page).locator('.cfg-resumo')).toHaveText(resumoFinal);
    expect((await segundoPerfil.extensao.lerStorage('pm_chave_openai')).pm_chave_openai.conta).toBe('B');
    expect(fakes.google.chaveDaOpenAIDe('A')?.chave).toBe(CHAVE_A);
    if (bComChave) expect(fakes.google.chaveDaOpenAIDe('B')?.chave).toBe(CHAVE_B);
    else expect(fakes.google.chaveDaOpenAIDe('B')).toBeNull();
  });
}

test('Conta e sincronização com um perfil: parado, não escreve na Conexão nem no Firestore', async ({ page, extensao, fakes, relogioParado }) => {
  await semearDonoA(extensao, fakes);
  await abrirComRelogio(relogioParado, page, extensao, 'conta');
  await expect(cardDaConta(page)).toContainText('Sincronizado');

  await emRepouso(page, { ciclos: CICLOS, fakes, extensao });

  await expect(cardDaConta(page)).toContainText('Sincronizado');
  expect((await extensao.lerStorage('pm_user_info')).pm_user_info.uid).toBe('A');
  expect(fakes.google.chaveDaOpenAIDe('A')?.chave).toBe(CHAVE_A);
});

test('Conta e sincronização com dois perfis: parados, A e B não escrevem um no outro', async ({ page, extensao, fakes, segundoPerfil, relogioParado }) => {
  await semearDonoA(extensao, fakes);
  fakes.google.gravarChaveDaOpenAI('B', { chave: CHAVE_B, em: 101 });
  await abrirComRelogio(relogioParado, page, extensao, 'conta');
  const telaB = await abrirOSegundoPerfil(relogioParado, segundoPerfil, 'conta');
  await expect(cardDaConta(telaB.page)).toContainText('Sincronizado');
  await assentar([{ page, extensao }, telaB]);

  await emRepouso(page, { ciclos: CICLOS, fakes, extensao, tambem: [telaB] });

  await expect(cardDaConta(page)).toContainText('Sincronizado');
  expect((await extensao.lerStorage('pm_user_info')).pm_user_info.uid).toBe('A');
  expect((await segundoPerfil.extensao.lerStorage('pm_user_info')).pm_user_info.uid).toBe('B');
  expect(fakes.google.chaveDaOpenAIDe('A')?.chave).toBe(CHAVE_A);
  expect(fakes.google.chaveDaOpenAIDe('B')?.chave).toBe(CHAVE_B);
});

const escreveNoCiclo = {
  'um pedido que muda algo na Conexão': () => fetch('http://127.0.0.1:8766/ia/openai/sincronizar', { method: 'POST', body: '{}' }),
  'uma escrita no Firestore': () => fetch('https://firestore.googleapis.com/v1/projects/perpetualminer-4c219/databases/(default)/documents/usuarios/A/segredos/openai', { method: 'PATCH', body: '{"fields":{}}' }),
  'uma gravação no chrome.storage.local': () => chrome.storage.local.set({ pm_escrita_em_repouso: true }),
};
for (const [descricao, escrita] of Object.entries(escreveNoCiclo)) {
  test(`emRepouso falha quando o painel parado faz ${descricao}`, async ({ page, extensao, fakes, relogioParado }) => {
    await extensao.semearSessao({ uid: 'A' });
    await abrirComRelogio(relogioParado, page, extensao, 'ia');
    await page.evaluate(`setTimeout(${escrita.toString()}, 5000)`);

    await expect(emRepouso(page, { ciclos: 1, fakes, extensao })).rejects.toThrow(/em 1 ciclos de repouso/);
    // Exceção de teste: sem-estado-guardado
  });
}

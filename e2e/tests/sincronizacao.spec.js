'use strict';

// A sessão pelo que a pessoa faz: a mineração no popup e Sair da conta no
// painel. Só a rede do Google/Firestore é falsificada, pelo fixture.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('../fixtures');

async function guardarEvidencia(page, nome, estado) {
  if (!process.env.TEST_EVIDENCE_DIR) return;
  await page.screenshot({
    path: path.join(process.env.TEST_EVIDENCE_DIR, `${nome}.png`),
    fullPage: true,
    animations: 'disabled',
  });
  fs.writeFileSync(path.join(process.env.TEST_EVIDENCE_DIR, `${nome}.json`), JSON.stringify(estado, null, 2) + '\n');
}

async function minerarNoPopup(page, extensao, texto) {
  await page.setViewportSize({ width: 340, height: 600 });
  await page.goto(extensao.url('popup.html'));
  const campo = page.getByRole('textbox', { name: 'Cole ou escreva uma frase' });
  await campo.fill(texto);
  await campo.press('Enter');
  await expect(campo).toHaveValue('');
  await expect(page.locator('#ultimas li').first()).toContainText(texto);
}

test('sair durante uma renovação não restaura a conta; a próxima mineração fica só neste computador', async ({ page, extensao, fakes }) => {
  const uid = 'uid-saida';
  const guardada = {
    id: Date.now() - 60_000, texto: 'The ferry crossed the bay.',
    data: new Date().toLocaleDateString('pt-BR'), streaming: 'manual', idioma: 'Inglês',
  };
  await extensao.gravarStorage({ frases: [guardada] });
  await extensao.semearSessao({ uid, displayName: 'Ana Souza', expirada: true });

  let liberar, avisarInicio;
  const liberada = new Promise(resolve => { liberar = resolve; });
  const iniciada = new Promise(resolve => { avisarInicio = resolve; });
  await page.route(/securetoken\.googleapis\.com/, async route => {
    avisarInicio();
    await liberada;
    await route.fallback();
  });
  try {
    await page.goto(extensao.url('painel.html#configuracoes/conta'));
    await iniciada;
    await expect(page.locator('#shell-chip-estado')).toHaveText('Sincronizando…');
    await page.locator('#cfg-conta').getByRole('button', { name: 'Sair da conta' }).click();
    await expect(page.locator('#shell-chip-nome')).toHaveText('Sem conta');
    await expect(page.locator('#shell-chip-estado')).toHaveText('Só neste computador');
    await expect.poll(() => extensao.lerStorage(['pm_firebase_auth', 'pm_user_info'])).toEqual({});

    const respostaDaRenovacao = page.waitForResponse(resposta => resposta.url().includes('securetoken.googleapis.com'));
    liberar();
    await (await respostaDaRenovacao).finished();
    // A resposta já chegou: dá tempo para sua continuação e a escrita assíncrona
    // no chrome.storage. A ausência é conferida outra vez após minerar no popup.
    await page.waitForTimeout(300);
    expect(await extensao.lerStorage(['pm_firebase_auth', 'pm_user_info'])).toEqual({});
    expect(await extensao.lerSessao()).toBeNull();
    await expect(page.locator('#shell-total')).toHaveText('1');
    await expect(page.locator('#cfg-conta').getByRole('button', { name: 'Entrar com Google' })).toBeVisible();
    await guardarEvidencia(page, 'logout-renovacao-tardia', {
      conta: await page.locator('#shell-chip').innerText(),
      credenciaisGravadas: await extensao.lerStorage(['pm_firebase_auth', 'pm_user_info']),
      frasesLocais: await extensao.frases(),
      frasesNaNuvem: fakes.google.frasesDe(uid),
    });

    const nova = 'The lighthouse survived the storm.';
    await minerarNoPopup(page, extensao, nova);
    const frases = await extensao.frases();
    const minerada = frases.find(f => f.texto === nova);
    expect(minerada).toBeDefined();
    expect(frases).toHaveLength(2);
    expect(await extensao.lerStorage(['pm_firebase_auth', 'pm_user_info'])).toEqual({});
    expect(await extensao.lerSessao()).toBeNull();
    expect(fakes.google.frasesDe(uid)).toEqual([]);
    expect(fakes.google.requisicoes.filter(r => r.url.includes('firestore.googleapis.com'))).toEqual([]);
    await guardarEvidencia(page, 'logout-mineracao-local', {
      credenciaisGravadas: await extensao.lerStorage(['pm_firebase_auth', 'pm_user_info']),
      armazenamento: await extensao.lerStorage(['frases']),
      frasesNaNuvem: fakes.google.frasesDe(uid),
      requisicoes: fakes.google.requisicoes.map(r => ({ metodo: r.metodo, url: r.url.split('?')[0] })),
    });
  } finally {
    liberar();
  }
});

test('minerar com menos de dois minutos de sessão renova o token e preserva Contexto e Palavra na nuvem', async ({ page, extensao, fakes }) => {
  const uid = 'uid-renovacao';
  await extensao.semearSessao({ uid, displayName: 'Ana Souza' });
  const credenciais = await extensao.lerSessao();
  await extensao.gravarSessao({ ...credenciais, expiresAt: Date.now() + 90_000 });
  fakes.anki.definirVocabulario('en', ['quiet', 'harbor', 'woke']);

  const texto = 'The quiet harbor woke before the gulls did.';
  await minerarNoPopup(page, extensao, texto);
  await expect.poll(() => fakes.google.frasesDe(uid)).toEqual([
    expect.objectContaining({
      texto, idioma: 'Inglês', streaming: 'manual',
      contexto: { fonte: 'manual', titulo: '', detalhe: '' },
      keywords: [expect.stringMatching(/^gulls@/)], autoKeyword: true,
    }),
  ]);
  const renovadas = await extensao.lerSessao();
  expect(renovadas).toMatchObject({ uid, idToken: 'token-renovado', refreshToken: 'refresh-renovado' });
  expect(renovadas.expiresAt).toBeGreaterThan(Date.now() + 50 * 60_000);
  expect(fakes.google.frasesDe(uid)).toEqual(await extensao.frases());

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(extensao.url('painel.html#frases'));
  await expect(page.locator('#shell-chip-estado')).toHaveText('Sincronizado agora');
  await expect(page.locator('#frases-lista .veio-frase')).toContainText(texto);
  await expect(page.locator('#frases-lista .veio-chip-palavra')).toContainText('gulls');
  await guardarEvidencia(page, 'sessao-renovada-frase-sincronizada', {
    conta: await page.locator('#shell-chip').innerText(),
    tokenRenovado: renovadas.idToken === 'token-renovado',
    armazenamento: await extensao.lerStorage(['frases']),
    frasesNaNuvem: fakes.google.frasesDe(uid),
  });
});

test('a sessão que não renova mantém a frase minerada no computador, sem gravar fila de retry', async ({ page, extensao, fakes }) => {
  const uid = 'uid-expirada';
  await extensao.semearSessao({ uid, displayName: 'Ana Souza', expirada: true });
  fakes.google.expirarSessao();
  const texto = 'Every lantern along the pier flickered in the salt wind.';
  await minerarNoPopup(page, extensao, texto);
  await expect.poll(() => fakes.google.requisicoes.some(r => r.url.includes('securetoken.googleapis.com'))).toBe(true);
  const [frase] = await extensao.frases();
  expect(frase.texto).toBe(texto);
  expect(fakes.google.frasesDe(uid)).toEqual([]);
  expect(await extensao.lerStorage(['pm_pending_sync'])).toEqual({});

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(extensao.url('painel.html#configuracoes/conta'));
  await expect(page.locator('#shell-chip-estado')).toHaveText('Sessão expirou');
  await expect(page.locator('#shell-total')).toHaveText('1');
  await expect(page.locator('#cfg-conta').getByRole('button', { name: 'Entrar', exact: true })).toBeVisible();
  expect((await extensao.frases()).map(f => f.texto)).toEqual([texto]);
  expect(await extensao.lerStorage(['pm_pending_sync'])).toEqual({});
  await guardarEvidencia(page, 'sessao-expirada-frase-pendente', {
    conta: await page.locator('#shell-chip').innerText(),
    armazenamento: await extensao.lerStorage(['frases']),
    frasesNaNuvem: fakes.google.frasesDe(uid),
  });
});

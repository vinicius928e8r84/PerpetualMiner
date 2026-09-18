'use strict';

// Passo 2 do redesign: Configurações com os cards “resumo primeiro” e o card
// Conta & sync (#26, docs/design/painel/configuracoes/).
//
// #configuracoes mostra os quatro cards fechados, cada um numa linha com o
// resumo do estado, e eles abrem no lugar (vários ao mesmo tempo).
// #configuracoes/<seção> abre o card, rola até ele e pisca a borda. O card
// Conta & sync cobre os 10 estados de conta (CFG-01…10), e o chip da sidebar
// espelha o mesmo estado. Um problema de sync aparece só ali: no card e no chip.
//
// O login roda de verdade: a janela do chrome.identity abre a página de login do
// Google, que o fixture serve localmente (fakes/login-google.js); o teste escolhe
// se a pessoa entra, fecha a janela ou se a página não carrega.
//
// Os testes afirmam o que a pessoa vê e o que fica gravado, nunca funções internas.

const { test, expect } = require('../fixtures');

const HOJE = new Date().toLocaleDateString('pt-BR');

function frasesDeExemplo(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: 1_700_000_000_000 + (n - i),
    texto: `Sentence number ${n - i} about the harbour.`,
    data: HOJE,
    streaming: 'netflix',
    idioma: 'Inglês',
  }));
}

async function abrirPainel(page, extensao, endereco = '#configuracoes') {
  await page.goto(extensao.url(`painel.html${endereco}`));
  await expect(page.getByRole('navigation', { name: 'Navegação do painel' })).toBeVisible();
}

const card = (page, secao) => page.locator(`#cfg-${secao}`);
const cabecaDoCard = (page, nome) => page.getByRole('button', { name: nome, exact: true });
const resumo = (page, secao) => card(page, secao).locator('.cfg-resumo');
const conta = page => card(page, 'conta');
const chip = page => page.locator('#shell-chip');
const estadoDoChip = page => page.locator('#shell-chip-estado');

/** Abre o card Conta & sync, se estiver fechado. */
async function abrirConta(page) {
  const cabeca = cabecaDoCard(page, 'Conta & sync');
  if (await cabeca.getAttribute('aria-expanded') !== 'true') await cabeca.click();
  await expect(cabeca).toHaveAttribute('aria-expanded', 'true');
}

/** Segura as respostas do Firestore até `liberar()`; depois o fake responde. */
async function segurarANuvem(page, padrao = /firestore\.googleapis\.com/) {
  let liberar;
  const liberada = new Promise(resolve => { liberar = resolve; });
  await page.route(padrao, async route => {
    await liberada;
    await route.fallback();
  });
  return () => liberar();
}

/** O Detalhes recolhido do card, aberto, com a causa técnica. */
async function detalhesDoCard(page) {
  const detalhes = conta(page).locator('details');
  await detalhes.locator('summary', { hasText: 'Detalhes' }).click();
  return detalhes.locator('pre');
}

// ─── Os cards fechados, resumo primeiro ──────────────────────────────────────

test('#configuracoes mostra os 4 cards fechados em linha, na ordem, com o resumo da conta', async ({ page, extensao }) => {
  await abrirPainel(page, extensao);

  const cabecas = page.locator('.shell-cards').getByRole('button', { expanded: false });
  await expect(cabecas).toHaveCount(4);
  for (const [i, nome] of ['Conta & sync', 'Atalhos', 'Chave do Gemini', 'Zona de perigo'].entries()) {
    await expect(cabecas.nth(i)).toHaveAccessibleName(nome);
  }
  await expect(resumo(page, 'conta')).toHaveText('Sem conta · só neste computador');
  await expect(conta(page).getByRole('button', { name: 'Entrar com Google' })).toBeHidden();
});

test('clicar na linha abre o card no lugar, e vários ficam abertos ao mesmo tempo', async ({ page, extensao }) => {
  await abrirPainel(page, extensao);
  const descricao = conta(page).getByText('Com a conta, suas frases ficam iguais em qualquer computador em que você entrar.');
  await expect(descricao).toBeHidden();

  // A linha inteira é clicável, não só o título.
  await resumo(page, 'conta').click();
  await expect(cabecaDoCard(page, 'Conta & sync')).toHaveAttribute('aria-expanded', 'true');
  await expect(descricao).toBeVisible();
  await expect(resumo(page, 'conta')).toBeHidden();
  await expect(conta(page).getByRole('button', { name: 'Entrar com Google' })).toBeVisible();

  await cabecaDoCard(page, 'Zona de perigo').click();
  await expect(cabecaDoCard(page, 'Zona de perigo')).toHaveAttribute('aria-expanded', 'true');
  await expect(cabecaDoCard(page, 'Conta & sync')).toHaveAttribute('aria-expanded', 'true');

  await cabecaDoCard(page, 'Conta & sync').click();
  await expect(cabecaDoCard(page, 'Conta & sync')).toHaveAttribute('aria-expanded', 'false');
  await expect(descricao).toBeHidden();
  await expect(resumo(page, 'conta')).toBeVisible();
});

test('#configuracoes/conta abre o card, rola até ele e pisca a borda', async ({ page, extensao }) => {
  await page.setViewportSize({ width: 1280, height: 400 });
  await abrirPainel(page, extensao, '#configuracoes/perigo');
  await expect(cabecaDoCard(page, 'Zona de perigo')).toHaveAttribute('aria-expanded', 'true');
  await expect(cabecaDoCard(page, 'Conta & sync')).toHaveAttribute('aria-expanded', 'false');

  await page.evaluate(() => { location.hash = '#configuracoes/conta'; });
  await expect(cabecaDoCard(page, 'Conta & sync')).toHaveAttribute('aria-expanded', 'true');
  await expect(conta(page)).toBeInViewport();
  expect(await conta(page).evaluate(el => getComputedStyle(el).animationName)).toBe('shell-destaque');
});

test('o chip de conta leva ao card Conta & sync aberto', async ({ page, extensao }) => {
  await abrirPainel(page, extensao, '#frases');
  await chip(page).click();
  await expect(page).toHaveURL(/#configuracoes\/conta$/);
  await expect(cabecaDoCard(page, 'Conta & sync')).toHaveAttribute('aria-expanded', 'true');
  await expect(conta(page).getByRole('button', { name: 'Entrar com Google' })).toBeVisible();
});

// ─── Os 10 estados de conta: card, resumo e chip ─────────────────────────────

test('Sincronizado (CFG-02): nome, ponto verde, Sair da conta e a nota; o chip e o resumo dizem o mesmo', async ({ page, extensao }) => {
  await extensao.semearSessao({ displayName: 'Ana Souza' });
  await abrirPainel(page, extensao);

  await expect(resumo(page, 'conta')).toHaveText('Ana Souza · Sincronizado agora');
  await expect(estadoDoChip(page)).toHaveText('Sincronizado agora');

  await abrirConta(page);
  await expect(conta(page).getByText('Ana Souza', { exact: true })).toBeVisible();
  await expect(conta(page).getByText('Sincronizado agora', { exact: true })).toBeVisible();
  await expect(conta(page).getByRole('button', { name: 'Sair da conta' })).toHaveClass(/veio-botao--fantasma/);
  await expect(conta(page).getByText('Ao sair, as frases continuam neste computador.')).toBeVisible();
  await expect(conta(page).getByRole('alert')).toHaveCount(0);
});

test('Sincronizando (CFG-01): enquanto a nuvem não responde, o card, o resumo e o chip dizem “Sincronizando…”', async ({ page, extensao }) => {
  await extensao.semearSessao({ displayName: 'Ana Souza' });
  const liberar = await segurarANuvem(page);
  await abrirPainel(page, extensao);

  await expect(estadoDoChip(page)).toHaveText('Sincronizando…');
  await expect(resumo(page, 'conta')).toHaveText('Ana Souza · Sincronizando…');
  await abrirConta(page);
  await expect(conta(page).getByText('Sincronizando…', { exact: true })).toBeVisible();

  liberar();
  await expect(estadoDoChip(page)).toHaveText('Sincronizado agora');
});

test('Primeira subida (CFG-09): entrar com frases neste computador mostra “Sincronizando 12 frases…” e sobe todas', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: frasesDeExemplo(12) });
  const liberar = await segurarANuvem(page, /:batchWrite/);
  await abrirPainel(page, extensao, '#configuracoes/conta');

  await conta(page).getByRole('button', { name: 'Entrar com Google' }).click();
  await expect(estadoDoChip(page)).toHaveText('Sincronizando 12 frases…');
  await expect(conta(page).getByText('Sincronizando 12 frases…', { exact: true })).toBeVisible();

  liberar();
  await expect(page.getByRole('status').getByText('12 frases sincronizadas')).toBeVisible();
  await expect(estadoDoChip(page)).toHaveText('Sincronizado agora');
  expect(fakes.google.frasesDe('uid-teste')).toHaveLength(12);
});

test('Sem sincronizar (CFG-03): só no card e no chip, com Tentar de novo e Detalhes; tentar com a nuvem de volta sincroniza', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ displayName: 'Ana Souza' });
  fakes.google.ficarForaDoAr();
  await abrirPainel(page, extensao, '#frases');

  await expect(estadoDoChip(page)).toHaveText('Sem sincronizar');
  await expect(estadoDoChip(page)).toHaveClass(/shell-chip__estado--erro/);
  // Nenhuma faixa nem toast nas outras áreas.
  await expect(page.getByText(/nuvem|sincroniz/i).filter({ visible: true })).toHaveText(['Sem sincronizar']);

  await chip(page).click();
  await expect(resumo(page, 'conta')).toBeHidden();
  await expect(conta(page).getByText('Sem sincronizar · as frases estão só neste computador')).toBeVisible();
  const aviso = conta(page).getByRole('alert');
  await expect(aviso).toContainText('As mudanças deste computador ainda não subiram para a nuvem.');
  await expect(await detalhesDoCard(page)).toContainText('The service is currently unavailable.');

  fakes.google.ficarForaDoAr(false);
  await aviso.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(estadoDoChip(page)).toHaveText('Sincronizado agora');
  await expect(conta(page).getByRole('alert')).toHaveCount(0);
});

test('Sync parcial (CFG-05): “8 de 10 frases sincronizadas · 2 ficaram só neste computador”, e o chip “8 de 10 sincronizadas”', async ({ page, extensao, fakes }) => {
  const frases = frasesDeExemplo(10);
  fakes.google.gravarFrases('uid-parcial', frases.slice(2));
  fakes.google.recusarEscritas();
  await extensao.gravarStorage({ frases });
  await extensao.semearSessao({ uid: 'uid-parcial', displayName: 'Ana Souza' });
  await abrirPainel(page, extensao);

  await expect(estadoDoChip(page)).toHaveText('8 de 10 sincronizadas');
  await expect(estadoDoChip(page)).toHaveClass(/shell-chip__estado--erro/);
  await expect(resumo(page, 'conta')).toHaveText('Ana Souza · 8 de 10 sincronizadas');

  await abrirConta(page);
  await expect(conta(page).getByText('8 de 10 frases sincronizadas · 2 ficaram só neste computador')).toBeVisible();
  await expect(conta(page).getByRole('alert').getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
  await expect(await detalhesDoCard(page)).toContainText('indisponível');

  fakes.google.recusarEscritas(false);
  await conta(page).getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(estadoDoChip(page)).toHaveText('Sincronizado agora');
  expect(fakes.google.frasesDe('uid-parcial')).toHaveLength(10);
});

test('Nuvem recusou (CFG-04): o Sair da conta vira botão normal, e o Detalhes traz a mensagem do Firestore', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ displayName: 'Ana Souza' });
  fakes.google.recusarAcesso();
  await abrirPainel(page, extensao);

  await expect(estadoDoChip(page)).toHaveText('Sem sincronizar');
  await abrirConta(page);
  await expect(conta(page).getByText('A nuvem recusou o acesso. Saia da conta e entre de novo.')).toBeVisible();
  const sair = conta(page).getByRole('button', { name: 'Sair da conta' });
  await expect(sair).toHaveClass(/veio-botao--secundario/);
  await expect(await detalhesDoCard(page)).toContainText('Missing or insufficient permissions.');

  await sair.click();
  await expect(chip(page)).toHaveText('Sem conta · só neste computador');
});

test('Sessão expirou (CFG-08): “Entrar” leva ao login e volta a sincronizar', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: frasesDeExemplo(2) });
  await extensao.semearSessao({ displayName: 'Ana Souza', expirada: true });
  fakes.google.expirarSessao();
  await abrirPainel(page, extensao);

  await expect(estadoDoChip(page)).toHaveText('Sessão expirou');
  await expect(estadoDoChip(page)).toHaveClass(/shell-chip__estado--erro/);
  await abrirConta(page);
  await expect(conta(page).getByText('Sua sessão expirou. Entre de novo para sincronizar.')).toBeVisible();
  await expect(conta(page).getByRole('button', { name: 'Sair da conta' })).toHaveCount(0);
  // As frases continuam na lista, deste computador.
  await expect(page.locator('#shell-total')).toHaveText('2');

  await conta(page).getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(estadoDoChip(page)).toHaveText('Sincronizado agora');
  expect((await extensao.lerStorage(['pm_firebase_auth'])).pm_firebase_auth.expiresAt).toBeGreaterThan(Date.now());
});

test('Perfil sem nome (CFG-10): o card, o resumo e o chip dizem “Conta Google”', async ({ page, extensao }) => {
  await extensao.semearSessao({ displayName: '', email: '' });
  await abrirPainel(page, extensao);

  await expect(chip(page)).toContainText('Conta Google');
  await expect(resumo(page, 'conta')).toHaveText('Conta Google · Sincronizado agora');
  await abrirConta(page);
  await expect(conta(page).getByText('Conta Google', { exact: true })).toBeVisible();
});

test('Sem conta (CFG-06): avatar vazio, “Suas frases em qualquer computador” e Entrar com Google primário', async ({ page, extensao }) => {
  await abrirPainel(page, extensao, '#configuracoes/conta');

  await expect(conta(page).getByText('Suas frases em qualquer computador', { exact: true })).toBeVisible();
  await expect(conta(page).getByText('Sem conta, elas ficam só neste computador.')).toBeVisible();
  await expect(conta(page).getByRole('button', { name: 'Entrar com Google' })).toHaveClass(/veio-botao--primario/);
  await expect(chip(page)).toHaveText('Sem conta · só neste computador');
});

test('Login falhou (CFG-07): erro no card com Tentar de novo e Detalhes; o chip continua sem conta', async ({ page, extensao, fakes }) => {
  fakes.google.proximoLogin('falhar');
  await abrirPainel(page, extensao, '#configuracoes/conta');

  await conta(page).getByRole('button', { name: 'Entrar com Google' }).click();
  const aviso = conta(page).getByRole('alert');
  await expect(aviso).toContainText('Não deu para entrar com o Google. Tente de novo.');
  await expect(await detalhesDoCard(page)).toContainText('Authorization page could not be loaded.');
  await expect(chip(page)).toHaveText('Sem conta · só neste computador');
  await expect(page.locator('#_toast')).toHaveCount(0);

  fakes.google.proximoLogin('entrar');
  await aviso.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(estadoDoChip(page)).toHaveText('Sincronizado agora');
  await expect(conta(page).getByRole('alert')).toHaveCount(0);
});

test('cancelar o login (fechar a janela do Google) não mostra nada', async ({ page, context, extensao, fakes }) => {
  fakes.google.proximoLogin('janela');
  await abrirPainel(page, extensao, '#configuracoes/conta');

  const janela = context.waitForEvent('page', p => p.url().startsWith('https://accounts.google.com/'));
  await conta(page).getByRole('button', { name: 'Entrar com Google' }).click();
  await (await janela).close();

  await expect(conta(page).getByRole('button', { name: 'Entrar com Google' })).toBeEnabled();
  await page.waitForTimeout(300);
  await expect(conta(page).getByRole('alert')).toHaveCount(0);
  await expect(page.locator('#_toast')).toHaveCount(0);
  await expect(chip(page)).toHaveText('Sem conta · só neste computador');
});

// ─── O caminho feliz de hoje: entrar, sincronizar, sair ──────────────────────

test('entrar com Google sobe as frases e mostra a conta; sair deixa as frases neste computador', async ({ page, extensao, fakes }) => {
  fakes.google.usarPerfil({ name: 'Bruno Lima', email: 'bruno@teste.dev' });
  await extensao.gravarStorage({ frases: frasesDeExemplo(3) });
  await abrirPainel(page, extensao, '#configuracoes/conta');

  await conta(page).getByRole('button', { name: 'Entrar com Google' }).click();
  await expect(chip(page)).toContainText('Bruno Lima');
  await expect(estadoDoChip(page)).toHaveText('Sincronizado agora');
  await expect(conta(page).getByText('Bruno Lima', { exact: true })).toBeVisible();
  expect(fakes.google.frasesDe('uid-teste')).toHaveLength(3);
  const gravado = await extensao.lerStorage(['pm_user_info', 'pm_firebase_auth']);
  expect(gravado.pm_user_info).toMatchObject({ uid: 'uid-teste', email: 'bruno@teste.dev', displayName: 'Bruno Lima' });
  expect(gravado.pm_firebase_auth).toMatchObject({ uid: 'uid-teste', idToken: 'token-teste' });

  await conta(page).getByRole('button', { name: 'Sair da conta' }).click();
  await expect(chip(page)).toHaveText('Sem conta · só neste computador');
  await expect(conta(page).getByRole('button', { name: 'Entrar com Google' })).toBeVisible();
  expect(await extensao.lerStorage(['pm_user_info', 'pm_firebase_auth'])).toEqual({});
  expect(await extensao.frases()).toHaveLength(3);
  await expect(page.locator('#shell-total')).toHaveText('3');
});

// ─── Janela estreita, teclado e movimento ────────────────────────────────────

test('abaixo de ~560 px de conteúdo, o resumo da linha fechada some e o conteúdo perde o recuo', async ({ page, extensao }) => {
  await extensao.semearSessao({ displayName: 'Ana Souza' });
  await page.setViewportSize({ width: 1280, height: 800 });
  await abrirPainel(page, extensao);
  await expect(resumo(page, 'conta')).toBeVisible();
  await abrirConta(page);
  const recuo = () => conta(page).locator('.cfg-corpo').evaluate(el => parseFloat(getComputedStyle(el).paddingLeft));
  expect(await recuo()).toBe(62);

  // 700 px de janela: trilho de 76 px, e o conteúdo fica abaixo de 560 px.
  await page.setViewportSize({ width: 700, height: 800 });
  await expect.poll(recuo).toBe(16);
  await cabecaDoCard(page, 'Conta & sync').click();
  await expect(resumo(page, 'conta')).toBeHidden();
});

test('a linha do card abre e fecha pelo teclado, com o foco visível', async ({ page, extensao }) => {
  await abrirPainel(page, extensao);
  const cabeca = cabecaDoCard(page, 'Conta & sync');
  await cabeca.focus();
  expect(await cabeca.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');

  await page.keyboard.press('Enter');
  await expect(cabeca).toHaveAttribute('aria-expanded', 'true');
  await expect(cabeca).toHaveAttribute('aria-controls', /.+/);
  await page.keyboard.press('Space');
  await expect(cabeca).toHaveAttribute('aria-expanded', 'false');
});

test('com movimento reduzido, o ponto do Sincronizando fica parado', async ({ page, extensao }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await extensao.semearSessao({ displayName: 'Ana Souza' });
  await segurarANuvem(page);
  await abrirPainel(page, extensao, '#configuracoes/conta');

  const pontos = conta(page).locator('.cfg-ponto[data-estado="sincronizando"]').filter({ visible: true });
  await expect(pontos.first()).toBeVisible();
  for (const ponto of await pontos.all()) {
    expect(await ponto.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  }
});

test('sem movimento reduzido, o ponto do Sincronizando pisca', async ({ page, extensao }) => {
  await extensao.semearSessao({ displayName: 'Ana Souza' });
  await segurarANuvem(page);
  await abrirPainel(page, extensao, '#configuracoes/conta');

  const ponto = conta(page).locator('.cfg-ponto[data-estado="sincronizando"]').filter({ visible: true }).first();
  await expect(ponto).toBeVisible();
  expect(await ponto.evaluate(el => getComputedStyle(el).animationName)).toBe('veio-piscar');
});

'use strict';

// Passo 2 do redesign: Configurações com os cards “resumo primeiro” e o card
// Conta & sync (#26, docs/design/painel/configuracoes/).
//
// #configuracoes mostra os cinco cards fechados, cada um numa linha com o
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

/** Sem conta, o chip diz “Sem conta” no lugar do nome e “Só neste computador” no do estado. */
async function esperarChipSemConta(page) {
  await expect(page.locator('#shell-chip-nome')).toHaveText('Sem conta');
  await expect(page.locator('#shell-chip-estado')).toHaveText('Só neste computador');
}

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

test('#configuracoes mostra os 5 cards fechados em linha, na ordem, com o resumo da conta', async ({ page, extensao }) => {
  await abrirPainel(page, extensao);

  const cabecas = page.locator('.shell-cards').getByRole('button', { expanded: false });
  await expect(cabecas).toHaveCount(5);
  for (const [i, nome] of ['Conta & sync', 'Atalhos', 'Chave do Gemini', 'Aparência', 'Zona de perigo'].entries()) {
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

// ─── Os resumos de Atalhos, Chave do Gemini e Zona de perigo ─────────────────

const CHAVE_DO_GEMINI = 'AIzaSyD4kQ7wL2mXe9pRtB8nVfH0cJ3kQ9';
const SELECAO_NO_BOTAO_VOLTAR = {
  type: 'mouse', button: 3, code: null, altKey: true, ctrlKey: false, shiftKey: false, label: 'Alt+Mouse Back',
};

test('as linhas fechadas resumem os atalhos, a chave mascarada e o total de frases gravados', async ({ page, extensao }) => {
  await extensao.gravarStorage({
    frases: frasesDeExemplo(1245),
    geminiApiKey: CHAVE_DO_GEMINI,
    pm_atalho: SELECAO_NO_BOTAO_VOLTAR,
  });
  await abrirPainel(page, extensao);

  await expect(resumo(page, 'perigo')).toHaveText('1.245 frases');
  // O botão gravado em inglês aparece em PT-BR (CFG-14), cada tecla no seu kbd.
  await expect(resumo(page, 'atalhos').locator('> span')).toHaveText(['Legenda Alt+S', 'Seleção Alt+Botão voltar']);
  await expect(resumo(page, 'atalhos').locator('kbd')).toHaveText(['Alt+S', 'Alt+Botão voltar']);
  // A chave aparece só pelas pontas: nunca inteira na tela.
  await expect(resumo(page, 'chave')).toHaveText('AIza••••••••3kQ9');
  await expect(page.getByText(CHAVE_DO_GEMINI)).toHaveCount(0);

  // Abrir o card troca o resumo pelo conteúdo, como no card Conta & sync.
  await cabecaDoCard(page, 'Zona de perigo').click();
  await expect(resumo(page, 'perigo')).toBeHidden();
  await expect(card(page, 'perigo').getByRole('button', { name: 'Apagar todas as 1.245 frases' })).toBeVisible();
});

test('sem nada gravado: “Sem atalho” tracejado, “Sem chave” em danger e “Nenhuma frase”; os resumos acompanham o que muda', async ({ page, extensao }) => {
  await abrirPainel(page, extensao);

  await expect(resumo(page, 'perigo')).toHaveText('Nenhuma frase');
  await expect(resumo(page, 'atalhos').locator('> span')).toHaveText(['Legenda Alt+S', 'Seleção Sem atalho']);
  await expect(resumo(page, 'atalhos').locator('kbd').last()).toHaveClass(/veio-kbd--sem-atalho/);
  await expect(resumo(page, 'chave')).toHaveText('Sem chave');
  const corDoPerigo = await page.evaluate(() => {
    const amostra = document.createElement('span');
    amostra.style.color = 'var(--veio-danger)';
    document.body.append(amostra);
    return getComputedStyle(amostra).color;
  });
  expect(await resumo(page, 'chave').locator('.cfg-status').evaluate(el => getComputedStyle(el).color)).toBe(corDoPerigo);

  // Gravar em outra página (o popup, o Minerar de uma foto) aparece aqui sem recarregar.
  await extensao.gravarStorage({
    frases: frasesDeExemplo(1),
    geminiApiKey: CHAVE_DO_GEMINI,
    pm_atalho: { type: 'keyboard', button: null, code: 'KeyK', altKey: false, ctrlKey: true, shiftKey: true, label: 'Ctrl+Shift+K' },
  });
  await expect(resumo(page, 'atalhos').locator('> span')).toHaveText(['Legenda Alt+S', 'Seleção Ctrl+Shift+K']);
  await expect(resumo(page, 'chave')).toHaveText('AIza••••••••3kQ9');
  await page.reload();
  await expect(resumo(page, 'perigo')).toHaveText('1 frase');
});

test('abaixo de ~560 px de conteúdo, nenhuma linha fechada mostra resumo', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: frasesDeExemplo(3), geminiApiKey: CHAVE_DO_GEMINI, pm_atalho: SELECAO_NO_BOTAO_VOLTAR });
  await page.setViewportSize({ width: 1280, height: 800 });
  await abrirPainel(page, extensao);
  for (const secao of ['conta', 'atalhos', 'chave', 'perigo']) await expect(resumo(page, secao)).toBeVisible();
  await expect(resumo(page, 'perigo')).toHaveText('3 frases');

  await page.setViewportSize({ width: 700, height: 800 });
  for (const secao of ['conta', 'atalhos', 'chave', 'perigo']) await expect(resumo(page, secao)).toBeHidden();
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

test('Primeira subida que falha (CFG-09): só no card e no chip, “Não deu para sincronizar suas frases”; tentar de novo sobe todas', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: frasesDeExemplo(12) });
  fakes.google.recusarEscritas();
  await abrirPainel(page, extensao, '#configuracoes/conta');

  await conta(page).getByRole('button', { name: 'Entrar com Google' }).click();
  await expect(estadoDoChip(page)).toHaveText('Sem sincronizar');
  await expect(estadoDoChip(page)).toHaveClass(/shell-chip__estado--erro/);
  const aviso = conta(page).getByRole('alert');
  await expect(aviso).toContainText('Não deu para sincronizar suas frases. Elas continuam neste computador.');
  await expect(await detalhesDoCard(page)).toContainText('indisponível');
  await expect(page.locator('#_toast')).toHaveCount(0);
  expect(await extensao.frases()).toHaveLength(12);

  fakes.google.recusarEscritas(false);
  await aviso.getByRole('button', { name: 'Tentar de novo' }).click();
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

test('apagar uma frase com a nuvem fora do ar: o problema aparece no chip e no card, sem toast (o aviso da própria área é PAI-15, do #30)', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: frasesDeExemplo(2) });
  await extensao.semearSessao({ displayName: 'Ana Souza' });
  await abrirPainel(page, extensao, '#frases');
  await expect(estadoDoChip(page)).toHaveText('Sincronizado agora');

  // Anota todo toast que aparece: o de sucesso do apagar pode cobrir um de erro logo em seguida.
  await page.evaluate(() => {
    window.__toasts = [];
    new MutationObserver(mudancas => {
      for (const { addedNodes } of mudancas) for (const no of addedNodes) if (no.id === '_toast') window.__toasts.push(no.textContent);
    }).observe(document.body, { childList: true });
  });
  fakes.google.ficarForaDoAr();
  await page.locator('#frases-lista .veio-frase').first().getByRole('button', { name: 'Apagar frase' }).click();
  // Apagar 1 frase pede confirmação (PAI-12, #30).
  await page.getByRole('dialog').getByRole('button', { name: 'Apagar frase' }).click();
  await expect(estadoDoChip(page)).toHaveText('Sem sincronizar');
  // A única fala sobre a nuvem na área é o aviso PAI-15 do apagar (#30), que diz
  // o que ficou lá e traz “Tentar de novo”. Nada disso é toast.
  await expect(page.getByRole('alert').filter({ hasText: 'As frases foram apagadas deste computador, mas não da nuvem.' })).toBeVisible();
  expect((await page.evaluate(() => window.__toasts)).filter(t => /nuvem|erro/i.test(t))).toEqual([]);

  await chip(page).click();
  await expect(conta(page).getByRole('alert')).toContainText('As mudanças deste computador ainda não subiram para a nuvem.');
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

test('Sync parcial: editar uma frase não apaga as que ainda não subiram', async ({ page, extensao, fakes }) => {
  const frases = frasesDeExemplo(10);
  fakes.google.gravarFrases('uid-parcial', frases.slice(2));
  fakes.google.recusarEscritas();
  await extensao.gravarStorage({ frases });
  await extensao.semearSessao({ uid: 'uid-parcial', displayName: 'Ana Souza' });
  await abrirPainel(page, extensao, '#frases');
  await expect(estadoDoChip(page)).toHaveText('8 de 10 sincronizadas');

  await page.locator('#frases-lista .veio-frase').first().locator('.veio-palavra-clicavel').first().click();

  await expect.poll(async () => (await extensao.frases()).some(f => f.keywords?.length)).toBe(true);
  expect((await extensao.frases()).map(f => f.id).sort()).toEqual(frases.map(f => f.id).sort());
});

test('Sync parcial: editar uma frase que ainda não subiu grava o documento completo', async ({ page, extensao, fakes }) => {
  const frases = frasesDeExemplo(2);
  fakes.google.gravarFrases('uid-edicao', frases.slice(1));
  fakes.google.recusarEscritas();
  await extensao.gravarStorage({ frases });
  await extensao.semearSessao({ uid: 'uid-edicao' });
  await abrirPainel(page, extensao, '#frases');
  await expect(estadoDoChip(page)).toHaveText('1 de 2 sincronizadas');

  fakes.google.recusarEscritas(false);
  await page.locator('#frases-lista .veio-frase').filter({ hasText: frases[0].texto })
    .locator('.veio-palavra-clicavel').first().click();

  await expect.poll(() => fakes.google.frasesDe('uid-edicao').find(f => f.id === frases[0].id))
    .toMatchObject({ id: frases[0].id, texto: frases[0].texto, keywords: [expect.any(String)], autoKeyword: false });
});

test('Sync parcial: uma frase minerada durante a subida sobrevive à próxima edição', async ({ page, extensao, fakes }) => {
  const frases = frasesDeExemplo(2);
  const novaFrase = frasesDeExemplo(3)[0];
  fakes.google.gravarFrases('uid-concorrente', frases.slice(1));
  fakes.google.recusarEscritas();
  await extensao.gravarStorage({ frases });
  await extensao.semearSessao({ uid: 'uid-concorrente' });

  let sinalizarSubida;
  const subidaIniciada = new Promise(resolve => { sinalizarSubida = resolve; });
  let liberar;
  const liberada = new Promise(resolve => { liberar = resolve; });
  await page.route(/\/usuarios\/uid-concorrente\/frases\//, async route => {
    if (route.request().method() === 'PATCH') {
      sinalizarSubida();
      await liberada;
    }
    await route.fallback();
  });
  await abrirPainel(page, extensao, '#frases');
  await subidaIniciada;
  await extensao.gravarStorage({ frases: [...frases, novaFrase] });
  await expect(page.locator('#shell-total')).toHaveText('3');

  liberar();
  await expect(estadoDoChip(page)).toHaveText('1 de 2 sincronizadas');
  await page.locator('#frases-lista .veio-frase').first().locator('.veio-palavra-clicavel').first().click();

  await expect.poll(async () => (await extensao.frases()).some(f => f.keywords?.length)).toBe(true);
  expect((await extensao.frases()).map(f => f.id).sort()).toEqual([...frases, novaFrase].map(f => f.id).sort());
});

test('Sync parcial conta as frases deste computador, não as que outros computadores já têm na nuvem', async ({ page, extensao, fakes }) => {
  const frases = frasesDeExemplo(10);
  const deOutroComputador = frasesDeExemplo(5).map(f => ({ ...f, id: f.id + 1_000 }));
  fakes.google.gravarFrases('uid-parcial', [...deOutroComputador, ...frases.slice(2)]);
  fakes.google.recusarEscritas();
  await extensao.gravarStorage({ frases });
  await extensao.semearSessao({ uid: 'uid-parcial', displayName: 'Ana Souza' });
  await abrirPainel(page, extensao, '#configuracoes/conta');

  await expect(estadoDoChip(page)).toHaveText('8 de 10 sincronizadas');
  await expect(conta(page).getByText('8 de 10 frases sincronizadas · 2 ficaram só neste computador')).toBeVisible();
});

test('Sincronizado há 2 min (CFG-02): o tempo avança sozinho, na forma curta', async ({ page, extensao }) => {
  await page.clock.install();
  await extensao.semearSessao({ displayName: 'Ana Souza' });
  await abrirPainel(page, extensao);
  await expect(estadoDoChip(page)).toHaveText('Sincronizado agora');

  await page.clock.runFor('02:30');
  await expect(estadoDoChip(page)).toHaveText('Sincronizado há 2 min');
  await expect(resumo(page, 'conta')).toHaveText('Ana Souza · Sincronizado há 2 min');
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
  await esperarChipSemConta(page);
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
  await esperarChipSemConta(page);
});

test('Login falhou (CFG-07): erro no card com Tentar de novo e Detalhes; o chip continua sem conta', async ({ page, extensao, fakes }) => {
  fakes.google.proximoLogin('falhar');
  await abrirPainel(page, extensao, '#configuracoes/conta');

  await conta(page).getByRole('button', { name: 'Entrar com Google' }).click();
  const aviso = conta(page).getByRole('alert');
  await expect(aviso).toContainText('Não deu para entrar com o Google. Tente de novo.');
  await expect(await detalhesDoCard(page)).toContainText('Authorization page could not be loaded.');
  await esperarChipSemConta(page);
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
  await esperarChipSemConta(page);
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
  await esperarChipSemConta(page);
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

test('com movimento reduzido, #configuracoes/conta mostra a borda ouro parada, e ela sai depois do flash', async ({ page, extensao }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await abrirPainel(page, extensao, '#configuracoes/conta');

  const ouro = await page.evaluate(() => {
    const amostra = document.createElement('i');
    amostra.style.color = 'var(--veio-accent)';
    document.body.append(amostra);
    const cor = getComputedStyle(amostra).color;
    amostra.remove();
    return cor;
  });
  const borda = () => conta(page).evaluate(el => getComputedStyle(el).borderTopColor);
  expect(await borda()).toBe(ouro);
  expect(await conta(page).evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  await expect.poll(borda, { timeout: 3000 }).not.toBe(ouro);
});

test('sem movimento reduzido, o ponto do Sincronizando pisca', async ({ page, extensao }) => {
  await extensao.semearSessao({ displayName: 'Ana Souza' });
  await segurarANuvem(page);
  await abrirPainel(page, extensao, '#configuracoes/conta');

  const ponto = conta(page).locator('.cfg-ponto[data-estado="sincronizando"]').filter({ visible: true }).first();
  await expect(ponto).toBeVisible();
  expect(await ponto.evaluate(el => getComputedStyle(el).animationName)).toBe('veio-piscar');
});

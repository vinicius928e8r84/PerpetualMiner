'use strict';

// Passo 2 do redesign: o shell “Ilhas” do Painel (#25).
//
// O painel vira uma página só, com uma área por endereço (#frases,
// #anki/<aba>, #configuracoes[/<seção>]). Colados na navegação ficam o total
// de frases, o ponto da Conexão com o Anki e o chip de conta. Abaixo de
// ~1000 px a sidebar vira trilho. Com a Conexão desligada, a área dela mostra
// a faixa F1 com “Tentar de novo”. O conteúdo de hoje (lista de frases, custos,
// baralhos…) mora dentro do shell até cada área ser reconstruída.
//
// Os testes afirmam o que a pessoa vê (textos, papéis, estilo computado) e o
// que fica gravado, nunca funções internas.

const { test, expect } = require('../fixtures');

const HOJE = new Date().toLocaleDateString('pt-BR');

/** `n` frases em inglês, a mais nova primeiro, alternando a Fonte. */
function frasesDeExemplo(n, fontes = ['netflix', 'youtube']) {
  return Array.from({ length: n }, (_, i) => ({
    id: 1_700_000_000_000 + (n - i),
    texto: `Sentence number ${n - i} about the harbour.`,
    data: HOJE,
    streaming: fontes[i % fontes.length],
    idioma: 'Inglês',
  }));
}

async function abrirPainel(page, extensao, endereco = '') {
  await page.goto(extensao.url(`painel.html${endereco}`));
  await expect(navegacao(page)).toBeVisible();
}

const navegacao = page => page.getByRole('navigation', { name: 'Navegação do painel' });
const itemDaNav = (page, nome) => page.locator('.shell-lateral').getByRole('link', { name: nome, exact: true });
const tituloDaArea = page => page.getByRole('heading', { level: 1 });
const chip = page => page.locator('#shell-chip');

/** Sem conta, o chip diz “Sem conta” no lugar do nome e “Só neste computador” no do estado. */
async function esperarChipSemConta(page) {
  await expect(page.locator('#shell-chip-nome')).toHaveText('Sem conta');
  await expect(page.locator('#shell-chip-estado')).toHaveText('Só neste computador');
}
const pontoDaConexao = page => page.locator('.shell-ponto');
const filtroDeFonte = page => page.getByRole('combobox', { name: 'Fonte', exact: true });
const paginaAtual = page => page.locator('#paginas-atual');
const marcarFrase = page => page.locator('#frases-lista').getByRole('checkbox', { name: 'Selecionar frase' });
const cartao = (page, texto) => page.locator('#frases-lista .veio-frase').filter({ hasText: texto });
const faixaF1 = page => page.getByText('A conexão com o Anki está desligada. Ligue-a neste computador e tente de novo.');

// ─── Endereços ───────────────────────────────────────────────────────────────

test('sem endereço, o painel abre em Frases, com Frases e a Conexão no topo e Configurações no pé', async ({ page, extensao }) => {
  await abrirPainel(page, extensao);

  await expect(tituloDaArea(page)).toHaveText('Frases mineradas');
  await expect(itemDaNav(page, 'Frases')).toHaveAttribute('aria-current', 'page');

  const topo = page.locator('.shell-topo').getByRole('link');
  await expect(topo).toHaveCount(2);
  await expect(topo.nth(0)).toHaveAccessibleName('Frases');
  await expect(topo.nth(1)).toHaveAccessibleName('Conexão com o Anki');
  await expect(page.locator('.shell-pe').getByRole('link', { name: 'Configurações', exact: true })).toBeVisible();
});

test('abrir #anki/baralhos cai direto na aba, e o voltar do navegador volta à área anterior', async ({ page, extensao }) => {
  await abrirPainel(page, extensao, '#anki/baralhos');

  await expect(tituloDaArea(page)).toHaveText('Conexão com o Anki');
  await expect(page.getByRole('radio', { name: 'Baralhos e termos' })).toBeChecked();
  await expect(page.locator('[data-aba="baralhos"]')).toBeVisible();
  await expect(page.locator('[data-aba="custos"]')).toBeHidden();
  await expect(itemDaNav(page, 'Conexão com o Anki')).toHaveAttribute('aria-current', 'page');

  await itemDaNav(page, 'Configurações').click();
  await expect(tituloDaArea(page)).toHaveText('Configurações');
  await expect(page).toHaveURL(/#configuracoes$/);

  await page.goBack();
  await expect(tituloDaArea(page)).toHaveText('Conexão com o Anki');
  await expect(page.getByRole('radio', { name: 'Baralhos e termos' })).toBeChecked();
  await expect(page).toHaveURL(/#anki\/baralhos$/);
});

test('as abas da Conexão com o Anki trocam o endereço, na ordem Custos · Baralhos e termos · Vocabulário · Ajustes de envio', async ({ page, extensao }) => {
  await abrirPainel(page, extensao, '#anki');

  const abas = page.getByRole('radiogroup', { name: 'Seções da Conexão com o Anki' }).getByRole('radio');
  await expect(abas).toHaveCount(4);
  for (const [i, nome] of ['Custos', 'Baralhos e termos', 'Vocabulário', 'Ajustes de envio'].entries()) {
    await expect(abas.nth(i)).toHaveAccessibleName(nome);
  }
  await expect(page.getByRole('radio', { name: 'Custos' })).toBeChecked();

  await page.getByText('Vocabulário', { exact: true }).click();
  await expect(page).toHaveURL(/#anki\/vocabulario$/);
  await expect(page.locator('[data-aba="vocabulario"]')).toBeVisible();

  // Voltar à área pela sidebar volta para a última aba aberta.
  await itemDaNav(page, 'Frases').click();
  await itemDaNav(page, 'Conexão com o Anki').click();
  await expect(page).toHaveURL(/#anki\/vocabulario$/);
});

test('#configuracoes/perigo rola até a Zona de perigo', async ({ page, extensao }) => {
  await page.setViewportSize({ width: 1280, height: 400 });
  await abrirPainel(page, extensao, '#configuracoes/perigo');

  await expect(tituloDaArea(page)).toHaveText('Configurações');
  await expect(page.getByRole('heading', { name: 'Zona de perigo' })).toBeInViewport();
});

test('um endereço desconhecido abre Frases', async ({ page, extensao }) => {
  await abrirPainel(page, extensao, '#nao-existe');
  await expect(tituloDaArea(page)).toHaveText('Frases mineradas');
});

// ─── Trocar de área não recarrega ────────────────────────────────────────────

test('trocar de área e voltar mantém filtro, página e seleção; recarregar zera', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: frasesDeExemplo(24) });
  await abrirPainel(page, extensao);

  await filtroDeFonte(page).selectOption({ label: 'YouTube' });
  await page.getByRole('button', { name: 'Próxima página' }).click();
  await expect(paginaAtual(page)).toHaveText('2 de 2');
  const primeira = marcarFrase(page).first();
  await primeira.check();
  await expect(page.locator('#selection-count')).toHaveText('1 selecionada');
  await page.evaluate(() => { window.__semRecarregar = true; });

  await itemDaNav(page, 'Conexão com o Anki').click();
  await expect(tituloDaArea(page)).toHaveText('Conexão com o Anki');
  await itemDaNav(page, 'Configurações').click();
  await itemDaNav(page, 'Frases').click();

  await expect(tituloDaArea(page)).toHaveText('Frases mineradas');
  expect(await page.evaluate(() => window.__semRecarregar)).toBe(true);
  await expect(filtroDeFonte(page)).toHaveValue('youtube');
  await expect(paginaAtual(page)).toHaveText('2 de 2');
  await expect(primeira).toBeChecked();
  await expect(page.locator('#selection-count')).toHaveText('1 selecionada');

  await page.reload();
  await expect(filtroDeFonte(page)).toHaveValue('all');
  await expect(paginaAtual(page)).toHaveText('1 de 3');
  await expect(marcarFrase(page).and(page.locator(':checked'))).toHaveCount(0);
});

// ─── Indicadores colados na navegação ────────────────────────────────────────

test('o total de frases fica no item Frases, no formato PT-BR, e acompanha o que é minerado', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: frasesDeExemplo(1284) });
  await abrirPainel(page, extensao, '#configuracoes');

  const item = itemDaNav(page, 'Frases');
  await expect(item.locator('.shell-contador')).toHaveText('1.284');
  await expect(item).toHaveAccessibleDescription('1.284 frases');

  await page.evaluate(() => chrome.runtime.sendMessage({
    type: 'SALVAR_HISTORICO', texto: 'One more for the count.', origem: 'manual', idioma: 'Inglês',
    contexto: { fonte: 'manual', titulo: 'Manual Input', detalhe: '' },
  }));
  await expect(item.locator('.shell-contador')).toHaveText('1.285');
});

test('primeira execução: Frases 0, ponto desligado e o chip “Sem conta”, “Só neste computador”', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await abrirPainel(page, extensao);

  await expect(itemDaNav(page, 'Frases').locator('.shell-contador')).toHaveText('0');
  await expect(itemDaNav(page, 'Frases')).toHaveAccessibleDescription('0 frases');
  await expect(pontoDaConexao(page)).toHaveAttribute('data-estado', 'desligada');
  await expect(itemDaNav(page, 'Conexão com o Anki')).toHaveAttribute('title', 'Conexão com o Anki: desligada');
  await expect(itemDaNav(page, 'Conexão com o Anki')).toHaveAccessibleDescription('Conexão com o Anki: desligada');
  await esperarChipSemConta(page);
});

test('com a conta, o chip mostra o nome e “Sincronizado agora”, e leva a Configurações › Conta & sync', async ({ page, extensao }) => {
  await extensao.semearSessao({ uid: 'uid-chip', displayName: 'Ana Souza' });
  await abrirPainel(page, extensao);

  await expect(chip(page)).toContainText('Ana Souza');
  await expect(chip(page)).toContainText('Sincronizado agora');
  await expect(chip(page).locator('.shell-avatar')).toHaveText('A');

  await chip(page).click();
  await expect(page).toHaveURL(/#configuracoes\/conta$/);
  await expect(tituloDaArea(page)).toHaveText('Configurações');
  await expect(page.getByRole('heading', { name: 'Conta & sync' })).toBeInViewport();
});

test('já em Configurações › Conta & sync, clicar no chip de novo volta ao card', async ({ page, extensao }) => {
  await page.setViewportSize({ width: 1280, height: 260 });
  await abrirPainel(page, extensao, '#configuracoes/conta');
  const conta = page.getByRole('heading', { name: 'Conta & sync' });
  await expect(conta).toBeInViewport();

  await page.mouse.move(640, 200);
  await page.mouse.wheel(0, 2000);
  await expect(conta).not.toBeInViewport();

  await chip(page).click();
  await expect(page).toHaveURL(/#configuracoes\/conta$/);
  await expect(conta).toBeInViewport();
});

test('sem nome no perfil, o chip diz “Conta Google”', async ({ page, extensao }) => {
  await extensao.semearSessao({ uid: 'uid-sem-nome', displayName: '', email: '' });
  await abrirPainel(page, extensao);
  await expect(chip(page)).toContainText('Conta Google');
});

test('enquanto sincroniza, o chip diz “Sincronizando…”; se a nuvem falha, “Sem sincronizar”', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-sync' });
  let liberar;
  const nuvemRespondendo = new Promise(resolve => { liberar = resolve; });
  await page.route(/firestore\.googleapis\.com/, async route => {
    await nuvemRespondendo;
    await route.fulfill({ status: 500, body: '{}' });
  });

  await abrirPainel(page, extensao);
  await expect(chip(page)).toContainText('Sincronizando…');

  liberar();
  await expect(chip(page)).toContainText('Sem sincronizar');
  await expect(chip(page).locator('.shell-chip__estado')).toHaveClass(/shell-chip__estado--erro/);
});

// ─── Conexão com o Anki: estados ─────────────────────────────────────────────

test('enquanto a Conexão não responde, o ponto diz “Conectando ao Anki…”; ligada, diz ligada e não há faixa', async ({ page, extensao, fakes }) => {
  let liberar;
  const respondendo = new Promise(resolve => { liberar = resolve; });
  fakes.anki.responder('GET', '/health', async () => { await respondendo; return { json: { ok: true } }; });

  await abrirPainel(page, extensao, '#anki/custos');
  await expect(pontoDaConexao(page)).toHaveAttribute('data-estado', 'conectando');
  await expect(itemDaNav(page, 'Conexão com o Anki')).toHaveAttribute('title', 'Conectando ao Anki…');

  liberar();
  await expect(pontoDaConexao(page)).toHaveAttribute('data-estado', 'ligada');
  await expect(itemDaNav(page, 'Conexão com o Anki')).toHaveAttribute('title', 'Conexão com o Anki: ligada');
  await expect(faixaF1(page)).toBeHidden();
});

test('com a Conexão desligada, a área dela mostra a faixa F1; “Tentar de novo” com ela ligada tira a faixa', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await abrirPainel(page, extensao, '#anki/custos');

  await expect(faixaF1(page)).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Custos' })).toBeChecked();

  // Em Frases a faixa não aparece: ela é da área da Conexão.
  await itemDaNav(page, 'Frases').click();
  await expect(faixaF1(page)).toBeHidden();
  await itemDaNav(page, 'Conexão com o Anki').click();
  await expect(faixaF1(page)).toBeVisible();

  // Ainda desligada: tentar de novo mantém a faixa.
  await page.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(pontoDaConexao(page)).toHaveAttribute('data-estado', 'desligada');
  await expect(faixaF1(page)).toBeVisible();

  fakes.anki.ligar();
  await page.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(faixaF1(page)).toBeHidden();
  await expect(pontoDaConexao(page)).toHaveAttribute('data-estado', 'ligada');
});

// ─── Trilho ──────────────────────────────────────────────────────────────────

test('abaixo de ~1000 px a sidebar vira trilho, com o ponto do Anki e o avatar visíveis', async ({ page, extensao }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await abrirPainel(page, extensao);
  await expect(itemDaNav(page, 'Frases').locator('.shell-rotulo')).toBeVisible();
  const larga = await page.locator('.shell-lateral').boundingBox();
  expect(larga.width).toBeGreaterThan(200);

  await page.setViewportSize({ width: 900, height: 800 });
  await expect.poll(async () => (await page.locator('.shell-lateral').boundingBox()).width).toBeLessThanOrEqual(80);
  await expect(pontoDaConexao(page)).toBeVisible();
  await expect(chip(page).locator('.shell-avatar')).toBeVisible();

  // Os rótulos somem da tela, mas continuam sendo o nome de cada item.
  const rotulo = await itemDaNav(page, 'Frases').locator('.shell-rotulo').boundingBox();
  expect(rotulo.width).toBeLessThanOrEqual(1);
  await expect(itemDaNav(page, 'Configurações')).toHaveAttribute('title', 'Configurações');
  await expect(chip(page)).toHaveAttribute('title', 'Sem conta · só neste computador');
});

// ─── Bug de #9: nomes de Fonte sem escape ────────────────────────────────────

test('uma Fonte com marcação no nome aparece literal no filtro, e a sidebar não lista Fontes', async ({ page, extensao }) => {
  const fonteHostil = '<img src=x onerror="window.__injetado=1">fonte';
  await extensao.gravarStorage({
    frases: [{ id: 1_700_000_000_001, texto: 'A quiet morning.', data: HOJE, streaming: fonteHostil, idioma: 'Inglês' }],
  });
  await abrirPainel(page, extensao);

  await expect(filtroDeFonte(page).locator('option', { hasText: fonteHostil })).toHaveText(fonteHostil);
  await expect(filtroDeFonte(page).locator('img')).toHaveCount(0);

  await filtroDeFonte(page).selectOption({ label: fonteHostil });
  await expect(page.getByText('A quiet morning.')).toBeVisible();
  // No selo de Fonte do cartão, o nome também entra como texto.
  await expect(cartao(page, 'A quiet morning.').locator('.veio-selo')).toHaveText(fonteHostil);

  await expect(page.locator('.shell-lateral')).not.toContainText('fonte');
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__injetado)).toBeUndefined();
});

// ─── O conteúdo de hoje continua funcionando dentro do shell ─────────────────

test('dentro do shell, Frases lista em cartões e apaga como hoje', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: frasesDeExemplo(3) });
  await abrirPainel(page, extensao);

  await expect(page.locator('#frases-lista .veio-frase')).toHaveCount(3);
  await cartao(page, 'Sentence number 2 ').getByRole('button', { name: 'Apagar frase' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apagar frase' }).click();
  await expect(page.locator('#frases-lista .veio-frase')).toHaveCount(2);
  await expect(itemDaNav(page, 'Frases').locator('.shell-contador')).toHaveText('2');
  await expect.poll(async () => (await extensao.frases()).map(f => f.texto)).toEqual([
    'Sentence number 3 about the harbour.',
    'Sentence number 1 about the harbour.',
  ]);
});

test('dentro do shell, Enviar ao Anki cria o envio, e o acompanhamento continua ao trocar de área', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: frasesDeExemplo(2).map(f => ({ ...f, keywords: ['harbour@8'] })) });
  const envios = [];
  fakes.anki.responder('POST', '/jobs', async req => {
    envios.push(JSON.parse(req.postData()));
    return { json: { jobId: 'job-shell' } };
  });
  fakes.anki.responder('GET', '/jobs', async () => ({
    json: { jobs: [{ jobId: 'job-shell', status: 'running', lang: 'en', state: { status: 'running', stage: 'generate_cards' } }] },
  }));
  await abrirPainel(page, extensao);

  await marcarFrase(page).first().check();
  await page.locator('#btn-send-anki').click();

  await expect(page.locator('#bridge-progress-modal')).toBeVisible();
  expect(envios).toHaveLength(1);
  expect(envios[0].entries).toHaveLength(1);

  await page.locator('#btn-bridge-progress-close').click();
  await itemDaNav(page, 'Configurações').click();
  const leiturasAntes = fakes.anki.requisicoes.filter(r => r.metodo === 'GET' && r.caminho === '/jobs').length;
  await expect.poll(
    () => fakes.anki.requisicoes.filter(r => r.metodo === 'GET' && r.caminho === '/jobs').length,
    { timeout: 8000 },
  ).toBeGreaterThan(leiturasAntes);
});

test('Configurações hospeda Entrar com Google e Apagar tudo de hoje', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: frasesDeExemplo(2) });
  await abrirPainel(page, extensao, '#configuracoes');
  // Os cards começam fechados (resumo primeiro): abre-se Conta & sync e Zona de perigo.
  await page.getByRole('button', { name: 'Conta & sync', exact: true }).click();
  await page.getByRole('button', { name: 'Zona de perigo', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Entrar com Google' })).toBeVisible();

  page.once('dialog', dialogo => dialogo.accept());
  await page.getByRole('button', { name: 'Apagar todas as 2 frases' }).click();
  await expect(itemDaNav(page, 'Frases').locator('.shell-contador')).toHaveText('0');
  await expect(page.getByRole('button', { name: 'Nenhuma frase para apagar' })).toBeDisabled();
  expect(await extensao.frases()).toEqual([]);
});

// ─── Teclado, leitor de tela e movimento ─────────────────────────────────────

test('os controles do shell têm nome, e o foco do teclado aparece', async ({ page, extensao }) => {
  await abrirPainel(page, extensao, '#anki/custos');

  await expect(page.getByRole('button', { name: 'Atualizar' })).toHaveAttribute('title', 'Atualizar (abre o Anki se precisar)');

  await page.getByRole('radio', { name: 'Custos' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/#anki\/baralhos$/);

  await itemDaNav(page, 'Frases').focus();
  await page.keyboard.press('Tab');
  const foco = await page.evaluate(() => {
    const el = document.activeElement;
    return { texto: el.textContent.trim(), contorno: getComputedStyle(el).outlineStyle };
  });
  expect(foco.texto).toMatch(/^Conexão com o Anki/);
  expect(foco.contorno).toBe('solid');
});

test('com movimento reduzido, o cursor da marca, o ponto “conectando” e o flash da seção ficam parados', async ({ page, extensao, fakes }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  fakes.anki.responder('GET', '/health', () => new Promise(() => {}));
  await abrirPainel(page, extensao, '#configuracoes/atalhos');

  const animacao = seletor => page.locator(seletor).first().evaluate(el => getComputedStyle(el).animationName);
  await expect(pontoDaConexao(page)).toHaveAttribute('data-estado', 'conectando');
  expect(await animacao('.shell-marca .veio-cursor')).toBe('none');
  expect(await animacao('.shell-ponto')).toBe('none');
  expect(await animacao('#cfg-atalhos')).toBe('none');
});

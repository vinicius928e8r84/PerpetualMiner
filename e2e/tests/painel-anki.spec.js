'use strict';

const { test, expect } = require('../fixtures');
const { fotografar } = require('../evidencias-mineracao');
const { estadoFinal } = require('../estado-final');
const { AGORA, ENVIOS, custos, azulejos, listaDeEnvios, detalheDoEnvio, abrirAnki } = require('../apoio-dos-custos');

const F1 = 'A Conexão com o Anki está desligada. Ligue-a neste computador e tente de novo.';

const abas = page => page.getByRole('radiogroup', { name: 'Seções da Conexão com o Anki' });
const primeiraVez = page => page.getByRole('region', { name: 'Ainda não houve conexão neste computador' });
const atualizar = page => page.getByRole('button', { name: 'Atualizar', exact: true });
const pedidosDeCustos = fakes => fakes.anki.requisicoes.filter(r => r.caminho === '/analytics/jobs');

async function escolher(page, nome) {
  await page.locator('label.veio-segmentado__opcao').filter({ hasText: new RegExp(`^${nome}$`) }).click();
  await expect(page.getByRole('radio', { name: nome, exact: true })).toBeChecked();
}

test.beforeEach(({ fakes }) => {
  fakes.anki.definirCustos(ENVIOS);
});

test('conectando: a faixa neutra “Conectando ao Anki…” e o esqueleto, até a Conexão responder', async ({ page, extensao, fakes }) => {
  let responder;
  const respondendo = new Promise(r => { responder = r; });
  fakes.anki.responder('GET', '/health', async () => { await respondendo; return { json: { ok: true } }; });
  await abrirAnki(page, extensao);

  const faixa = page.locator('#anki-conectando');
  await expect(faixa).toBeVisible();
  await expect(faixa).toHaveText('Conectando ao Anki…');
  await expect(custos(page).locator('.veio-esqueleto').first()).toBeVisible();
  await expect(page.getByText(F1)).toBeHidden();

  responder();
  await expect(faixa).toBeHidden();
  await expect(listaDeEnvios(page)).toBeVisible();
});

test('cai depois de responder: a F1 e o último dado com o selo BRG-12; Continuar envio fica indisponível', async ({ page, extensao, fakes }) => {
  await abrirAnki(page, extensao);
  await expect(listaDeEnvios(page).getByRole('option')).toHaveCount(4);

  fakes.anki.desligar();
  await page.clock.setFixedTime(new Date(AGORA.getTime() + 2 * 3600_000));
  await atualizar(page).click();

  await expect(page.getByText(F1)).toBeVisible();
  await expect(custos(page)).toContainText('Anki fechado. Mostrando dados de há 2 h.');
  await expect(listaDeEnvios(page).getByRole('option')).toHaveCount(4);
  await expect(primeiraVez(page)).toBeHidden();
  const antigo = page.locator('#anki-custos-antigo');
  await antigo.getByText('Detalhes', { exact: true }).click();
  await expect(antigo.locator('pre')).toContainText('/health');
  for (const nome of ['Hoje', 'Este mês', 'Tudo']) await expect(page.getByRole('radio', { name: nome, exact: true })).toBeDisabled();
  await expect(page.getByLabel('De', { exact: true })).toBeDisabled();

  await listaDeEnvios(page).getByRole('option', { name: /Envio em russo/ }).click();
  const continuar = detalheDoEnvio(page, 'Envio em russo · 4 frases').getByRole('button', { name: 'Continuar envio' });
  await expect(continuar).toHaveAttribute('aria-disabled', 'true');
  await expect(continuar).toHaveAccessibleDescription(/Indisponível: a Conexão com o Anki está desligada/);
  await continuar.click({ force: true });
  expect(fakes.anki.requisicoes.filter(r => r.caminho === '/jobs/retry')).toHaveLength(0);
  const dica = page.locator('#anki-continuar-indisponivel');
  await page.mouse.move(0, 0);
  await expect(dica).toBeHidden();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(continuar).toBeFocused();
  await expect(dica).toBeVisible();

  await escolher(page, 'Baralhos e termos');
  await expect(page.getByRole('button', { name: 'Reparar Anki' })).toHaveCount(0);
  expect((await extensao.lerStorage(['pm_anki_custos'])).pm_anki_custos.envios).toHaveLength(4);
});

test('reabrir o painel com a Conexão desligada mostra o último dado gravado, não o card da primeira vez', async ({ page, extensao, fakes }) => {
  await abrirAnki(page, extensao);
  await expect(listaDeEnvios(page).getByRole('option')).toHaveCount(4);

  fakes.anki.desligar();
  await page.reload();

  await expect(page.getByText(F1)).toBeVisible();
  await expect(custos(page)).toContainText('Anki fechado. Mostrando dados de agora.');
  await expect(listaDeEnvios(page).getByRole('option')).toHaveCount(4);
  await expect(primeiraVez(page)).toBeHidden();
});

test('desligada sem nada gravado: “Custo indisponível”, e o Tentar de novo é só o da F1', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await abrirAnki(page, extensao);

  await expect(page.getByText(F1)).toBeVisible();
  await expect(abas(page)).toBeVisible();
  await expect(custos(page)).toContainText('Custo indisponível');
  await expect(custos(page).getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Tentar de novo' })).toHaveCount(1);
  expect(pedidosDeCustos(fakes)).toHaveLength(0);
});

test('carregando: “Somando os custos…” e o esqueleto enquanto a leitura não volta', async ({ page, extensao, fakes }) => {
  let soltar;
  const segurando = new Promise(r => { soltar = r; });
  fakes.anki.responder('POST', '/analytics/jobs', async () => { await segurando; return { json: { jobs: [] } }; });
  await abrirAnki(page, extensao);

  await expect(custos(page).getByText('Somando os custos…')).toBeVisible();
  await expect(custos(page).locator('.veio-esqueleto').first()).toBeVisible();
  soltar();
  await expect(custos(page).getByText('Somando os custos…')).toBeHidden();
});

test('erro na leitura de custos: BRG-04 inline com Tentar de novo e Detalhes, diferente do carregando (#9)', async ({ page, extensao, fakes }) => {
  fakes.anki.falharCustos({ status: 503 });
  await abrirAnki(page, extensao);

  const aviso = custos(page).getByRole('alert');
  await expect(aviso).toContainText('Não deu para carregar os custos. Confira se a Conexão com o Anki está ligada.');
  await expect(custos(page)).toContainText('Custo indisponível');
  await expect(custos(page).getByText('Somando os custos…')).toBeHidden();
  await expect(custos(page).locator('.veio-esqueleto')).toHaveCount(0);
  await expect(custos(page).locator('#anki-custos-corpo')).not.toContainText('US$ 0,00');
  await aviso.getByText('Detalhes').click();
  await expect(aviso.locator('pre')).toContainText('503');

  fakes.anki.voltarCustos();
  await aviso.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(custos(page).getByRole('alert')).toHaveCount(0);
  await expect(listaDeEnvios(page).getByRole('option')).toHaveCount(4);
  await expect.poll(async () => (await extensao.lerStorage(['pm_anki_custos'])).pm_anki_custos?.envios.length).toBe(4);
});

test('vazio: BRG-22 com “Ver tudo”, que troca o período para Tudo', async ({ page, extensao, fakes }) => {
  fakes.anki.definirCustos([ENVIOS[4]]);
  await abrirAnki(page, extensao);

  await expect(custos(page)).toContainText('Nenhum envio neste período.');
  await custos(page).getByRole('button', { name: 'Ver tudo' }).click();

  await expect(page.getByRole('radio', { name: 'Tudo' })).toBeChecked();
  await expect(listaDeEnvios(page).getByRole('option')).toHaveCount(1);
  const ultimo = pedidosDeCustos(fakes).at(-1);
  expect(ultimo.dados).toEqual({ lang: 'all' });
  await estadoFinal(extensao, { pm_anki_custos: { periodo: 'tudo', de: '', ate: '' } });
});

test('o período abre em Este mês; Hoje e De/Até pedem as datas certas', async ({ page, extensao, fakes }) => {
  await abrirAnki(page, extensao);
  await expect(page.getByRole('radio', { name: 'Este mês' })).toBeChecked();
  await expect.poll(() => pedidosDeCustos(fakes).at(-1)?.dados).toEqual({ lang: 'all', from: '2026-09-01', to: '2026-09-18' });

  await escolher(page, 'Hoje');
  await expect.poll(() => pedidosDeCustos(fakes).at(-1).dados).toEqual({ lang: 'all', from: '2026-09-18', to: '2026-09-18' });
  await expect(listaDeEnvios(page).getByRole('option')).toHaveCount(3);

  await page.getByLabel('De', { exact: true }).fill('2026-07-01');
  await expect.poll(() => pedidosDeCustos(fakes).at(-1).dados).toMatchObject({ from: '2026-07-01' });
  await expect(page.getByRole('radio', { name: 'Hoje' })).not.toBeChecked();
  await estadoFinal(extensao, { pm_anki_custos: { periodo: 'datas', de: '2026-07-01' } });
});

// Exceção de teste: sem-estado-guardado — o idioma escolhido nos azulejos só filtra a tela; nada é gravado.
test('azulejos por idioma com total e envios; o escolhido filtra o resumo, as imagens e a lista', async ({ page, extensao }) => {
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.route('http://127.0.0.1:8766/analytics/jobs', async route => {
    await new Promise(resolve => setTimeout(resolve, 500));
    await route.fallback();
  });
  await abrirAnki(page, extensao);

  await expect(azulejos(page).getByRole('button')).toHaveCount(3);
  const [todos, ingles, russo] = await azulejos(page).getByRole('button').all();
  await expect(todos).toHaveAttribute('aria-pressed', 'true');
  await expect(todos).toContainText('Todos os idiomas');
  await expect(todos).toContainText('EN + RU');
  await expect(ingles).toContainText('EN');
  await expect(russo).toContainText('RU');
  await expect(todos).toContainText('US$ 0,15');
  await expect(todos).toContainText('4 envios');
  await expect(ingles).toContainText('US$ 0,11');
  await expect(ingles).toContainText('3 envios');
  await expect(russo).toContainText('US$ 0,05');
  await expect(russo).toContainText('1 envio');

  const faixa = page.locator('#anki-custos-faixa');
  await expect(faixa).toContainText('Criação de cartões US$ 0,13');
  await expect(faixa).toContainText('Imagens geradas US$ 0,01');
  await expect(faixa).toContainText('Economia com fotos reais US$ 0,15');
  await expect(faixa).toContainText('Frases 15 de 25');
  await expect(faixa).toContainText('Envios concluídos 1 de 4');
  await expect(page.locator('#anki-custos-imagens')).toContainText('18 imagens');
  await page.evaluate(() => document.fonts.ready);
  await fotografar(page, 'anki-azulejos-todos.png');

  await russo.click();
  await expect(russo).toHaveAttribute('aria-pressed', 'true');
  await expect(todos).toHaveAttribute('aria-pressed', 'false');
  await expect(listaDeEnvios(page).getByRole('option')).toHaveCount(1);
  await expect(faixa).toContainText('Frases 3 de 4');
  await expect(page.locator('#anki-custos-imagens')).toContainText('4 imagens');
  await expect(page.locator('#anki-custos-imagens')).toContainText('Gerada por IA');
  await fotografar(page, 'anki-azulejos-russo.png');
});

test('↻ Atualizar com a Conexão desligada não pede os baralhos; ligada, pede e deixa abrir o Anki (BRG-24)', async ({ page, extensao, fakes }) => {
  const pedidosDeBaralhos = () => fakes.anki.requisicoes.filter(r => r.caminho === '/anki/stats/decks' && r.dados.refresh === true);
  await abrirAnki(page, extensao);
  await expect(listaDeEnvios(page).getByRole('option')).toHaveCount(4);
  await expect(atualizar(page)).toHaveAttribute('title', 'Atualizar (abre o Anki se precisar)');

  fakes.anki.desligar();
  await atualizar(page).click();
  await expect(page.getByText(F1)).toBeVisible();
  expect(pedidosDeBaralhos()).toHaveLength(0);

  fakes.anki.ligar();
  await atualizar(page).click();
  await expect(page.getByText(F1)).toBeHidden();
  await expect.poll(() => pedidosDeBaralhos().length).toBe(1);
  expect(pedidosDeBaralhos()[0].dados.launch).toBe(true);
  await estadoFinal(extensao, { pm_anki_custos: { periodo: 'mes', de: '2026-09-01', ate: '2026-09-18' } });
});

// Exceção de teste: sem-estado-guardado — com a Conexão desligada, o Atualizar não lê nem grava nada.
test('Ajustes de envio com a Conexão desligada: continuam editáveis, com a nota de que valem no próximo envio', async ({ page, extensao, fakes }) => {
  const nota = 'Os ajustes continuam editáveis com a conexão desligada. Valem a partir do próximo envio.';
  await abrirAnki(page, extensao, { hash: '#anki/ajustes' });
  await expect(page.getByRole('textbox', { name: 'Baralho' })).toBeVisible();
  await expect(page.getByText(nota)).toBeHidden();

  fakes.anki.desligar();
  await atualizar(page).click();
  await expect(page.getByText(nota)).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Baralho' })).toBeEditable();
});

// Exceção de teste: sem-estado-guardado — o foco e as setas só andam pela tela; nada é gravado.
test('os controles de Custos têm nome e foco visível; a lista anda com as setas', async ({ page, extensao }) => {
  await abrirAnki(page, extensao);
  await expect(listaDeEnvios(page).getByRole('option')).toHaveCount(4);

  await page.getByRole('radio', { name: 'Este mês' }).focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  const periodo = page.locator('.veio-segmentado__opcao', { has: page.getByRole('radio', { name: 'Este mês' }) });
  await expect(periodo).toHaveCSS('outline-style', 'solid');

  const primeira = listaDeEnvios(page).getByRole('option').first();
  await primeira.focus();
  await expect(primeira).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('ArrowDown');
  const segunda = listaDeEnvios(page).getByRole('option').nth(1);
  await expect(segunda).toBeFocused();
  await expect(segunda).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Até', { exact: true })).toBeVisible();
});

test('com movimento reduzido, o ponto da faixa “Conectando” e o esqueleto ficam parados', async ({ page, extensao, fakes }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  fakes.anki.responder('GET', '/health', () => new Promise(() => {}));
  await abrirAnki(page, extensao);

  await expect(page.locator('#anki-conectando')).toBeVisible();
  await expect(page.locator('#anki-conectando .anki-ponto')).toHaveCSS('animation-name', 'none');
  await expect(custos(page).locator('.veio-esqueleto').first()).toHaveCSS('animation-name', 'none');
});

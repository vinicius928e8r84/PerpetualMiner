'use strict';

// Conexão com o Anki (#33): a área por idioma, os estados da conexão e a aba Custos
// (docs/design/painel/anki/, variante C). A Conexão é o fake da fronteira HTTP
// (fakes/anki.js): /health diz se ela está ligada, GET /analytics/jobs traz os
// Envios do período no formato do bridge. Os testes afirmam o que a pessoa vê e o
// que fica gravado.

const { test, expect } = require('../fixtures');
const { fotografar } = require('../evidencias-mineracao');

const AGORA = new Date('2026-09-18T12:00:00');

// Setembro tem 4 Envios (3 em inglês, 1 em russo); o de julho só entra em “Tudo”.
const ENVIOS = [
  {
    jobId: 'job-en-concluido', lang: 'en', createdAt: '2026-09-18T11:00:00', status: 'completed', pedidas: 12,
    custos: { cartoes: 0.0810, escolha: 0.0021, triagem: 0.0011 }, imagens: { real: 11, sem: 1 }, economia: 0.15,
  },
  {
    jobId: 'job-ru-parte', lang: 'ru', createdAt: '2026-09-18T09:00:00', status: 'partial', pedidas: 4, enviadas: 3,
    custos: { cartoes: 0.0270, geradas: 0.0120, escolha: 0.0008, triagem: 0.0004, outros: 0.0050 },
    imagens: { real: 1, geradas: 2, falhas: 1 },
    lastError: 'HTTP 502 · AnkiConnect: collection is not available',
  },
  {
    jobId: 'job-en-andando', lang: 'en', createdAt: '2026-09-18T11:50:00', status: 'running', stage: 'generate_images', pedidas: 6,
    custos: { cartoes: 0.0141 }, imagens: { real: 2 },
  },
  {
    jobId: 'job-en-falhou', lang: 'en', createdAt: '2026-09-17T20:00:00', status: 'failed', pedidas: 3,
    custos: { cartoes: 0.0110 }, lastError: 'HTTP 500 · Falha ao criar job EN',
  },
  {
    jobId: 'job-ru-julho', lang: 'ru', createdAt: '2026-07-10T10:00:00', status: 'completed', pedidas: 20,
    custos: { cartoes: 0.1130 }, imagens: { real: 12 },
  },
];

const F1 = 'A conexão com o Anki está desligada. Ligue-a neste computador e tente de novo.';

const custos = page => page.locator('#anki-custos');
const abas = page => page.getByRole('radiogroup', { name: 'Seções da Conexão com o Anki' });
const azulejos = page => page.getByRole('group', { name: 'Idioma dos custos' });
const listaDeEnvios = page => page.getByRole('listbox', { name: 'Envios recentes' });
const detalheDoEnvio = (page, titulo) => page.getByRole('region', { name: titulo });
const primeiraVez = page => page.getByRole('region', { name: 'Ainda não houve conexão neste computador' });
const atualizar = page => page.getByRole('button', { name: 'Atualizar', exact: true });
const pedidosDeCustos = fakes => fakes.anki.requisicoes.filter(r => r.caminho === '/analytics/jobs');
// A camada principal de Custos: tudo menos o Avançado, que sempre mostra 4 casas.
const camadaPrincipal = page => page.locator('#anki-custos-azulejos, #anki-custos-corpo');

/** O rádio é escondido pelo controle segmentado: quem recebe o clique é o rótulo. */
async function escolher(page, nome) {
  await page.locator('label.veio-segmentado__opcao').filter({ hasText: new RegExp(`^${nome}$`) }).click();
  await expect(page.getByRole('radio', { name: nome, exact: true })).toBeChecked();
}

/** Liga ou desliga uma chave do Avançado como a pessoa faz: clicando no rótulo. */
async function usarChave(page, nome, ligada) {
  await page.getByText(nome, { exact: true }).click();
  await expect(page.getByRole('checkbox', { name: nome })).toBeChecked({ checked: ligada });
}

async function abrirAnki(page, extensao, { hash = '#anki/custos', jaConectou = true, gravado = {} } = {}) {
  if (jaConectou) await extensao.gravarStorage({ pm_anki_ja_conectou: true });
  if (Object.keys(gravado).length) await extensao.gravarStorage(gravado);
  await page.clock.setFixedTime(AGORA);
  await page.goto(extensao.url(`painel.html${hash}`));
}

test.beforeEach(({ fakes }) => {
  fakes.anki.definirCustos(ENVIOS);
});

// ─── Estados da conexão ──────────────────────────────────────────────────────

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

test('cai depois de responder: a F1 e o último dado com o selo BRG-12; Continuar envio e Reparar Anki ficam indisponíveis', async ({ page, extensao, fakes }) => {
  await abrirAnki(page, extensao);
  await expect(listaDeEnvios(page).getByRole('option')).toHaveCount(4);

  fakes.anki.desligar();
  await page.clock.setFixedTime(new Date(AGORA.getTime() + 2 * 3600_000));
  await atualizar(page).click();

  await expect(page.getByText(F1)).toBeVisible();
  await expect(custos(page)).toContainText('Anki fechado. Mostrando dados de há 2 h.');
  await expect(listaDeEnvios(page).getByRole('option')).toHaveCount(4);
  await expect(primeiraVez(page)).toBeHidden();
  // O código fica em Detalhes; e outro período não teria de onde vir.
  const antigo = page.locator('#anki-custos-antigo');
  await antigo.getByText('Detalhes', { exact: true }).click();
  await expect(antigo.locator('pre')).toContainText('/health');
  for (const nome of ['Hoje', 'Este mês', 'Tudo']) await expect(page.getByRole('radio', { name: nome, exact: true })).toBeDisabled();
  await expect(page.getByLabel('De', { exact: true })).toBeDisabled();

  await listaDeEnvios(page).getByRole('option', { name: /Envio em russo/ }).click();
  const continuar = detalheDoEnvio(page, 'Envio em russo · 4 frases').getByRole('button', { name: 'Continuar envio' });
  await expect(continuar).toHaveAttribute('aria-disabled', 'true');
  await expect(continuar).toHaveAccessibleDescription(/Indisponível: a conexão com o Anki está desligada/);
  // aria-disabled deixa o botão no Tab (a dica diz por quê), mas apertar não faz nada.
  await continuar.click({ force: true });
  expect(fakes.anki.requisicoes.filter(r => r.caminho.endsWith('/retry'))).toHaveLength(0);
  // O clique não deixa a dica presa: com o mouse fora ela some, e pelo teclado ela volta.
  const dica = page.locator('#anki-continuar-indisponivel');
  await page.mouse.move(0, 0);
  await expect(dica).toBeHidden();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(continuar).toBeFocused();
  await expect(dica).toBeVisible();

  // Reparar Anki mora no Avançado de Baralhos e termos (painel-anki-baralhos.spec.js).
  await escolher(page, 'Baralhos e termos');
  await page.locator('#anki-baralhos-avancado').getByText('Avançado', { exact: true }).click();
  const reparar = page.getByRole('button', { name: 'Reparar Anki' });
  await expect(reparar).toHaveAttribute('aria-disabled', 'true');
  await expect(reparar).toHaveAccessibleDescription(/para reparar o Anki/);
  fakes.anki.ligar();
  await atualizar(page).click();
  await expect(reparar).not.toHaveAttribute('aria-disabled');
  await expect(reparar).not.toHaveAttribute('aria-describedby');
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

// ─── Custos: carregando, erro, vazio ─────────────────────────────────────────

test('carregando: “Somando os custos…” e o esqueleto enquanto a leitura não volta', async ({ page, extensao, fakes }) => {
  let soltar;
  const segurando = new Promise(r => { soltar = r; });
  fakes.anki.responder('GET', '/analytics/jobs', async () => { await segurando; return { json: { jobs: [] } }; });
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
  await expect(aviso).toContainText('Não deu para carregar os custos. Confira se a conexão com o Anki está ligada.');
  await expect(custos(page)).toContainText('Custo indisponível');
  // O erro não tem a cara do carregando: nem a linha de espera, nem o esqueleto.
  await expect(custos(page).getByText('Somando os custos…')).toBeHidden();
  await expect(custos(page).locator('.veio-esqueleto')).toHaveCount(0);
  await expect(custos(page)).not.toContainText('US$ 0,00');
  await aviso.getByText('Detalhes').click();
  await expect(aviso.locator('pre')).toContainText('503');

  fakes.anki.voltarCustos();
  await aviso.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(custos(page).getByRole('alert')).toHaveCount(0);
  await expect(listaDeEnvios(page).getByRole('option')).toHaveCount(4);
});

test('vazio: BRG-22 com “Ver tudo”, que troca o período para Tudo', async ({ page, extensao, fakes }) => {
  fakes.anki.definirCustos([ENVIOS[4]]);
  await abrirAnki(page, extensao);

  await expect(custos(page)).toContainText('Nenhum envio neste período.');
  await custos(page).getByRole('button', { name: 'Ver tudo' }).click();

  await expect(page.getByRole('radio', { name: 'Tudo' })).toBeChecked();
  await expect(listaDeEnvios(page).getByRole('option')).toHaveCount(1);
  const ultimo = pedidosDeCustos(fakes).at(-1);
  expect(ultimo.busca).not.toContain('from=');
});

// ─── Custos: período, azulejos, resumo, envios ───────────────────────────────

test('o período abre em Este mês; Hoje e De/Até pedem as datas certas', async ({ page, extensao, fakes }) => {
  await abrirAnki(page, extensao);
  await expect(page.getByRole('radio', { name: 'Este mês' })).toBeChecked();
  await expect.poll(() => pedidosDeCustos(fakes).at(-1)?.busca).toContain('from=2026-09-01&to=2026-09-18');

  await escolher(page, 'Hoje');
  await expect.poll(() => pedidosDeCustos(fakes).at(-1).busca).toContain('from=2026-09-18&to=2026-09-18');
  await expect(listaDeEnvios(page).getByRole('option')).toHaveCount(3);

  await page.getByLabel('De', { exact: true }).fill('2026-07-01');
  await expect.poll(() => pedidosDeCustos(fakes).at(-1).busca).toContain('from=2026-07-01');
  await expect(page.getByRole('radio', { name: 'Hoje' })).not.toBeChecked();
});

test('azulejos por idioma com total e envios; o escolhido filtra o resumo, as imagens e a lista', async ({ page, extensao }) => {
  await page.setViewportSize({ width: 1280, height: 1100 });
  // Atrasa a leitura na fronteira HTTP: pegar os botões cedo não pode passar por sorte.
  await page.route('http://127.0.0.1:8766/analytics/jobs?**', async route => {
    await new Promise(resolve => setTimeout(resolve, 500));
    await route.fallback();
  });
  await abrirAnki(page, extensao);

  // Os azulejos só aparecem com os dados lidos: esperar por eles antes de pegar os botões.
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

test('lista × detalhe: o envio em parte mostra o que não entrou, Detalhes e Continuar envio, que retoma', async ({ page, extensao, fakes }) => {
  await abrirAnki(page, extensao);

  const opcoes = listaDeEnvios(page).getByRole('option');
  await expect(opcoes.first()).toHaveAttribute('aria-selected', 'true');
  await expect(opcoes.filter({ hasText: 'Envio em inglês · 6 frases' })).toContainText('há 10 min');
  await expect(opcoes.filter({ hasText: 'Envio em inglês · 3 frases' })).toContainText('ontem');

  await opcoes.filter({ hasText: 'Envio em russo' }).click();
  const detalhe = detalheDoEnvio(page, 'Envio em russo · 4 frases');
  await expect(detalhe).toContainText('Concluído em parte · 3 de 4 frases');
  await expect(detalhe).toContainText('1 não entrou');
  await detalhe.getByText('Detalhes').click();
  await expect(detalhe.locator('pre')).toContainText('collection is not available');

  await detalhe.getByRole('button', { name: 'Continuar envio' }).click();
  await expect(page.getByText('Envio retomado')).toBeVisible();
  expect(fakes.anki.requisicoes.filter(r => r.caminho === '/jobs/job-ru-parte/retry')).toHaveLength(1);
});

test('Continuar envio que falha: ENV-14 no detalhe, com a causa em Detalhes, sem toast', async ({ page, extensao, fakes }) => {
  fakes.anki.responder('POST', '/jobs/job-ru-parte/retry', () => ({ status: 500, json: { error: 'retry_failed' } }));
  await abrirAnki(page, extensao);
  await listaDeEnvios(page).getByRole('option', { name: /Envio em russo/ }).click();
  const detalhe = detalheDoEnvio(page, 'Envio em russo · 4 frases');

  await detalhe.getByRole('button', { name: 'Continuar envio' }).click();

  await expect(detalhe).toContainText('Não deu para retomar o envio. Confira se a conexão com o Anki está ligada.');
  await detalhe.getByText('Detalhes', { exact: true }).click();
  await expect(detalhe.locator('pre')).toContainText('HTTP 500');
  await expect(detalhe.locator('pre')).toContainText('collection is not available');
  await expect(page.locator('.veio-toast')).toHaveCount(0);
});

test('só o envio em parte ou que não concluiu tem Continuar envio; o em andamento diz a etapa', async ({ page, extensao }) => {
  await abrirAnki(page, extensao);
  const opcoes = listaDeEnvios(page).getByRole('option');

  await opcoes.filter({ hasText: 'Envio em inglês · 6 frases' }).click();
  const andando = detalheDoEnvio(page, 'Envio em inglês · 6 frases');
  await expect(andando).toContainText('Enviando… · Escolhendo imagens');
  await expect(andando.getByRole('button', { name: 'Continuar envio' })).toHaveCount(0);

  await opcoes.filter({ hasText: 'Envio em inglês · 12 frases' }).click();
  const concluido = detalheDoEnvio(page, 'Envio em inglês · 12 frases');
  await expect(concluido).toContainText('Concluído');
  await expect(concluido.getByRole('button', { name: 'Continuar envio' })).toHaveCount(0);

  await opcoes.filter({ hasText: 'Envio em inglês · 3 frases' }).click();
  const falhou = detalheDoEnvio(page, 'Envio em inglês · 3 frases');
  await expect(falhou).toContainText('Não concluído');
  await expect(falhou.getByRole('button', { name: 'Continuar envio' })).toBeVisible();
});

test('o total do envio bate com a soma das partes, inclusive os outros custos (#9)', async ({ page, extensao }) => {
  await abrirAnki(page, extensao, { gravado: { pm_anki_quatro_casas: true } });
  await listaDeEnvios(page).getByRole('option', { name: /Envio em russo/ }).click();

  const detalhe = detalheDoEnvio(page, 'Envio em russo · 4 frases');
  const partes = detalhe.locator('dl');
  await expect(partes).toContainText('Outros custos');
  const valores = await partes.locator('dd').allTextContents();
  const numero = texto => Number(texto.replace('US$', '').replace(/\s/g, '').replace(',', '.'));
  const [total, ...resto] = valores.map(numero).reverse();
  expect(total).toBeCloseTo(0.0452, 4);
  expect(resto.reduce((a, b) => a + b, 0)).toBeCloseTo(total, 4);
});

// ─── Dinheiro, chaves do Avançado e diagnóstico ──────────────────────────────

test('dinheiro com 2 casas e “< US$ 0,01”; a chave 4 casas passa tudo a 4 casas, e fica lembrada', async ({ page, extensao }) => {
  await abrirAnki(page, extensao);
  await listaDeEnvios(page).getByRole('option', { name: /Envio em russo/ }).click();
  const detalhe = detalheDoEnvio(page, 'Envio em russo · 4 frases');
  await expect(detalhe.locator('dl')).toContainText('Escolha e triagem< US$ 0,01');
  for (const parte of await camadaPrincipal(page).all()) await expect(parte).not.toContainText(/US\$ \d+,\d{4}/);

  await custos(page).getByText('Avançado').click();
  await expect(page.getByRole('checkbox', { name: 'Mostrar custos com 4 casas' })).not.toBeChecked();
  await usarChave(page, 'Mostrar custos com 4 casas', true);

  await expect(azulejos(page)).toContainText('US$ 0,1545');
  await expect(detalhe.locator('dl')).toContainText('Escolha e triagemUS$ 0,0012');
  await expect(page.locator('#anki-custos-faixa')).toContainText('US$ 0,1331');
  await expect(custos(page)).not.toContainText('< US$ 0,01');
  await expect.poll(async () => (await extensao.lerStorage('pm_anki_quatro_casas')).pm_anki_quatro_casas).toBe(true);

  await page.reload();
  await expect(azulejos(page)).toContainText('US$ 0,1545');

  await custos(page).getByText('Avançado').click();
  await usarChave(page, 'Mostrar custos com 4 casas', false);
  await expect(azulejos(page)).toContainText('US$ 0,15');
  await expect(azulejos(page)).not.toContainText('US$ 0,1545');
});

test('os IDs dos envios só aparecem com a chave ligada, e ela fica lembrada', async ({ page, extensao }) => {
  await abrirAnki(page, extensao);
  await expect(listaDeEnvios(page).getByRole('option')).toHaveCount(4);
  await expect(listaDeEnvios(page)).not.toContainText('job-ru-parte');

  await custos(page).getByText('Avançado').click();
  await usarChave(page, 'Mostrar IDs dos envios', true);
  await expect(listaDeEnvios(page)).toContainText('job-ru-parte');
  await expect.poll(async () => (await extensao.lerStorage('pm_anki_ids_dos_envios')).pm_anki_ids_dos_envios).toBe(true);

  await page.reload();
  await expect(listaDeEnvios(page)).toContainText('job-ru-parte');
});

test('o Avançado mostra escolha e triagem com 4 casas e baixa o diagnóstico de um envio', async ({ page, extensao }) => {
  await abrirAnki(page, extensao);
  await custos(page).getByText('Avançado').click();
  const avancado = page.locator('#anki-custos-avancado');
  await expect(avancado).toContainText('Escolha de imagemUS$ 0,0029');
  await expect(avancado).toContainText('Triagem de imagemUS$ 0,0015');
  await expect(avancado).toContainText('Total com 4 casasUS$ 0,1545');

  const baixando = page.waitForEvent('download');
  await avancado.getByRole('row', { name: /Envio em russo/ }).getByRole('button', { name: 'Baixar diagnóstico' }).click();
  const download = await baixando;
  expect(download.suggestedFilename()).toBe('diagnostico-job-ru-parte.json');
  await expect(page.locator('.veio-toast')).toHaveCount(0);
});

// ─── As outras abas, o teclado e o movimento ─────────────────────────────────

test('com 4 casas, um valor abaixo de US$ 0,0001 diz “< US$ 0,0001”, nunca “US$ 0,0000”', async ({ page, extensao, fakes }) => {
  fakes.anki.definirCustos([{
    jobId: 'job-minimo', lang: 'en', createdAt: '2026-09-18T11:00:00', status: 'completed', pedidas: 2,
    custos: { cartoes: 0.0200, triagem: 0.00003 },
  }]);
  await abrirAnki(page, extensao, { gravado: { pm_anki_quatro_casas: true } });

  const detalhe = detalheDoEnvio(page, 'Envio em inglês · 2 frases');
  await expect(detalhe.locator('dl')).toContainText('Escolha e triagem< US$ 0,0001');
  await expect(detalhe.locator('dl')).toContainText('Imagens geradasUS$ 0,0000');
  await expect(detalhe.locator('dl')).toContainText('TotalUS$ 0,0200');
});

test('↻ Atualizar com a Conexão desligada não pede os baralhos; ligada, pede e deixa abrir o Anki (BRG-24)', async ({ page, extensao, fakes }) => {
  const pedidosDeBaralhos = () => fakes.anki.requisicoes.filter(r => r.caminho === '/anki/stats/decks' && r.busca.includes('refresh=1'));
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
  expect(pedidosDeBaralhos()[0].busca).toContain('launch=1');
});

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

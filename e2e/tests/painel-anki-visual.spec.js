'use strict';

// Referência visual da Conexão com o Anki (#33): os estados da conexão e a aba
// Custos na arrumação C · Por idioma do protótipo travado
// (docs/design/painel/anki/prototipo-anki.html?variant=C, “⚙ Estados do
// protótipo”). O dono revisa estas telas lado a lado com o protótipo; depois de
// aprovadas, uma mudança visual faz o teste falhar até alguém olhar e atualizar
// a referência:
//
//   cd e2e && npx playwright test painel-anki-visual --update-snapshots

const { test, expect } = require('../fixtures');

const AGORA = new Date('2026-09-18T12:00:00');

const ENVIOS = [
  {
    jobId: 'job_8f2c1a', lang: 'en', createdAt: '2026-09-18T11:00:00', status: 'completed', pedidas: 12,
    custos: { cartoes: 0.0810, escolha: 0.0021, triagem: 0.0011 }, imagens: { real: 11, sem: 1 }, economia: 0.15,
  },
  {
    jobId: 'job_7d19e0', lang: 'ru', createdAt: '2026-09-18T09:00:00', status: 'partial', pedidas: 4, enviadas: 3,
    custos: { cartoes: 0.0270, geradas: 0.0120, escolha: 0.0008, triagem: 0.0004 }, imagens: { real: 1, geradas: 2, falhas: 1 },
    lastError: 'HTTP 502 · AnkiConnect: collection is not available',
  },
  {
    jobId: 'job_77b3c9', lang: 'en', createdAt: '2026-09-17T15:00:00', status: 'completed', pedidas: 8,
    custos: { cartoes: 0.0540, geradas: 0.0240, escolha: 0.0013, triagem: 0.0007 }, imagens: { real: 5, geradas: 2, sem: 1 }, economia: 0.07,
  },
  {
    jobId: 'job_6a02ff', lang: 'en', createdAt: '2026-09-17T21:40:00', status: 'failed', pedidas: 3,
    custos: { cartoes: 0.0110 }, lastError: 'HTTP 500 · Falha ao criar job EN',
  },
  {
    jobId: 'job_5c4410', lang: 'en', createdAt: '2026-09-15T10:00:00', status: 'completed', pedidas: 30,
    custos: { cartoes: 0.1720, geradas: 0.0480, escolha: 0.0031, triagem: 0.0015 }, imagens: { real: 24, geradas: 4, sem: 2 }, economia: 0.33,
  },
];

const custos = page => page.locator('#anki-custos');
const listaDeEnvios = page => page.getByRole('listbox', { name: 'Envios recentes' });
// A sidebar é a do shell, que tem a própria referência: aqui só a ilha da área.
const ilha = page => page.locator('.shell-conteudo');

test.beforeEach(({ fakes }) => {
  fakes.anki.definirCustos(ENVIOS);
});

async function abrirAnki(page, extensao, { largura = 1280, jaConectou = true, gravado = {} } = {}) {
  await extensao.gravarStorage({ pm_anki_ja_conectou: jaConectou, ...gravado });
  await page.clock.setFixedTime(AGORA);
  await page.setViewportSize({ width: largura, height: 1100 });
  await page.goto(extensao.url('painel.html#anki/custos'));
  await page.evaluate(() => document.fonts.ready);
}

test('Custos com a Conexão ligada: período, azulejos, resumo, imagens e lista × detalhe', async ({ page, extensao }) => {
  await abrirAnki(page, extensao);
  await expect(listaDeEnvios(page).getByRole('option')).toHaveCount(5);

  await expect(ilha(page)).toHaveScreenshot('anki-custos.png');
});

test('o envio em parte no detalhe, com Detalhes aberto e Continuar envio', async ({ page, extensao }) => {
  await abrirAnki(page, extensao);
  await listaDeEnvios(page).getByRole('option', { name: /Envio em russo/ }).click();
  await custos(page).locator('.anki-detalhe').getByText('Detalhes', { exact: true }).click();

  await expect(ilha(page)).toHaveScreenshot('anki-envio-em-parte.png');
});

test('o Avançado aberto, com 4 casas e os IDs ligados', async ({ page, extensao }) => {
  await abrirAnki(page, extensao, { gravado: { pm_anki_quatro_casas: true, pm_anki_ids_dos_envios: true } });
  await expect(listaDeEnvios(page).getByRole('option')).toHaveCount(5);
  await custos(page).getByText('Avançado', { exact: true }).click();
  await custos(page).locator('#anki-custos-avancado').scrollIntoViewIfNeeded();

  await expect(ilha(page)).toHaveScreenshot('anki-avancado.png');
});

test('conectando: a faixa neutra e o esqueleto', async ({ page, extensao, fakes }) => {
  fakes.anki.responder('GET', '/health', () => new Promise(() => {}));
  await abrirAnki(page, extensao);
  await expect(page.locator('#anki-conectando')).toBeVisible();

  await expect(ilha(page)).toHaveScreenshot('anki-conectando.png', { animations: 'disabled' });
});

test('nunca conectada: a F1 e o card ONB-16 no lugar das abas', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await abrirAnki(page, extensao, { jaConectou: false });
  await expect(page.locator('#anki-primeira-vez')).toBeVisible();
  await page.locator('#anki-primeira-vez').getByText('Detalhes', { exact: true }).click();

  await expect(ilha(page)).toHaveScreenshot('anki-nunca-conectada.png');
});

test('desligada: a F1, o último dado com o selo BRG-12 e Continuar envio indisponível com a dica', async ({ page, extensao, fakes }) => {
  await abrirAnki(page, extensao);
  await expect(listaDeEnvios(page).getByRole('option')).toHaveCount(5);
  fakes.anki.desligar();
  await page.clock.setFixedTime(new Date(AGORA.getTime() + 2 * 3600_000));
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await expect(custos(page)).toContainText('Mostrando dados de há 2 h.');
  await listaDeEnvios(page).getByRole('option', { name: /Envio em russo/ }).click();
  await custos(page).getByRole('button', { name: 'Continuar envio' }).focus();

  await expect(ilha(page)).toHaveScreenshot('anki-desligada.png');
});

test('erro na leitura: Custo indisponível e BRG-04 com Tentar de novo', async ({ page, extensao, fakes }) => {
  fakes.anki.falharCustos({ status: 503 });
  await abrirAnki(page, extensao);
  await expect(custos(page).getByRole('alert')).toBeVisible();

  await expect(ilha(page)).toHaveScreenshot('anki-erro.png');
});

test('carregando: “Somando os custos…” e o esqueleto', async ({ page, extensao, fakes }) => {
  fakes.anki.responder('GET', '/analytics/jobs', () => new Promise(() => {}));
  await abrirAnki(page, extensao);
  await expect(custos(page).getByText('Somando os custos…')).toBeVisible();

  await expect(ilha(page)).toHaveScreenshot('anki-carregando.png', { animations: 'disabled' });
});

test('vazio: BRG-22 com Ver tudo', async ({ page, extensao, fakes }) => {
  fakes.anki.definirCustos([]);
  await abrirAnki(page, extensao);
  await expect(custos(page)).toContainText('Nenhum envio neste período.');

  await expect(ilha(page)).toHaveScreenshot('anki-vazio.png');
});

test('janela estreita: tudo numa coluna, o detalhe abaixo da lista', async ({ page, extensao }) => {
  await abrirAnki(page, extensao, { largura: 760 });
  await expect(listaDeEnvios(page).getByRole('option')).toHaveCount(5);

  await expect(page).toHaveScreenshot('anki-estreita.png', { fullPage: false });
});

test('o tema claro', async ({ page, extensao }) => {
  await abrirAnki(page, extensao, { gravado: { pm_tema: 'claro' } });
  await expect(listaDeEnvios(page).getByRole('option')).toHaveCount(5);

  await expect(ilha(page)).toHaveScreenshot('anki-claro.png');
});

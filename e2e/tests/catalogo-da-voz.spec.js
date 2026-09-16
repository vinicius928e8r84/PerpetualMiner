'use strict';

// Passo 1 do redesign: o catálogo da Voz como módulo e um detector de idioma só.
//
// O catálogo é exercitado onde ele vai ser usado de verdade — numa página da
// extensão e no service worker — e não como um módulo Node solto.

const { test, expect } = require('../fixtures');

const FRASE_RUSSA = 'Я улыбаюсь каждое утро без причины.';

/** Percorre o catálogo e pede cada texto, com 2 em todo valor de modelo. */
const PEDIR_TODOS_OS_TEXTOS = () => {
  const { CATALOGO_DA_VOZ, textoDaVoz } = PerpetualMiner;
  const pedidos = [];

  const pedir = (id, modelo) => {
    const nomes = [...modelo.matchAll(/\{([^{}]+)\}/g)].map(m => m[1].split('|')[0]);
    const valores = Object.fromEntries(nomes.map(nome => [nome, 2]));
    pedidos.push({ id, modelo, resultado: textoDaVoz(id, valores) });
  };

  for (const [id, entrada] of Object.entries(CATALOGO_DA_VOZ)) {
    if (typeof entrada === 'string') pedir(id, entrada);
    else for (const parte of Object.keys(entrada)) pedir(`${id}.${parte}`, entrada[parte]);
  }
  return pedidos;
};

test('todo ID do catálogo tem texto, e um ID que não existe falha na hora', async ({ page, extensao }) => {
  await page.goto(extensao.url('painel.html'));

  const pedidos = await page.evaluate(PEDIR_TODOS_OS_TEXTOS);

  // O catálogo da Voz tem 159 estados-chave (docs/design/voz/README.md).
  const ids = new Set(pedidos.map(p => p.id.split('.')[0]));
  expect(ids.size).toBe(159);

  // Nada volta com um modelo por preencher, e só o silêncio deliberado volta vazio.
  for (const { id, modelo, resultado } of pedidos) {
    expect(resultado, `${id} deixou um modelo sem valor`).not.toMatch(/[{}]/);
    if (modelo !== '') expect(resultado, `${id} veio vazio`).not.toBe('');
  }

  const erro = await page.evaluate(() => {
    try {
      PerpetualMiner.textoDaVoz('POP-99');
      return null;
    } catch (e) { return e.message; }
  });
  expect(erro).toContain('POP-99');
});

test('os números do catálogo saem no formato PT-BR', async ({ page, extensao }) => {
  await page.goto(extensao.url('painel.html'));

  const textos = await page.evaluate(() => {
    const { textoDaVoz } = PerpetualMiner;
    return {
      total: textoDaVoz('PAI-05', { n: 1284 }),
      umaSo: textoDaVoz('PAI-05', { n: 1 }),
      paginacao: textoDaVoz('PAI-07', { inicio: 1, fim: 10, total: 1284 }),
      lendo: textoDaVoz('FOT-07', { n: 2, total: 5 }),
    };
  });

  expect(textos).toEqual({
    total: '1.284 frases',
    umaSo: '1 frase',
    paginacao: '1–10 de 1.284',
    lendo: 'Lendo a foto 2 de 5…',
  });
});

test('o content script também detecta o idioma pela base compartilhada', async ({ page, paginas, extensao }) => {
  await extensao.gravarStorage({
    pm_atalho: { type: 'keyboard', code: 'KeyE', altKey: true, ctrlKey: false, shiftKey: false },
  });
  await page.goto(paginas.url('texto.html'));
  await page.locator('#trecho').evaluate((el, frase) => { el.textContent = frase; }, FRASE_RUSSA);

  await page.locator('#trecho').selectText();
  await page.keyboard.press('Alt+KeyE');

  await expect.poll(async () => (await extensao.frases()).map(f => f.idioma)).toEqual(['Russo']);
});

test('o menu de contexto mostra MIN-08, lido do catálogo', async ({ extensao }) => {
  // O Chromium não abre o menu de contexto nativo para o Playwright, então o teste
  // olha o título que a extensão entrega ao Chrome ao registrar o item.
  const titulos = await extensao.serviceWorker.evaluate(async () => {
    const registrados = [];
    const original = chrome.contextMenus.create;
    chrome.contextMenus.create = props => { registrados.push(props); };
    try { await registrarMenuDeContexto(); } finally { chrome.contextMenus.create = original; }
    return registrados.map(item => item.title);
  });

  expect(titulos).toEqual(['Minerar com PerpetualMiner']);
});

test('o mesmo texto minerado pelo menu, pelo popup e pela foto grava o mesmo idioma', async ({ page, extensao, fakes }) => {
  // 1. Menu de contexto, no service worker. O Playwright não abre o menu nativo,
  //    então o teste entrega ao handler o mesmo `info` que o Chrome entregaria.
  await extensao.serviceWorker.evaluate(frase => minerarSelecaoDoMenu(
    { menuItemId: 'minerar-perpetualminer', selectionText: frase, pageUrl: 'https://exemplo.dev/artigo' },
    { title: 'Artigo de exemplo', url: 'https://exemplo.dev/artigo' },
  ), FRASE_RUSSA);

  // 2. Popup: a mineração rápida.
  await page.goto(extensao.url('popup.html'));
  await page.locator('#txtManual').fill(FRASE_RUSSA);
  await page.locator('#btnAddManual').click();

  // 3. Minerar de uma foto.
  await extensao.gravarStorage({ geminiApiKey: 'chave-de-teste' });
  fakes.gemini.responderFrases([FRASE_RUSSA]);
  await page.goto(extensao.url('bookreader.html'));
  await page.locator('#file-input').setInputFiles({ name: 'pagina.png', mimeType: 'image/png', buffer: PNG_1X1 });
  await page.locator('#btn-analisar').click();
  await expect(page.locator('.result-item')).toHaveCount(1);
  await page.locator('#btn-salvar').click();

  await expect.poll(async () => (await extensao.frases()).filter(f => f.texto === FRASE_RUSSA).length).toBe(3);
  const gravadas = (await extensao.frases()).filter(f => f.texto === FRASE_RUSSA);
  expect(gravadas.map(f => f.streaming).sort()).toEqual(['livro', 'manual', 'web']);
  expect(gravadas.map(f => f.idioma)).toEqual(['Russo', 'Russo', 'Russo']);
});

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

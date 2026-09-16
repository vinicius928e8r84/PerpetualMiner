'use strict';

// Base Veio: os ícones da toolbar, o arquivo único de tokens, as fontes
// empacotadas e o cursor ouro. Os testes afirmam o que a pessoa vê nas páginas
// reais da extensão desempacotada.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { test, expect } = require('../fixtures');

const RAIZ = path.resolve(__dirname, '../..');
const ASSETS_DA_MARCA = path.join(RAIZ, 'docs/design/identidade-veio/assets');
const TAMANHOS = [16, 32, 48, 128];
const PAGINAS_DA_EXTENSAO = ['painel.html', 'popup.html', 'bookreader.html'];
const FRASE_RUSSA = 'Тихая гавань проснулась раньше чаек.';

const digest = bytes => crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex');

/** Lê um recurso da extensão pelo service worker e devolve os bytes. */
const lerRecurso = (extensao, caminho) =>
  extensao.serviceWorker.evaluate(async url => {
    const resposta = await fetch(url);
    return Array.from(new Uint8Array(await resposta.arrayBuffer()));
  }, extensao.url(caminho));

/** Largura do texto em duas famílias, mais o estado de carregamento da fonte. */
const medirTexto = (page, familia, texto) =>
  page.evaluate(async ([familia, texto]) => {
    document.fonts.load(`400 40px "${familia}"`, texto);
    await document.fonts.ready;
    const medir = pilha => {
      const span = document.createElement('span');
      span.textContent = texto;
      span.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:400 40px ${pilha}`;
      document.body.appendChild(span);
      const largura = span.getBoundingClientRect().width;
      span.remove();
      return largura;
    };
    return {
      carregada: document.fonts.check(`400 40px "${familia}"`, texto),
      comAFonte: medir(`"${familia}", monospace`),
      semAFonte: medir('monospace'),
    };
  }, [familia, texto]);

test('o manifest e a toolbar usam os PNG da Veio', async ({ extensao }) => {
  const manifesto = await extensao.serviceWorker.evaluate(() => chrome.runtime.getManifest());

  const esperado = Object.fromEntries(TAMANHOS.map(t => [String(t), `veio/icones/icone-${t}.png`]));
  expect(manifesto.icons).toEqual(esperado);
  expect(manifesto.action.default_icon).toEqual(esperado);

  for (const tamanho of TAMANHOS) {
    const bytes = await lerRecurso(extensao, `veio/icones/icone-${tamanho}.png`);
    expect(digest(bytes)).toBe(digest(fs.readFileSync(path.join(ASSETS_DA_MARCA, `icone-${tamanho}.png`))));

    // Cabeçalho IHDR do PNG: assinatura e as dimensões declaradas.
    const png = Buffer.from(bytes);
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(png.readUInt32BE(16)).toBe(tamanho);
    expect(png.readUInt32BE(20)).toBe(tamanho);
  }
});

test('o ícone legado do raio ciano não está mais na extensão', async ({ extensao }) => {
  expect(fs.existsSync(path.join(RAIZ, 'icon.svg'))).toBe(false);

  for (const pagina of PAGINAS_DA_EXTENSAO) {
    const html = fs.readFileSync(path.join(RAIZ, pagina), 'utf8');
    expect(html.toLowerCase()).not.toContain('#00ffff');
  }
  expect(await lerRecurso(extensao, 'veio/icones/icone.svg')).not.toHaveLength(0);
});

for (const pagina of PAGINAS_DA_EXTENSAO) {
  test(`${pagina} carrega o mesmo arquivo de tokens, com o escuro como padrão`, async ({ page, extensao }) => {
    await page.goto(extensao.url(pagina));

    const tokens = await page.evaluate(() => {
      const estilo = getComputedStyle(document.documentElement);
      const ler = nome => estilo.getPropertyValue(nome).trim();
      return {
        bg: ler('--veio-bg'),
        surface: ler('--veio-surface'),
        text: ler('--veio-text'),
        accent: ler('--veio-accent'),
        raio: ler('--veio-raio-card'),
        fonte: ler('--veio-fonte-ui'),
        folhas: [...document.styleSheets].map(f => (f.href || '').split('/').pop()),
      };
    });

    expect(tokens.folhas).toContain('tokens.css');
    expect(tokens.bg).toBe('#121110');
    expect(tokens.surface).toBe('#1B1A17');
    expect(tokens.text).toBe('#F2EEE6');
    expect(tokens.accent).toBe('#F5B83D');
    expect(tokens.raio).toBe('14px');
    expect(tokens.fonte).toContain('Manrope');
  });

  test(`${pagina} não pede nada ao Google Fonts`, async ({ page, extensao }) => {
    const paraFora = [];
    page.on('request', req => {
      if (/fonts\.(googleapis|gstatic)\.com/.test(req.url())) paraFora.push(req.url());
    });

    await page.goto(extensao.url(pagina));
    await page.evaluate(() => document.fonts.ready);

    expect(paraFora).toEqual([]);
  });
}

test('uma frase em russo renderiza em Manrope, sem fonte substituta', async ({ page, extensao }) => {
  await page.goto(extensao.url('painel.html'));

  const manrope = await medirTexto(page, 'Manrope', FRASE_RUSSA);
  expect(manrope.carregada).toBe(true);
  expect(Math.abs(manrope.comAFonte - manrope.semAFonte)).toBeGreaterThan(1);

  const mono = await medirTexto(page, 'JetBrains Mono', '12 из 20');
  expect(mono.carregada).toBe(true);
});

test('os tokens do tema claro existem e trocam a página inteira', async ({ page, extensao }) => {
  await page.goto(extensao.url('painel.html'));

  const claro = await page.evaluate(() => {
    document.documentElement.dataset.tema = 'claro';
    const estilo = getComputedStyle(document.documentElement);
    return {
      bg: estilo.getPropertyValue('--veio-bg').trim(),
      text: estilo.getPropertyValue('--veio-text').trim(),
      accent: estilo.getPropertyValue('--veio-accent').trim(),
    };
  });

  expect(claro).toEqual({ bg: '#F7F4EE', text: '#1C1A16', accent: '#F0AE2E' });
});

test('o cursor ouro depois do nome pisca a cada 1,1 s', async ({ page, extensao }) => {
  await page.goto(extensao.url('popup.html'));

  const cursor = page.locator('.veio-cursor');
  await expect(cursor).toBeVisible();
  await expect(cursor).toHaveCSS('animation-duration', '1.1s');
  await expect(cursor).toHaveCSS('animation-timing-function', 'steps(1)');
  await expect(cursor).toHaveCSS('animation-iteration-count', 'infinite');
});

test('com movimento reduzido, o cursor fica parado', async ({ page, extensao }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(extensao.url('popup.html'));

  const cursor = page.locator('.veio-cursor');
  await expect(cursor).toBeVisible();
  await expect(cursor).toHaveCSS('animation-name', 'none');
});

test('a vitrine mostra os tokens e a escala de tipo nos dois temas, com uma frase em russo', async ({ page, paginas }) => {
  await page.goto(paginas.url('vitrine.html'));

  const escuro = page.locator('[data-tema="escuro"]');
  const claro = page.locator('[data-tema="claro"]');
  await expect(escuro).toBeVisible();
  await expect(claro).toBeVisible();

  for (const tema of [escuro, claro]) {
    await expect(tema.getByText('--veio-accent', { exact: true })).toBeVisible();
    await expect(tema.getByText('Display', { exact: true })).toBeVisible();
    await expect(tema.getByText('Frase', { exact: true })).toBeVisible();
    await expect(tema.getByText(FRASE_RUSSA).first()).toBeVisible();
  }

  const fundos = await page.evaluate(() => [...document.querySelectorAll('[data-tema]')]
    .map(no => getComputedStyle(no).backgroundColor));
  expect(new Set(fundos).size).toBe(2);

  const manrope = await medirTexto(page, 'Manrope', FRASE_RUSSA);
  expect(manrope.carregada).toBe(true);
});

test('a vitrine também não pede nada ao Google Fonts', async ({ page, paginas }) => {
  const paraFora = [];
  page.on('request', req => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(req.url())) paraFora.push(req.url());
  });

  await page.goto(paginas.url('vitrine.html'));
  await page.evaluate(() => document.fonts.ready);

  expect(paraFora).toEqual([]);
});

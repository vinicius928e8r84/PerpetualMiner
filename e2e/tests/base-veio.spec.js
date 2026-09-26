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

/**
 * Como a página renderiza este texto com a fonte que ela própria usa.
 *
 * Mede um trecho que herda o estilo da página, sem forçar família nenhuma, e
 * compara com o mesmo trecho forçado à fonte do sistema: se as duas larguras
 * batem, a página caiu numa fonte substituta.
 */
const comoAPaginaRenderiza = (page, texto) =>
  page.evaluate(async texto => {
    // O subset só é buscado quando alguém pede este texto nesta família.
    await document.fonts.load(`400 40px ${getComputedStyle(document.body).fontFamily}`, texto);
    await document.fonts.ready;

    const medir = estiloExtra => {
      const span = document.createElement('span');
      span.textContent = texto;
      span.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font-size:40px;${estiloExtra}`;
      document.body.appendChild(span);
      const { width } = span.getBoundingClientRect();
      const familia = getComputedStyle(span).fontFamily;
      span.remove();
      return { width, familia };
    };

    const daPagina = medir('');
    return {
      familia: daPagina.familia,
      larguraDaPagina: daPagina.width,
      larguraDoSistema: medir('font-family:system-ui,sans-serif').width,
      carregada: document.fonts.check('400 40px Manrope', texto),
    };
  }, texto);

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

test('a marca das páginas é a da Veio, e o icon.svg legado saiu', async ({ page, extensao }) => {
  expect(fs.existsSync(path.join(RAIZ, 'icon.svg'))).toBe(false);
  expect(await lerRecurso(extensao, 'veio/icones/icone.svg')).not.toHaveLength(0);

  for (const pagina of PAGINAS_DA_EXTENSAO) {
    await page.goto(extensao.url(pagina));
    const marca = page.locator('img.veio-marca');
    await expect(marca).toBeVisible();
    await expect(marca).toHaveJSProperty('complete', true);
    expect(await marca.evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
    expect(new URL(await marca.getAttribute('src'), extensao.url('')).pathname)
      .toBe('/veio/icones/icone.svg');
  }
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

for (const pagina of PAGINAS_DA_EXTENSAO) {
  test(`em ${pagina}, uma frase em russo renderiza em Manrope, sem fonte substituta`, async ({ page, extensao }) => {
    await page.goto(extensao.url(pagina));

    const russo = await comoAPaginaRenderiza(page, FRASE_RUSSA);
    expect(russo.familia).toContain('Manrope');
    expect(russo.carregada).toBe(true);
    expect(Math.abs(russo.larguraDaPagina - russo.larguraDoSistema)).toBeGreaterThan(1);

    // A mesma frase em latim, para a fonte da página não ser Manrope só no
    // cirílico (ou vice-versa).
    const latim = await comoAPaginaRenderiza(page, 'A frase fica no histórico');
    expect(Math.abs(latim.larguraDaPagina - latim.larguraDoSistema)).toBeGreaterThan(1);
  });
}

test('os números e atalhos têm JetBrains Mono empacotada, com cirílico', async ({ page, extensao }) => {
  await page.goto(extensao.url('painel.html'));

  const carregada = await page.evaluate(async () => {
    await document.fonts.load('400 40px "JetBrains Mono"', '12 из 20');
    await document.fonts.ready;
    return document.fonts.check('400 40px "JetBrains Mono"', '12 из 20');
  });

  expect(carregada).toBe(true);
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

for (const pagina of PAGINAS_DA_EXTENSAO) {
  test(`com movimento reduzido, nada pulsa nem pisca em ${pagina}`, async ({ page, extensao }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(extensao.url(pagina));

    // Um spinner como os das telas legadas, que só aparece depois que a
    // página começa a trabalhar: ele também tem de ficar parado.
    await page.evaluate(() => {
      const estilo = document.createElement('style');
      estilo.textContent = '@keyframes girar-teste { to { transform: rotate(360deg); } }';
      document.head.appendChild(estilo);
      const spinner = document.createElement('div');
      spinner.id = 'spinner-de-teste';
      spinner.style.cssText = 'width:20px;height:20px;animation:girar-teste .8s linear infinite';
      document.body.appendChild(spinner);
    });

    // Tudo o que anima termina logo; o que ainda roda depois disso pulsa,
    // pisca ou gira na frente da pessoa.
    const aindaEmMovimento = await page.evaluate(async () => {
      const descrever = animacao => {
        const alvo = animacao.effect && animacao.effect.target;
        return `${animacao.animationName || animacao.id} em ${alvo ? alvo.id || alvo.className || alvo.tagName : '?'}`;
      };
      const terminou = animacao => animacao.finished.then(() => true, () => true);
      const prazo = new Promise(resolve => setTimeout(resolve, 300));
      await Promise.race([Promise.all(document.getAnimations().map(terminou)), prazo]);
      // Com movimento reduzido, a base encurta toda transição para 1 ms. Uma
      // que começa bem na hora da leitura (o ponto da Conexão quando o
      // /health responde) ainda aparece rodando, mas não se vê: só conta o
      // que dura mais que isso, como o spinner infinito lá de cima.
      const seMexeNaTela = animacao => animacao.effect.getComputedTiming().activeDuration > 1;
      return document.getAnimations()
        .filter(animacao => animacao.playState === 'running' && seMexeNaTela(animacao))
        .map(descrever);
    });

    expect(aindaEmMovimento).toEqual([]);
  });
}

test('o teclado vê onde está: os controles do popup mostram o anel ouro', async ({ page, extensao }) => {
  await page.goto(extensao.url('popup.html'));

  const botao = page.getByRole('button', { name: 'Abrir painel' });
  await botao.focus();

  await expect(botao).toHaveCSS('outline-color', 'rgb(245, 184, 61)');
  await expect(botao).toHaveCSS('outline-style', 'solid');
  await expect(botao).toHaveCSS('outline-width', '2px');
});

for (const pagina of PAGINAS_DA_EXTENSAO) {
  test(`em ${pagina}, todo controle alcançado pelo Tab mostra onde o foco está`, async ({ page, extensao }) => {
    await page.goto(extensao.url(pagina));

    // O que desenha foco: o anel da Veio ou o foco próprio de uma superfície
    // (borda, sombra, fundo). Um controle focado que não muda nada disso
    // deixa a pessoa sem saber onde o teclado está.
    await page.evaluate(() => {
      // Lido depois que as transições de foco terminam, como a pessoa vê.
      window.desenhoDoFoco = async no => {
        await Promise.all(no.getAnimations().map(animacao => animacao.finished.catch(() => {})));
        const estilo = getComputedStyle(no);
        const anel = estilo.outlineStyle !== 'none' && parseFloat(estilo.outlineWidth) > 0
          ? `${estilo.outlineStyle} ${estilo.outlineWidth} ${estilo.outlineColor}`
          : 'sem anel';
        return [anel, estilo.boxShadow, estilo.borderColor, estilo.backgroundColor].join(' | ');
      };
    });

    // Percorre a página pelo teclado e guarda como cada controle aparece focado.
    const focados = [];
    for (let ordem = 0; ordem < 60; ordem += 1) {
      await page.keyboard.press('Tab');
      const focado = await page.evaluate(async ordem => {
        const no = document.activeElement;
        if (!no || no === document.body || no.dataset.focoDeTeste) return null;
        no.dataset.focoDeTeste = String(ordem);
        return {
          controle: no.id || `${no.tagName.toLowerCase()}.${no.className}`,
          desenho: await window.desenhoDoFoco(no),
        };
      }, ordem);
      if (!focado) break;
      focados.push(focado);
    }

    // Sem foco nenhum, o mesmo controle tem de parecer diferente.
    const desfocados = await page.evaluate(() => {
      document.activeElement.blur();
      return Promise.all([...document.querySelectorAll('[data-foco-de-teste]')]
        .sort((a, b) => a.dataset.focoDeTeste - b.dataset.focoDeTeste)
        .map(no => window.desenhoDoFoco(no)));
    });

    const semFoco = focados
      .filter((focado, i) => focado.desenho === desfocados[i])
      .map(focado => focado.controle);

    expect(focados.length).toBeGreaterThan(0);
    expect(semFoco).toEqual([]);
  });
}

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

  const russo = await comoAPaginaRenderiza(page, FRASE_RUSSA);
  expect(russo.familia).toContain('Manrope');
  expect(russo.carregada).toBe(true);
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

'use strict';

// O overlay na página (#40): um componente Veio só, em Shadow DOM — o botão
// flutuante e a pílula de feedback, que espera a resposta do service worker e
// só diz o que foi confirmado. A linha ouro sob o texto é de #41.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../fixtures');

const LEGENDA = 'The quiet harbor woke before the gulls did.';
const TRECHO = 'Every lantern along the pier flickered in the salt wind.';

const MIN_01 = 'Frase minerada e copiada · Inglês';
const MIN_02 = 'Frase minerada · não deu para copiar';
const MIN_03 = 'Não deu para minerar a frase. Tente de novo.';
const MIN_04 = 'Nenhuma legenda na tela agora. Ative as legendas do vídeo e tente de novo.';
const MIN_05 = 'Frase minerada · Inglês';
const MIN_10 = 'Esta página não tem vídeo com legenda.';
const FRASE_RUSSA = 'Я улыбаюсь';
const MIN_06_RUSSO_5_DE_20 = 'Mineração automática · Russo · 5 de 20 hoje';

const SELECAO_EM_ALT_E = { type: 'keyboard', code: 'KeyE', altKey: true, ctrlKey: false, shiftKey: false };
const LEGENDA_EM_SHIFT_S = { type: 'keyboard', code: 'KeyS', altKey: false, ctrlKey: false, shiftKey: true };

const botaoFlutuante = (page, nome = 'Minerar legenda (Alt+S)') => page.getByRole('button', { name: nome, exact: true });
const feedback = page => page.getByRole('status');

async function abrirPlayer(page, paginas, pagina = 'player.html') {
  await page.goto(paginas.url(pagina));
  await expect(botaoFlutuante(page)).toBeVisible();
}

async function permitirClipboard(context, paginas) {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: paginas.origem });
}

/** Serve `pagina` com uma Permissions-Policy que recusa o clipboard ao documento (o caso real de um site que o bloqueia). */
async function recusarClipboardEm(page, url) {
  await page.route(url, async route => {
    const resposta = await route.fetch();
    await route.fulfill({ response: resposta, headers: { ...resposta.headers(), 'permissions-policy': 'clipboard-write=()' } });
  });
}

// Falhas do armazenamento do service worker. Não há rede entre o service worker e o
// `chrome.storage`, então a falha é injetada na própria fronteira: o `set`
// passa a recusar (ou a segurar) a gravação, e o teste afirma o que a pessoa vê
// e o que fica gravado depois que a fronteira volta ao normal.
const recusarGravacoes = extensao => extensao.serviceWorker.evaluate(() => {
  globalThis.__setOriginal ??= chrome.storage.local.set;
  chrome.storage.local.set = () => { throw new Error('QUOTA_BYTES quota exceeded'); };
});

const segurarGravacoes = extensao => extensao.serviceWorker.evaluate(() => {
  globalThis.__setOriginal ??= chrome.storage.local.set;
  globalThis.__seguradas = [];
  chrome.storage.local.set = (valores, callback) => new Promise(resolve => {
    globalThis.__seguradas.push(() => globalThis.__setOriginal.call(chrome.storage.local, valores)
      .then(() => { callback?.(); resolve(); }));
  });
});

const voltarGravacoes = extensao => extensao.serviceWorker.evaluate(() => {
  if (globalThis.__setOriginal) chrome.storage.local.set = globalThis.__setOriginal;
  for (const soltar of globalThis.__seguradas || []) soltar();
  globalThis.__seguradas = [];
});

const textosGravados = async extensao => (await extensao.frases()).map(f => f.texto);

/**
 * O `--veio-text` do tema escuro, lido de veio/tokens.css: a cor mora lá, e um
 * valor repetido aqui passaria a mentir no dia em que o token mudasse.
 */
function textoDoEscuro() {
  const css = fs.readFileSync(path.join(__dirname, '..', '..', 'veio', 'tokens.css'), 'utf8');
  const inicioDoClaro = css.indexOf('[data-tema="claro"]');
  if (inicioDoClaro < 0) throw new Error('o tema claro não foi encontrado em veio/tokens.css');
  const achado = css.slice(0, inicioDoClaro).match(/--veio-text:\s*(#[0-9A-Fa-f]{6})/);
  if (!achado) throw new Error('--veio-text não encontrado no tema escuro de veio/tokens.css');
  const [, r, g, b] = achado[1].match(/#(..)(..)(..)/);
  return `rgb(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)})`;
}

/** A meta da pílula: o idioma da captura, em mono. */
const metaDaPilula = (page, sigla) => feedback(page).getByText(sigla, { exact: true });

// ─── O botão flutuante ───────────────────────────────────────────────────────

test('o botão flutuante é o azulejo Veio num círculo de 46 px, com o rótulo MIN-07 e o atalho gravado', async ({ page, paginas }) => {
  await abrirPlayer(page, paginas);
  const botao = botaoFlutuante(page);

  const caixa = await botao.boundingBox();
  expect(Math.round(caixa.width)).toBe(46);
  expect(Math.round(caixa.height)).toBe(46);
  expect(await botao.evaluate(no => getComputedStyle(no).borderRadius)).toBe('50%');

  // O rótulo visível aparece ao passar o mouse, com o atalho num kbd.
  const rotulo = page.getByText('Minerar legenda', { exact: true });
  await expect(rotulo).toBeHidden();
  await botao.hover();
  await expect(rotulo).toBeVisible();
  await expect(page.locator('kbd', { hasText: 'Alt+S' })).toBeVisible();
});

test('o rótulo do botão acompanha o atalho gravado, sem recarregar', async ({ page, paginas, extensao }) => {
  await abrirPlayer(page, paginas);

  await extensao.gravarStorage({ pm_atalho_legenda: { type: 'keyboard', code: 'KeyK', altKey: false, ctrlKey: true, shiftKey: true } });
  await expect(botaoFlutuante(page, 'Minerar legenda (Ctrl+Shift+K)')).toBeVisible();

  await extensao.gravarStorage({ pm_atalho_legenda: null });
  await expect(botaoFlutuante(page, 'Minerar legenda')).toBeVisible();
});

test('o botão chega pelo teclado, com o foco visível, e Enter minera a legenda', async ({ page, paginas, extensao }) => {
  await abrirPlayer(page, paginas);

  await page.keyboard.press('Tab');
  const botao = botaoFlutuante(page);
  await expect(botao).toBeFocused();
  expect(await botao.evaluate(no => getComputedStyle(no).outlineStyle)).toBe('solid');

  await page.keyboard.press('Enter');
  await expect.poll(() => textosGravados(extensao)).toEqual([LEGENDA]);
  await expect(feedback(page)).toContainText(LEGENDA);
});

// ─── O caminho feliz ─────────────────────────────────────────────────────────

test('Alt+S minera e copia: a pílula diz MIN-01 com a frase e some sozinha em ~3,5 s', async ({ page, context, paginas, extensao }) => {
  await permitirClipboard(context, paginas);
  await abrirPlayer(page, paginas);

  await page.keyboard.press('Alt+KeyS');

  await expect(feedback(page)).toContainText(MIN_01);
  await expect(feedback(page)).toContainText(LEGENDA);
  // A meta: o idioma da captura, em mono, no fim da pílula.
  await expect(metaDaPilula(page, 'EN')).toBeVisible();
  expect(await metaDaPilula(page, 'EN').evaluate(no => getComputedStyle(no).fontFamily)).toMatch(/^"?JetBrains Mono/);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(LEGENDA);
  expect(await textosGravados(extensao)).toEqual([LEGENDA]);

  // Sucesso some sozinho: ainda está lá aos 2,5 s e já saiu antes dos 5 s.
  await page.waitForTimeout(2500);
  await expect(page.getByText(MIN_01)).toBeVisible();
  await expect(page.getByText(MIN_01)).toBeHidden({ timeout: 2500 });
  // Sem × num sucesso.
  await expect(page.getByRole('button', { name: 'Fechar' })).toHaveCount(0);
});

test('a Palavra que o service worker devolve aparece grifada na pílula', async ({ page, context, paginas, fakes }) => {
  fakes.anki.definirVocabulario('en', ['quiet', 'harbor', 'woke']);
  await permitirClipboard(context, paginas);
  await abrirPlayer(page, paginas);

  await page.keyboard.press('Alt+KeyS');

  await expect(feedback(page).locator('mark')).toHaveText('gulls');
});

test('enquanto o service worker não responde, a pílula não afirma nada; quando ele grava, diz MIN-01', async ({ page, context, paginas, extensao }) => {
  await permitirClipboard(context, paginas);
  await abrirPlayer(page, paginas);
  await segurarGravacoes(extensao);

  await page.keyboard.press('Alt+KeyS');
  await page.waitForTimeout(1000);
  await expect(page.getByText(MIN_01)).toHaveCount(0);
  await expect(page.getByText(MIN_03)).toHaveCount(0);

  await voltarGravacoes(extensao);
  await expect(feedback(page)).toContainText(MIN_01);
  expect(await textosGravados(extensao)).toEqual([LEGENDA]);
});

test('o atalho de seleção numa página sem vídeo: MIN-05 na pílula livre, no canto inferior direito', async ({ page, paginas, extensao }) => {
  await extensao.gravarStorage({ pm_atalho: SELECAO_EM_ALT_E });
  await page.goto(paginas.url('texto.html'));

  await page.locator('#trecho').selectText();
  await page.keyboard.press('Alt+KeyE');

  await expect(feedback(page)).toContainText(MIN_05);
  // A frase é longa: a prévia de uma linha começa perto da Palavra, que nunca é cortada.
  await expect(feedback(page)).toContainText('the salt wind.');
  const palavra = await feedback(page).locator('mark').textContent();
  expect(TRECHO).toContain(palavra);
  await expect(feedback(page).locator('mark')).toBeVisible();
  expect(await textosGravados(extensao)).toEqual([TRECHO]);

  const caixa = await feedback(page).boundingBox();
  const janela = page.viewportSize();
  expect(caixa.x + caixa.width).toBeGreaterThan(janela.width - 120);
  expect(caixa.y + caixa.height).toBeGreaterThan(janela.height - 120);
  // Sem vídeo não há botão: a pílula some por inteiro.
  await expect(botaoFlutuante(page)).toHaveCount(0);
  await expect(page.getByText(MIN_05)).toBeHidden({ timeout: 5000 });
});

test('o atalho de seleção sem nada selecionado numa página sem vídeo diz MIN-10 e não grava nada', async ({ page, paginas, extensao }) => {
  await extensao.gravarStorage({ pm_atalho: SELECAO_EM_ALT_E });
  await page.goto(paginas.url('sem-video.html'));

  await page.keyboard.press('Alt+KeyE');

  await expect(feedback(page)).toContainText(MIN_10);
  await page.waitForTimeout(800);
  expect(await extensao.frases()).toEqual([]);
});

test('o atalho de seleção sem nada selecionado num player não afirma nada', async ({ page, paginas, extensao }) => {
  await extensao.gravarStorage({ pm_atalho: SELECAO_EM_ALT_E });
  await abrirPlayer(page, paginas);

  await page.keyboard.press('Alt+KeyE');

  await page.waitForTimeout(800);
  await expect(feedback(page)).toHaveText('');
  expect(await extensao.frases()).toEqual([]);
});

test('um player em iframe de outra origem: a cópia pelo frame de cima só é afirmada quando dá certo (MIN-01)', async ({ page, context, paginas, extensao }) => {
  await permitirClipboard(context, paginas);
  await page.goto(paginas.url(`player-em-iframe.html?player=${encodeURIComponent(paginas.urlCruzada('player.html'))}`));
  const player = page.frameLocator('#player');
  await expect(botaoFlutuante(player)).toBeVisible();

  await player.locator('video').click();
  await page.keyboard.press('Alt+KeyS');

  await expect(feedback(player)).toContainText(MIN_01);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(LEGENDA);
  expect(await textosGravados(extensao)).toEqual([LEGENDA]);
});

test('com o foco no frame de cima e o player num iframe de outra origem, Alt+S não diz que a página não tem vídeo', async ({ page, paginas, extensao }) => {
  await page.goto(paginas.url(`player-em-iframe.html?player=${encodeURIComponent(paginas.urlCruzada('player.html'))}`));
  await expect(botaoFlutuante(page.frameLocator('#player'))).toBeVisible();

  await page.keyboard.press('Alt+KeyS');

  await page.waitForTimeout(1000);
  await expect(page.getByText(MIN_10)).toHaveCount(0);
  expect(await extensao.frases()).toEqual([]);
});

test('uma página sem vídeo, nem nos iframes, diz MIN-10 com o foco no frame de cima', async ({ page, paginas, extensao }) => {
  await page.goto(paginas.url(`player-em-iframe.html?player=${encodeURIComponent(paginas.urlCruzada('sem-video.html'))}`));
  await expect(page.frameLocator('#player').getByText('Nothing to watch here')).toBeVisible();

  await page.keyboard.press('Alt+KeyS');

  await expect(feedback(page)).toContainText(MIN_10);
  await page.waitForTimeout(800);
  expect(await extensao.frases()).toEqual([]);
});

test('um vídeo de anúncio escondido num iframe não conta: a página sem player diz MIN-10', async ({ page, paginas, extensao }) => {
  await page.goto(paginas.url(`player-em-iframe.html?player=${encodeURIComponent(paginas.urlCruzada('video-escondido.html'))}`));
  await expect(page.frameLocator('#player').getByText('Sponsored')).toBeVisible();

  await page.keyboard.press('Alt+KeyS');

  await expect(feedback(page)).toContainText(MIN_10);
  expect(await extensao.frases()).toEqual([]);
});

// ─── Os bugs de #9 que este passo fecha ──────────────────────────────────────

test('bug de #9: o atalho de legenda digitado num campo de texto entra no campo e nada é minerado', async ({ page, paginas, extensao }) => {
  await extensao.gravarStorage({ pm_atalho_legenda: LEGENDA_EM_SHIFT_S });
  await page.goto(paginas.url('player-com-campos.html'));
  await expect(botaoFlutuante(page, 'Minerar legenda (Shift+S)')).toBeVisible();

  for (const campo of ['#campo', '#area', '#editavel']) {
    await page.locator(campo).click();
    await page.keyboard.press('Shift+KeyS');
  }

  await expect(page.locator('#campo')).toHaveValue('S');
  await expect(page.locator('#area')).toHaveValue('S');
  await expect(page.locator('#editavel')).toHaveText('S');
  await page.waitForTimeout(800);
  expect(await extensao.frases()).toEqual([]);
  await expect(feedback(page)).toHaveText('');
});

test('bug de #9: o atalho de legenda num campo dentro de uma sombra fechada também entra no campo', async ({ page, paginas, extensao }) => {
  await extensao.gravarStorage({ pm_atalho_legenda: LEGENDA_EM_SHIFT_S });
  await page.goto(paginas.url('player-com-campos.html'));
  await expect(botaoFlutuante(page, 'Minerar legenda (Shift+S)')).toBeVisible();

  await page.evaluate(() => window.campoFechado.focus());
  await page.keyboard.press('Shift+KeyS');

  expect(await page.evaluate(() => window.campoFechado.value)).toBe('S');
  await page.waitForTimeout(800);
  expect(await extensao.frases()).toEqual([]);
  await expect(feedback(page)).toHaveText('');
});

test('bug de #9: numa página sem vídeo com legendas de imagem, Alt+S diz MIN-10 e não grava nada', async ({ page, paginas, extensao }) => {
  await page.goto(paginas.url('sem-video-com-imagens.html'));

  await page.keyboard.press('Alt+KeyS');

  await expect(feedback(page)).toContainText(MIN_10);
  await page.waitForTimeout(800);
  expect(await extensao.frases()).toEqual([]);
});

test('bug de #9: com o clipboard negado no frame de cima, a frase fica no histórico uma vez só, com MIN-02', async ({ page, paginas, extensao }) => {
  await recusarClipboardEm(page, paginas.url('player.html'));
  await abrirPlayer(page, paginas);

  await page.keyboard.press('Alt+KeyS');

  await expect(feedback(page)).toContainText(MIN_02);
  await expect(page.getByText(MIN_01)).toHaveCount(0);
  await page.waitForTimeout(1000);
  expect(await textosGravados(extensao)).toEqual([LEGENDA]);
});

// ─── As falhas ───────────────────────────────────────────────────────────────

test('o service worker falha ao gravar: MIN-03 fica na tela, e Tentar de novo repete com o mesmo texto', async ({ page, context, paginas, extensao }) => {
  await permitirClipboard(context, paginas);
  await abrirPlayer(page, paginas);
  await recusarGravacoes(extensao);

  await page.keyboard.press('Alt+KeyS');

  await expect(feedback(page)).toContainText(MIN_03);
  await expect(page.getByText(MIN_01)).toHaveCount(0);
  // A falha não some sozinha.
  await page.waitForTimeout(4500);
  await expect(page.getByText(MIN_03)).toBeVisible();
  expect(await extensao.frases()).toEqual([]);

  // A legenda já trocou: Tentar de novo repete a mesma frase, não a da tela.
  await page.locator('#legenda').evaluate(no => { no.textContent = 'A different line is on screen now.'; });
  await voltarGravacoes(extensao);
  await page.getByRole('button', { name: 'Tentar de novo' }).click();

  await expect(feedback(page)).toContainText(MIN_01);
  expect(await textosGravados(extensao)).toEqual([LEGENDA]);
});

test('a falha fecha no ×, com Esc e quando a próxima captura a substitui', async ({ page, context, paginas, extensao }) => {
  await permitirClipboard(context, paginas);
  await abrirPlayer(page, paginas);
  await recusarGravacoes(extensao);

  await page.keyboard.press('Alt+KeyS');
  await expect(page.getByText(MIN_03)).toBeVisible();
  await page.getByRole('button', { name: 'Fechar' }).click();
  await expect(page.getByText(MIN_03)).toBeHidden();

  await page.keyboard.press('Alt+KeyS');
  await expect(page.getByText(MIN_03)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText(MIN_03)).toBeHidden();

  await page.keyboard.press('Alt+KeyS');
  await expect(page.getByText(MIN_03)).toBeVisible();
  await voltarGravacoes(extensao);
  await page.keyboard.press('Alt+KeyS');
  // Uma instância por vez: o sucesso toma o lugar da falha.
  await expect(feedback(page)).toContainText(MIN_01);
  await expect(page.getByText(MIN_03)).toHaveCount(0);
  await expect(feedback(page)).toHaveCount(1);
});

test('no player sem legenda na tela, Alt+S diz MIN-04 e não grava nada', async ({ page, paginas, extensao }) => {
  await abrirPlayer(page, paginas);
  await page.locator('#legenda').evaluate(no => no.remove());

  await page.keyboard.press('Alt+KeyS');

  await expect(feedback(page)).toContainText(MIN_04);
  await page.waitForTimeout(800);
  expect(await extensao.frases()).toEqual([]);
});

// ─── Isolamento: Shadow DOM ──────────────────────────────────────────────────

test('nada do overlay entra no DOM do site fora do host, e os estilos não vazam em nenhum sentido', async ({ page, context, paginas, extensao }) => {
  await permitirClipboard(context, paginas);
  await page.goto(paginas.url('player-estilos-hostis.html'));
  const doSite = page.locator('#do-site');
  const estiloDoSite = () => doSite.evaluate(no => {
    const e = getComputedStyle(no);
    return [e.fontFamily, e.color, e.backgroundColor, e.letterSpacing, e.display].join(' | ');
  });
  const antes = await estiloDoSite();

  await expect(botaoFlutuante(page)).toBeVisible();
  await page.keyboard.press('Alt+KeyS');
  await expect(feedback(page)).toContainText(MIN_01);
  await expect.poll(() => textosGravados(extensao)).toEqual([LEGENDA]);

  // O site: nenhuma folha de estilo nova, nenhum nó novo além do host, e os
  // elementos dele pintados como antes.
  expect(await page.evaluate(() => ({
    folhas: document.styleSheets.length,
    adotadas: document.adoptedStyleSheets.length,
    hosts: [...document.querySelectorAll('*')].filter(no => no.shadowRoot).map(no => no.localName),
    doOverlayNoDom: document.querySelectorAll('[id*="minerador"], [class*="pm-"], [class*="veio-"]').length,
  }))).toEqual({ folhas: 1, adotadas: 0, hosts: ['perpetualminer-overlay'], doOverlayNoDom: 0 });
  expect(await estiloDoSite()).toBe(antes);

  // O overlay: as regras do site não o alcançam — ele usa os tokens escuros e a fonte da Veio.
  const botao = botaoFlutuante(page);
  const estiloDoBotao = await botao.evaluate(no => {
    const e = getComputedStyle(no);
    return { fundo: e.backgroundColor, raio: e.borderRadius };
  });
  expect(estiloDoBotao.fundo).not.toBe('rgb(0, 255, 0)');
  expect(estiloDoBotao.raio).toBe('50%');
  const titulo = page.getByText(MIN_01);
  const estiloDoTitulo = await titulo.evaluate(no => {
    const e = getComputedStyle(no);
    return { fonte: e.fontFamily, cor: e.color, espacamento: e.letterSpacing };
  });
  expect(estiloDoTitulo.fonte).toMatch(/^Manrope/);
  expect(estiloDoTitulo.cor).toBe(textoDoEscuro());
  expect(estiloDoTitulo.espacamento).toBe('normal');
  // A Manrope empacotada é a que desenha: a mesma linha na fonte de reserva tem outra largura.
  await expect.poll(() => titulo.evaluate(no => {
    const reserva = no.cloneNode(true);
    reserva.style.fontFamily = 'system-ui, sans-serif';
    reserva.style.position = 'absolute';
    no.after(reserva);
    const larguras = [no.getBoundingClientRect().width, reserva.getBoundingClientRect().width];
    reserva.remove();
    return Math.abs(larguras[0] - larguras[1]);
  })).toBeGreaterThan(1);
});

test('com o tema claro escolhido, o overlay continua escuro', async ({ page, context, paginas, extensao }) => {
  await permitirClipboard(context, paginas);
  await extensao.gravarStorage({ pm_tema: 'claro' });
  await abrirPlayer(page, paginas);

  await page.keyboard.press('Alt+KeyS');

  const titulo = page.getByText(MIN_01);
  await expect(titulo).toBeVisible();
  expect(await titulo.evaluate(no => getComputedStyle(no).color)).toBe(textoDoEscuro());
});

// ─── Movimento reduzido ──────────────────────────────────────────────────────

test('com prefers-reduced-motion, a pílula abre e fecha sem animação', async ({ page, context, paginas }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await permitirClipboard(context, paginas);
  await abrirPlayer(page, paginas);

  await page.keyboard.press('Alt+KeyS');
  await expect(feedback(page)).toContainText(MIN_01);

  const duracoes = await page.locator('perpetualminer-overlay').evaluate(host =>
    [...host.shadowRoot.querySelectorAll('*')].flatMap(no => {
      const e = getComputedStyle(no);
      return [e.transitionDuration, e.animationDuration].flatMap(v => v.split(',')).map(v => parseFloat(v));
    }));
  expect(Math.max(...duracoes)).toBeLessThanOrEqual(0.001);
});

test('o Esc que fecha uma falha é do overlay: o site não o recebe; sem falha, o Esc é do site', async ({ page, paginas, extensao }) => {
  await abrirPlayer(page, paginas);
  await page.evaluate(() => {
    window.escsDoSite = 0;
    document.addEventListener('keydown', evento => { if (evento.key === 'Escape') window.escsDoSite += 1; });
  });
  await recusarGravacoes(extensao);

  await page.keyboard.press('Alt+KeyS');
  await expect(page.getByText(MIN_03)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText(MIN_03)).toBeHidden();
  expect(await page.evaluate(() => window.escsDoSite)).toBe(0);

  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.escsDoSite)).toBe(1);
});

test('com uma falha aberta, o Esc digitado num campo do site é do site e a falha fica', async ({ page, paginas, extensao }) => {
  await page.goto(paginas.url('player-com-campos.html'));
  await expect(botaoFlutuante(page)).toBeVisible();
  await page.evaluate(() => {
    window.escsDoSite = 0;
    document.addEventListener('keydown', evento => { if (evento.key === 'Escape') window.escsDoSite += 1; });
  });
  await recusarGravacoes(extensao);
  await page.keyboard.press('Alt+KeyS');
  await expect(page.getByText(MIN_03)).toBeVisible();

  await page.locator('#campo').click();
  await page.keyboard.press('Escape');

  expect(await page.evaluate(() => window.escsDoSite)).toBe(1);
  await expect(page.getByText(MIN_03)).toBeVisible();
});

// ─── A mineração automática ──────────────────────────────────────────────────

test('a mineração automática minera uma linha: MIN-06 na pílula, com o contador do dia e a meta do idioma', async ({ page, paginas, extensao }) => {
  await extensao.gravarStorage({
    pm_auto_miner_settings: { en: { enabled: false, dailyLimit: 20 }, ru: { enabled: true, dailyLimit: 20 } },
    pm_auto_miner_daily: { date: hoje(), en: { count: 0 }, ru: { count: 4 } },
    // O vocabulário do Anki em cache, sem nenhuma palavra conhecida: a frase russa
    // tem um item novo só, então a mineração automática a aceita.
    pm_auto_keyword_vocab_ru: {
      cacheVersion: 2, deckName: 'RUSSIAN', createdAt: Date.now(),
      words: [], terms: [], wordInfo: {}, termInfo: {},
    },
  });
  await abrirPlayer(page, paginas);

  // A mineração automática só olha a legenda de um vídeo que está tocando.
  await page.evaluate(async frase => {
    document.querySelector('#legenda').textContent = frase;
    const tela = document.createElement('canvas');
    tela.getContext('2d').fillRect(0, 0, 1, 1);
    const video = document.querySelector('video');
    video.srcObject = tela.captureStream();
    await video.play();
  }, FRASE_RUSSA);

  await expect(feedback(page)).toContainText(MIN_06_RUSSO_5_DE_20);
  await expect(feedback(page)).toContainText(FRASE_RUSSA);
  await expect(metaDaPilula(page, 'RU')).toBeVisible();
  expect(await textosGravados(extensao)).toEqual([FRASE_RUSSA]);
  // Sucesso: some sozinho.
  await expect(page.getByText(MIN_06_RUSSO_5_DE_20)).toBeHidden({ timeout: 5000 });
});

/** O dia de hoje como a mineração automática o grava (AAAA-MM-DD, hora local). */
function hoje() {
  const agora = new Date();
  return [agora.getFullYear(), String(agora.getMonth() + 1).padStart(2, '0'), String(agora.getDate()).padStart(2, '0')].join('-');
}
